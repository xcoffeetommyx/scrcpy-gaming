#include "controller.h"

#include <assert.h>

#include "util/log.h"

// Drop droppable events above this limit
#define SC_CONTROL_MSG_QUEUE_LIMIT 60

static void
sc_controller_receiver_on_ended(struct sc_receiver *receiver, bool error,
                                void *userdata) {
    (void) receiver;

    struct sc_controller *controller = userdata;
    // Forward the event to the controller listener
    controller->cbs->on_ended(controller, error, controller->cbs_userdata);
}

bool
sc_controller_init(struct sc_controller *controller, sc_socket control_socket,
                   const struct sc_controller_callbacks *cbs,
                   void *cbs_userdata) {
    sc_vecdeque_init(&controller->queue);

    // Add 4 to support 4 non-droppable events without re-allocation
    bool ok = sc_vecdeque_reserve(&controller->queue,
                                  SC_CONTROL_MSG_QUEUE_LIMIT + 4);
    if (!ok) {
        return false;
    }

    static const struct sc_receiver_callbacks receiver_cbs = {
        .on_ended = sc_controller_receiver_on_ended,
    };

    ok = sc_receiver_init(&controller->receiver, control_socket, &receiver_cbs,
                          controller);
    if (!ok) {
        sc_vecdeque_destroy(&controller->queue);
        return false;
    }

    ok = sc_mutex_init(&controller->mutex);
    if (!ok) {
        sc_receiver_destroy(&controller->receiver);
        sc_vecdeque_destroy(&controller->queue);
        return false;
    }

    ok = sc_cond_init(&controller->msg_cond);
    if (!ok) {
        sc_receiver_destroy(&controller->receiver);
        sc_mutex_destroy(&controller->mutex);
        sc_vecdeque_destroy(&controller->queue);
        return false;
    }

    controller->control_socket = control_socket;
    controller->stopped = false;
    controller->queue_push_count = 0;
    controller->queue_pop_count = 0;
    controller->pending_gamepad_axis_mask = 0;
    controller->next_pending_gamepad_axis = 0;

    controller->resize_display.width = 0;
    controller->resize_display.height = 0;

    assert(cbs && cbs->on_ended);
    controller->cbs = cbs;
    controller->cbs_userdata = cbs_userdata;

    return true;
}

void
sc_controller_configure(struct sc_controller *controller,
                        struct sc_acksync *acksync,
                        struct sc_uhid_devices *uhid_devices) {
    controller->receiver.acksync = acksync;
    controller->receiver.uhid_devices = uhid_devices;
}

void
sc_controller_destroy(struct sc_controller *controller) {
    controller->pending_gamepad_axis_mask = 0;
    for (unsigned i = 0; i < SC_MAX_GAMEPADS; ++i) {
        controller->pending_gamepad_axis_after[i] = 0;
    }

    sc_cond_destroy(&controller->msg_cond);
    sc_mutex_destroy(&controller->mutex);

    while (!sc_vecdeque_is_empty(&controller->queue)) {
        struct sc_control_msg *msg = sc_vecdeque_popref(&controller->queue);
        assert(msg);
        sc_control_msg_destroy(msg);
    }
    sc_vecdeque_destroy(&controller->queue);

    sc_receiver_destroy(&controller->receiver);
}

static bool
sc_controller_push_msg_locked(struct sc_controller *controller,
                              const struct sc_control_msg *msg,
                              bool non_droppable) {
    bool pushed = false;

    size_t size = sc_vecdeque_size(&controller->queue);
    if (size < SC_CONTROL_MSG_QUEUE_LIMIT) {
        sc_vecdeque_push_noresize(&controller->queue, *msg);
        pushed = true;
    } else if (non_droppable) {
        bool ok = sc_vecdeque_push(&controller->queue, *msg);
        if (ok) {
            pushed = true;
        } else {
            // A non-droppable event must be dropped anyway
            LOG_OOM();
        }
    }
    // Otherwise, the msg is discarded

    if (pushed) {
        ++controller->queue_push_count;
        sc_cond_signal(&controller->msg_cond);
    }

    return pushed;
}

