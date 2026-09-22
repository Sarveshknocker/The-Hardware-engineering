/*
 * Small, allocation-free signal-conditioning helpers for sensor data.
 */
#ifndef FILTERS_H
#define FILTERS_H

#include <stdbool.h>
#include <stdint.h>

/* Moving average over the last N samples (N <= MAVG_MAX). */
#define MAVG_MAX 32
typedef struct { float buf[MAVG_MAX]; uint8_t n, idx, count; float sum; } mavg_t;
void mavg_init(mavg_t *m, uint8_t n);
float mavg_update(mavg_t *m, float x);

/* Exponential moving average: y += alpha * (x - y), 0 < alpha <= 1. First sample initialises. */
typedef struct { float y, alpha; bool primed; } ema_t;
void ema_init(ema_t *e, float alpha);
float ema_update(ema_t *e, float x);

/* Median of three — removes single-sample spikes. */
float median3(float a, float b, float c);

/* Integrating debouncer for noisy digital inputs (buttons, float switches, reed contacts). */
typedef struct { uint8_t integrator, max; bool state; } debounce_t;
void debounce_init(debounce_t *d, uint8_t samples_to_switch, bool initial);
bool debounce_update(debounce_t *d, bool raw);

/* Plausibility check: physical range + maximum change per update + "stuck" detection. */
typedef struct {
    float min, max;          /* physically possible range */
    float max_step;          /* max |Δ| between consecutive samples (0 = disabled) */
    uint16_t stuck_limit;    /* identical samples in a row that count as stuck (0 = disabled) */
    float last; uint16_t same_count; bool has_last;
} plaus_t;
typedef enum { PLAUS_OK = 0, PLAUS_RANGE, PLAUS_STEP, PLAUS_STUCK } plaus_result_t;
void plaus_init(plaus_t *p, float min, float max, float max_step, uint16_t stuck_limit);
plaus_result_t plaus_check(plaus_t *p, float x);

/* Two-threshold (hysteresis) controller with minimum on/off times to protect actuators (pumps, compressors, relays). */
typedef struct {
    float on_below, off_above;      /* e.g. turn pump ON when moisture < on_below, OFF when > off_above */
    uint32_t min_on_ms, min_off_ms;
    bool output; uint32_t last_change_ms; bool started;
} hyst_t;
void hyst_init(hyst_t *h, float on_below, float off_above, uint32_t min_on_ms, uint32_t min_off_ms);
bool hyst_update(hyst_t *h, float x, uint32_t now_ms);
void hyst_force_off(hyst_t *h, uint32_t now_ms);

#endif /* FILTERS_H */
