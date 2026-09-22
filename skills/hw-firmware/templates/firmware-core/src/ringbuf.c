#include "ringbuf.h"
#include <string.h>

void ringbuf_init(ringbuf_t *rb, void *storage, size_t record_size, size_t capacity, bool overwrite_oldest)
{
    rb->storage = (uint8_t *)storage;
    rb->record_size = record_size;
    rb->capacity = capacity;
    rb->head = rb->tail = rb->count = 0;
    rb->overwrite_oldest = overwrite_oldest;
    rb->dropped = 0;
}

bool ringbuf_push(ringbuf_t *rb, const void *record)
{
    if (rb->capacity == 0) return false;
    if (rb->count == rb->capacity) {
        rb->dropped++;
        if (!rb->overwrite_oldest) return false;
        rb->tail = (rb->tail + 1) % rb->capacity;   /* discard oldest */
        rb->count--;
    }
    memcpy(rb->storage + rb->head * rb->record_size, record, rb->record_size);
    rb->head = (rb->head + 1) % rb->capacity;
    rb->count++;
    return true;
}

bool ringbuf_peek(const ringbuf_t *rb, void *record_out)
{
    if (rb->count == 0) return false;
    memcpy(record_out, rb->storage + rb->tail * rb->record_size, rb->record_size);
    return true;
}

bool ringbuf_pop(ringbuf_t *rb, void *record_out)
{
    if (!ringbuf_peek(rb, record_out)) return false;
    rb->tail = (rb->tail + 1) % rb->capacity;
    rb->count--;
    return true;
}

size_t ringbuf_count(const ringbuf_t *rb) { return rb->count; }
