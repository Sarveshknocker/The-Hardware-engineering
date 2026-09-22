/*
 * Fixed-record ring buffer for store-and-forward telemetry (keep readings while the network is down).
 * Single producer / single consumer. For ISR ↔ task use, protect push/pop with a critical section on your platform.
 */
#ifndef RINGBUF_H
#define RINGBUF_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint8_t *storage;        /* capacity * record_size bytes, provided by the caller (static array) */
    size_t record_size, capacity;
    size_t head, tail, count;
    bool overwrite_oldest;   /* true: keep newest data when full; false: reject new data when full */
    uint32_t dropped;        /* records lost because the buffer was full */
} ringbuf_t;

void ringbuf_init(ringbuf_t *rb, void *storage, size_t record_size, size_t capacity, bool overwrite_oldest);
bool ringbuf_push(ringbuf_t *rb, const void *record);
bool ringbuf_pop(ringbuf_t *rb, void *record_out);
bool ringbuf_peek(const ringbuf_t *rb, void *record_out);
size_t ringbuf_count(const ringbuf_t *rb);

#endif /* RINGBUF_H */
