#include <assert.h>

#include "hid/gamepad_axis_queue.h"

static void test_coalesce(void) {
    struct sc_gamepad_axis_queue queue;
    sc_gamepad_axis_queue_init(&queue);

    sc_gamepad_axis_queue_push(&queue, 0);
    sc_gamepad_axis_queue_push(&queue, 0);

    unsigned index;
    assert(sc_gamepad_axis_queue_take(&queue, &index));
    assert(index == 0);
    assert(sc_gamepad_axis_queue_is_empty(&queue));
}

static void test_preserve_order(void) {
    struct sc_gamepad_axis_queue queue;
    sc_gamepad_axis_queue_init(&queue);

    sc_gamepad_axis_queue_notify_queued(&queue);
    sc_gamepad_axis_queue_push(&queue, 0);
    sc_gamepad_axis_queue_notify_queued(&queue);

    unsigned index;
    assert(!sc_gamepad_axis_queue_take(&queue, &index));
    sc_gamepad_axis_queue_notify_dequeued(&queue);
    assert(sc_gamepad_axis_queue_take(&queue, &index));
    assert(index == 0);
}

static void test_clear(void) {
    struct sc_gamepad_axis_queue queue;
    sc_gamepad_axis_queue_init(&queue);

    sc_gamepad_axis_queue_push(&queue, 2);
    sc_gamepad_axis_queue_clear(&queue, 2);

    unsigned index;
    assert(!sc_gamepad_axis_queue_take(&queue, &index));
    assert(sc_gamepad_axis_queue_is_empty(&queue));
}

static void test_round_robin(void) {
    struct sc_gamepad_axis_queue queue;
    sc_gamepad_axis_queue_init(&queue);

    sc_gamepad_axis_queue_push(&queue, 0);
    sc_gamepad_axis_queue_push(&queue, 1);

    unsigned index;
    assert(sc_gamepad_axis_queue_take(&queue, &index));
    assert(index == 0);

    sc_gamepad_axis_queue_push(&queue, 0);
    assert(sc_gamepad_axis_queue_take(&queue, &index));
    assert(index == 1);
    assert(sc_gamepad_axis_queue_take(&queue, &index));
    assert(index == 0);
}

static void test_no_starvation_behind_newer_events(void) {
    struct sc_gamepad_axis_queue queue;
    sc_gamepad_axis_queue_init(&queue);

    for (unsigned i = 0; i < 60; ++i) {
        sc_gamepad_axis_queue_notify_queued(&queue);
    }
    sc_gamepad_axis_queue_push(&queue, 0);
    for (unsigned i = 0; i < 10; ++i) {
        sc_gamepad_axis_queue_notify_queued(&queue);
    }

    unsigned index;
    for (unsigned i = 0; i < 59; ++i) {
        sc_gamepad_axis_queue_notify_dequeued(&queue);
        assert(!sc_gamepad_axis_queue_take(&queue, &index));
    }

    sc_gamepad_axis_queue_notify_dequeued(&queue);
    assert(sc_gamepad_axis_queue_take(&queue, &index));
    assert(index == 0);
}

int main(int argc, char *argv[]) {
    (void) argc;
    (void) argv;

    test_coalesce();
    test_preserve_order();
    test_clear();
    test_round_robin();
    test_no_starvation_behind_newer_events();
    return 0;
}
