#ifndef SC_GAMEPAD_AXIS_QUEUE_H
#define SC_GAMEPAD_AXIS_QUEUE_H

#include <stdbool.h>
#include <stdint.h>

#include "hid/gamepad_ids.h"

// Schedule coalesced gamepad axis reports without allowing them to overtake
// older queued events. Reports from different gamepads are served round-robin.
struct sc_gamepad_axis_queue {
    uint64_t pending_after[SC_MAX_GAMEPADS];
    uint64_t push_count;
    uint64_t pop_count;
    uint8_t pending_mask;
    uint8_t next;
};

void
sc_gamepad_axis_queue_init(struct sc_gamepad_axis_queue *queue);

void
sc_gamepad_axis_queue_notify_queued(struct sc_gamepad_axis_queue *queue);

void
sc_gamepad_axis_queue_notify_dequeued(struct sc_gamepad_axis_queue *queue);

void
sc_gamepad_axis_queue_push(struct sc_gamepad_axis_queue *queue,
                           unsigned gamepad_index);

void
sc_gamepad_axis_queue_clear(struct sc_gamepad_axis_queue *queue,
                            unsigned gamepad_index);

bool
sc_gamepad_axis_queue_take(struct sc_gamepad_axis_queue *queue,
                           unsigned *gamepad_index);

static inline bool
sc_gamepad_axis_queue_is_empty(const struct sc_gamepad_axis_queue *queue) {
    return !queue->pending_mask;
}

#endif
