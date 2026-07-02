#ifndef SC_CONTROLLER_H
#define SC_CONTROLLER_H

#include "common.h"

#include <stdbool.h>

#include "control_msg.h"
#include "hid/hid_gamepad.h"
#include "receiver.h"
#include "util/acksync.h"
#include "util/net.h"
#include "util/thread.h"
#include "util/vecdeque.h"

struct sc_control_msg_queue SC_VECDEQUE(struct sc_control_msg);

struct sc_controller {
    sc_socket control_socket;
    sc_thread thread;
    sc_mutex mutex;
    sc_cond msg_cond;
    bool stopped;

    struct sc_control_msg_queue queue;
    uint64_t queue_push_count;
    uint64_t queue_pop_count;

    // Axis reports are coalesced per gamepad. Button reports stay in queue and
    // clear the corresponding pending axis report, since they contain the
    // complete gamepad state. An axis may overtake only queue messages pushed
    // after the recorded queue watermark.
    struct sc_control_msg pending_gamepad_axis[SC_MAX_GAMEPADS];
    uint64_t pending_gamepad_axis_after[SC_MAX_GAMEPADS];
    uint8_t pending_gamepad_axis_mask;
    uint8_t next_pending_gamepad_axis;

    // The RESIZE_DISPLAY control message is never enqueued, it has top priority
    // and a new request overwrites any previous one
    struct {
        // enabled if width != 0
        uint16_t width;
        uint16_t height;
    } resize_display;

    struct sc_receiver receiver;

    const struct sc_controller_callbacks *cbs;
    void *cbs_userdata;
};

struct sc_controller_callbacks {
    void (*on_ended)(struct sc_controller *controller, bool error,
                     void *userdata);
};

bool
sc_controller_init(struct sc_controller *controller, sc_socket control_socket,
                   const struct sc_controller_callbacks *cbs,
                   void *cbs_userdata);

void
sc_controller_configure(struct sc_controller *controller,
                        struct sc_acksync *acksync,
                        struct sc_uhid_devices *uhid_devices);

void
sc_controller_destroy(struct sc_controller *controller);

bool
sc_controller_start(struct sc_controller *controller);

void
sc_controller_stop(struct sc_controller *controller);

void
sc_controller_join(struct sc_controller *controller);

bool
sc_controller_push_msg(struct sc_controller *controller,
                       const struct sc_control_msg *msg);

bool
sc_controller_push_gamepad_axis(struct sc_controller *controller,
                                const struct sc_control_msg *msg);

bool
sc_controller_push_gamepad_button(struct sc_controller *controller,
                                  const struct sc_control_msg *msg);

void
sc_controller_resize_display(struct sc_controller *controller,
                             uint16_t width, uint16_t height);

#endif
