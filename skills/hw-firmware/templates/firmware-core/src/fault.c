#include "fault.h"
#include <string.h>

typedef struct {
    fault_config_t cfg;
    uint8_t bad_streak;
    uint8_t good_streak;
    bool active;
    bool condition_now;
    uint16_t occurrences;
} fault_state_t;

static fault_state_t s_faults[FAULT_COUNT];

void fault_init(const fault_config_t cfg[FAULT_COUNT])
{
    memset(s_faults, 0, sizeof s_faults);
    for (int i = 0; i < FAULT_COUNT; i++) {
        s_faults[i].cfg = cfg[i];
        if (s_faults[i].cfg.trip_count == 0) s_faults[i].cfg.trip_count = 1;
        if (s_faults[i].cfg.clear_count == 0) s_faults[i].cfg.clear_count = 1;
    }
}

void fault_report(fault_id_t id, bool present)
{
    if (id >= FAULT_COUNT) return;
    fault_state_t *f = &s_faults[id];
    f->condition_now = present;
    if (present) {
        f->good_streak = 0;
        if (f->bad_streak < UINT8_MAX) f->bad_streak++;
        if (!f->active && f->bad_streak >= f->cfg.trip_count) {
            f->active = true;
            if (f->occurrences < UINT16_MAX) f->occurrences++;
        }
    } else {
        f->bad_streak = 0;
        if (f->good_streak < UINT8_MAX) f->good_streak++;
        if (f->active && !f->cfg.latching && f->good_streak >= f->cfg.clear_count) f->active = false;
    }
}

bool fault_active(fault_id_t id) { return id < FAULT_COUNT && s_faults[id].active; }

bool fault_any_critical(void)
{
    for (int i = 0; i < FAULT_COUNT; i++)
        if (s_faults[i].active && s_faults[i].cfg.severity == FAULT_SEV_CRITICAL) return true;
    return false;
}

bool fault_any_active(void) { return fault_active_mask() != 0; }

uint32_t fault_active_mask(void)
{
    uint32_t m = 0;
    for (int i = 0; i < FAULT_COUNT; i++)
        if (s_faults[i].active) m |= (1UL << i);
    return m;
}

uint16_t fault_occurrences(fault_id_t id) { return id < FAULT_COUNT ? s_faults[id].occurrences : 0; }

void fault_reset(fault_id_t id)
{
    if (id >= FAULT_COUNT) return;
    fault_state_t *f = &s_faults[id];
    if (!f->condition_now) { f->active = false; f->bad_streak = 0; }
}
