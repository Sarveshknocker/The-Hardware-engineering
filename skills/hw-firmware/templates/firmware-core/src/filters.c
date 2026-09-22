#include "filters.h"
#include <math.h>
#include <string.h>

void mavg_init(mavg_t *m, uint8_t n)
{
    memset(m, 0, sizeof *m);
    m->n = (n == 0) ? 1 : (n > MAVG_MAX ? MAVG_MAX : n);
}

float mavg_update(mavg_t *m, float x)
{
    if (m->count == m->n) m->sum -= m->buf[m->idx];
    else m->count++;
    m->buf[m->idx] = x;
    m->sum += x;
    m->idx = (uint8_t)((m->idx + 1) % m->n);
    return m->sum / (float)m->count;
}

void ema_init(ema_t *e, float alpha)
{
    e->alpha = (alpha <= 0.0f || alpha > 1.0f) ? 1.0f : alpha;
    e->y = 0.0f;
    e->primed = false;
}

float ema_update(ema_t *e, float x)
{
    if (!e->primed) { e->y = x; e->primed = true; }
    else e->y += e->alpha * (x - e->y);
    return e->y;
}

float median3(float a, float b, float c)
{
    if (a > b) { float t = a; a = b; b = t; }
    if (b > c) { float t = b; b = c; c = t; }
    if (a > b) { float t = a; a = b; b = t; }
    return b;
}

void debounce_init(debounce_t *d, uint8_t samples_to_switch, bool initial)
{
    d->max = samples_to_switch ? samples_to_switch : 1;
    d->state = initial;
    d->integrator = initial ? d->max : 0;
}

bool debounce_update(debounce_t *d, bool raw)
{
    if (raw) { if (d->integrator < d->max) d->integrator++; }
    else if (d->integrator > 0) d->integrator--;
    if (d->integrator == 0) d->state = false;
    else if (d->integrator >= d->max) d->state = true;
    return d->state;
}

void plaus_init(plaus_t *p, float min, float max, float max_step, uint16_t stuck_limit)
{
    memset(p, 0, sizeof *p);
    p->min = min; p->max = max; p->max_step = max_step; p->stuck_limit = stuck_limit;
}

plaus_result_t plaus_check(plaus_t *p, float x)
{
    plaus_result_t r = PLAUS_OK;
    if (isnan(x) || x < p->min || x > p->max) r = PLAUS_RANGE;
    else if (p->has_last && p->max_step > 0.0f && fabsf(x - p->last) > p->max_step) r = PLAUS_STEP;
    if (p->has_last && x == p->last) { if (p->same_count < UINT16_MAX) p->same_count++; }
    else p->same_count = 0;
    if (r == PLAUS_OK && p->stuck_limit && p->same_count >= p->stuck_limit) r = PLAUS_STUCK;
    if (r != PLAUS_RANGE) { p->last = x; p->has_last = true; } /* keep last good-range value as reference */
    return r;
}

void hyst_init(hyst_t *h, float on_below, float off_above, uint32_t min_on_ms, uint32_t min_off_ms)
{
    memset(h, 0, sizeof *h);
    h->on_below = on_below; h->off_above = off_above;
    h->min_on_ms = min_on_ms; h->min_off_ms = min_off_ms;
}

bool hyst_update(hyst_t *h, float x, uint32_t now_ms)
{
    uint32_t since = now_ms - h->last_change_ms;            /* unsigned subtraction survives millis() wrap */
    bool may_switch = !h->started || since >= (h->output ? h->min_on_ms : h->min_off_ms);
    if (may_switch) {
        if (!h->output && x < h->on_below) { h->output = true; h->last_change_ms = now_ms; h->started = true; }
        else if (h->output && x > h->off_above) { h->output = false; h->last_change_ms = now_ms; h->started = true; }
    }
    return h->output;
}

void hyst_force_off(hyst_t *h, uint32_t now_ms)
{
    if (h->output) { h->output = false; h->last_change_ms = now_ms; h->started = true; }
}
