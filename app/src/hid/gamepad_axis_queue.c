#include "gamepad_axis_queue.h"

#include <assert.h>

void
sc_gamepad_axis_queue_init(struct sc_gamepad_axis_queue *queue) {
    queue->push_count = 0;
    queue->pop_count = 0;
    queue->pending_mask = 0;
    queue->next = 0;
}

void
sc_gamepad_axis_queue_notify_queued(struct sc_gamepad_axis_queue *queue) {
    ++queue->push_count;
}

void
sc_gamepad_axis_queue_notify_dequeued(struct sc_gamepad_axis_queue *queue) {
    assert(queue->pop_count < queue->push_count);
    ++queue->pop_count;
}

void
sc_gamepad_axis_queue_push(struct sc_gamepad_axis_queue *queue,
                           unsigned gamepad_index) {
    assert(gamepad_index < SC_MAX_GAMEPADS);
    queue->pending_after[gamepad_index] = queue->push_count;
    queue->pending_mask |= 1u << gamepad_index;
}

void
sc_gamepad_axis_queue_clear(struct sc_gamepad_axis_queue *queue,
                            unsigned gamepad_index) {
    assert(gamepad_index < SC_MAX_GAMEPADS);
    queue->pending_mask &= ~(1u << gamepad_index);
    queue->pending_after[gamepad_index] = 0;
}

bool
sc_gamepad_axis_queue_take(struct sc_gamepad_axis_queue *queue,
                           unsigned *gamepad_index) {
    for (unsigned i = 0; i < SC_MAX_GAMEPADS; ++i) {
        unsigned index = (queue->next + i) % SC_MAX_GAMEPADS;
        uint8_t mask = 1u << index;
        if ((queue->pending_mask & mask)
                && queue->pending_after[index] <= queue->pop_count) {
            queue->pending_mask &= ~mask;
            queue->pending_after[index] = 0;
            queue->next = (index + 1) % SC_MAX_GAMEPADS;
            *gamepad_index = index;
            return true;
        }
    }

    return false;
}