static unsigned
sc_controller_gamepad_index(const struct sc_control_msg *msg) {
    assert(msg->type == SC_CONTROL_MSG_TYPE_UHID_INPUT);
    assert(msg->uhid_input.id >= SC_HID_ID_GAMEPAD_FIRST);
    assert(msg->uhid_input.id <= SC_HID_ID_GAMEPAD_LAST);
    return msg->uhid_input.id - SC_HID_ID_GAMEPAD_FIRST;
}

bool
sc_controller_push_msg(struct sc_controller *controller,
                       const struct sc_control_msg *msg) {
    // RESIZE_DISPLAY messages are handled separately
    assert(msg->type != SC_CONTROL_MSG_TYPE_RESIZE_DISPLAY);

    sc_mutex_lock(&controller->mutex);

    if (msg->type == SC_CONTROL_MSG_TYPE_UHID_DESTROY
            && msg->uhid_destroy.id >= SC_HID_ID_GAMEPAD_FIRST
            && msg->uhid_destroy.id <= SC_HID_ID_GAMEPAD_LAST) {
        unsigned idx = msg->uhid_destroy.id - SC_HID_ID_GAMEPAD_FIRST;
        controller->pending_gamepad_axis_mask &= ~(1 << idx);
        controller->pending_gamepad_axis_after[idx] = 0;
    }

    bool non_droppable = !sc_control_msg_is_droppable(msg);
    bool pushed =
        sc_controller_push_msg_locked(controller, msg, non_droppable);

    sc_mutex_unlock(&controller->mutex);

    return pushed;
}

bool
sc_controller_push_gamepad_axis(struct sc_controller *controller,
                                const struct sc_control_msg *msg) {
    unsigned idx = sc_controller_gamepad_index(msg);

    sc_mutex_lock(&controller->mutex);
    controller->pending_gamepad_axis[idx] = *msg;
    controller->pending_gamepad_axis_after[idx] =
        controller->queue_push_count;
    controller->pending_gamepad_axis_mask |= 1 << idx;
    sc_cond_signal(&controller->msg_cond);
    sc_mutex_unlock(&controller->mutex);

    return true;
}

bool
sc_controller_push_gamepad_button(struct sc_controller *controller,
                                  const struct sc_control_msg *msg) {
    unsigned idx = sc_controller_gamepad_index(msg);

    sc_mutex_lock(&controller->mutex);

    // The button report contains the latest axis state, so it supersedes any
    // pending axis report. Keeping every button report preserves all edges.
    controller->pending_gamepad_axis_mask &= ~(1 << idx);
    controller->pending_gamepad_axis_after[idx] = 0;
    bool pushed = sc_controller_push_msg_locked(controller, msg, true);

    sc_mutex_unlock(&controller->mutex);

    return pushed;
}

void
sc_controller_resize_display(struct sc_controller *controller,
                             uint16_t width, uint16_t height) {
    assert(width && height);
    sc_mutex_lock(&controller->mutex);
    bool was_set = controller->resize_display.width;
    controller->resize_display.width = width;
    controller->resize_display.height = height;
    if (!was_set) {
        sc_cond_signal(&controller->msg_cond);
    }
    sc_mutex_unlock(&controller->mutex);
}

static bool
process_msg(struct sc_controller *controller,
            const struct sc_control_msg *msg, bool *eos) {
    static uint8_t serialized_msg[SC_CONTROL_MSG_MAX_SIZE];
    size_t length = sc_control_msg_serialize(msg, serialized_msg);
    if (!length) {
        *eos = false;
        return false;
    }

    ssize_t w =
        net_send_all(controller->control_socket, serialized_msg, length);
    if ((size_t) w != length) {
        *eos = true;
        return false;
    }

    return true;
}

