/*
 * Application: measure → validate → filter → control → actuate → record, with a safe state.
 * Call app_init() once, then app_step() every APP_PERIOD_MS from the main loop or an RTOS task.
 */
#ifndef APP_H
#define APP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum { APP_BOOT = 0, APP_SELF_TEST, APP_RUN, APP_SAFE } app_state_t;

typedef struct {
    uint32_t t_ms;
    float value_pct;        /* filtered process value */
    uint16_t supply_mv;
    uint32_t fault_mask;
    uint8_t actuator_on;
    uint8_t state;
} telemetry_t;

void app_init(void);
void app_step(void);
app_state_t app_state(void);
bool app_actuator_on(void);
float app_value_pct(void);
size_t app_telemetry_pending(void);
bool app_telemetry_pop(telemetry_t *out);
void app_acknowledge_faults(void);   /* operator/button/remote command: clears latched faults whose cause is gone */

#endif /* APP_H */
