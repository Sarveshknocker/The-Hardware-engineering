/*
 * Fault manager: debounced fault detection, severity, latching and counters.
 * A fault becomes ACTIVE after `trip_count` consecutive reports and clears after `clear_count` consecutive OKs
 * (unless latched — latched faults need an explicit fault_reset(), e.g. after operator acknowledgement).
 */
#ifndef FAULT_H
#define FAULT_H

#include <stdbool.h>
#include <stdint.h>

typedef enum { FAULT_SEV_INFO = 0, FAULT_SEV_DEGRADED = 1, FAULT_SEV_CRITICAL = 2 } fault_severity_t;

typedef enum {
    FAULT_SENSOR_COMM = 0,   /* sensor does not respond / NACK / CRC error */
    FAULT_SENSOR_RANGE,      /* reading outside physical range */
    FAULT_SENSOR_STUCK,      /* reading implausibly constant or rate-of-change too high */
    FAULT_SUPPLY_LOW,        /* battery / rail under-voltage */
    FAULT_OVERTEMP,          /* board or actuator over-temperature */
    FAULT_ACTUATOR,          /* actuator feedback does not match command */
    FAULT_COUNT
} fault_id_t;

typedef struct {
    fault_severity_t severity;
    uint8_t trip_count;      /* consecutive reports needed to activate (>= 1) */
    uint8_t clear_count;     /* consecutive OKs needed to clear (>= 1) */
    bool latching;           /* stays active until fault_reset() */
} fault_config_t;

void fault_init(const fault_config_t cfg[FAULT_COUNT]);
/* Report the result of a check once per cycle: present = true if the fault condition is observed. */
void fault_report(fault_id_t id, bool present);
bool fault_active(fault_id_t id);
bool fault_any_critical(void);
bool fault_any_active(void);
uint32_t fault_active_mask(void);
uint16_t fault_occurrences(fault_id_t id);   /* how many times it has tripped since boot */
void fault_reset(fault_id_t id);             /* clears a latched fault (only if its condition is gone) */

#endif /* FAULT_H */