static bool
sc_controller_find_eligible_gamepad_axis_locked(
        const struct sc_controller *controller, unsigned *out_idx) {
    for (unsigned i = 0; i < SC_MAX_GAMEPADS; ++i) {
        unsigned idx =
            (controller->next_pending_gamepad_axis + i) % SC_MAX_GAMEPADS;
        uint8_t mask = 1 << idx;
        if ((controller->pending_gamepad_axis_mask & mask)
                && controller->pending_gamepad_axis_after[idx]
                    <= controller->queue_pop_count) {
            *out_idx = idx;
            return true;
        }
    }

    return false;
}

static int
run_controller(void *data) {
    struct sc_controller *controller = data;

    bool error = false;

    for (;;) {
        sc_mutex_lock(&controller->mutex);
        while (!controller->stopped
                && !controller->resize_display.width
                && sc_vecdeque_is_empty(&controller->queue)
                && !controller->pending_gamepad_axis_mask) {
            sc_cond_wait(&controller->msg_cond, &controller->mutex);
        }
        if (controller->stopped) {
            // stop immediately, do not process further msgs
            sc_mutex_unlock(&controller->mutex);
            LOGD("Controller stopped");
            break;
        }

        bool has_resize_display = controller->resize_display.width;
        assert(has_resize_display || !sc_vecdeque_is_empty(&controller->queue)
               || controller->pending_gamepad_axis_mask);

        struct sc_control_msg msg;
        unsigned pending_gamepad_axis_idx;
        bool has_eligible_gamepad_axis =
            sc_controller_find_eligible_gamepad_axis_locked(
                controller, &pending_gamepad_axis_idx);

        if (has_resize_display) {
            msg.type = SC_CONTROL_MSG_TYPE_RESIZE_DISPLAY;
            msg.resize_display.width = controller->resize_display.width;
            msg.resize_display.height = controller->resize_display.height;
            controller->resize_display.width = 0;
            controller->resize_display.height = 0;
        } else if (has_eligible_gamepad_axis) {
            unsigned idx = pending_gamepad_axis_idx;
            uint8_t mask = 1 << idx;
            msg = controller->pending_gamepad_axis[idx];
            controller->pending_gamepad_axis_mask &= ~mask;
            controller->pending_gamepad_axis_after[idx] = 0;
            controller->next_pending_gamepad_axis =
                (idx + 1) % SC_MAX_GAMEPADS;
        } else {
            // A pending axis is ineligible only while an older queued message
            // still has to be processed.
            assert(!sc_vecdeque_is_empty(&controller->queue));
            msg = sc_vecdeque_pop(&controller->queue);
            ++controller->queue_pop_count;
        }
        sc_mutex_unlock(&controller->mutex);

        if (sc_get_log_level() <= SC_LOG_LEVEL_VERBOSE) {
            sc_control_msg_log(&msg);
        }

        bool eos;
        bool ok = process_msg(controller, &msg, &eos);
        sc_control_msg_destroy(&msg);
        if (!ok) {
            if (eos) {
                LOGD("Controller stopped (socket closed)");
            } // else error already logged
            error = !eos;
            break;
        }
    }

    controller->cbs->on_ended(controller, error, controller->cbs_userdata);

    return 0;
}

bool
sc_controller_start(struct sc_controller *controller) {
    LOGD("Starting controller thread");

    bool ok = sc_thread_create(&controller->thread, run_controller,
                               "scrcpy-ctl", controller);
    if (!ok) {
        LOGE("Could not start controller thread");
        return false;
    }

    if (!sc_receiver_start(&controller->receiver)) {
        sc_controller_stop(controller);
        sc_thread_join(&controller->thread, NULL);
        return false;
    }

    return true;
}

void
sc_controller_stop(struct sc_controller *controller) {
    sc_mutex_lock(&controller->mutex);
    controller->stopped = true;
    sc_cond_signal(&controller->msg_cond);
    sc_mutex_unlock(&controller->mutex);
}

void
sc_controller_join(struct sc_controller *controller) {
    sc_thread_join(&controller->thread, NULL);
    sc_receiver_join(&controller->receiver);
}
