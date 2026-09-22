#include "app.h"
#include "board.h"
#include "fault.h"
#include "filters.h"
#include "hal.h"
#include "ringbuf.h"

static app_state_t s_state = APP_BOOT;
static mavg_t s_avg;
static plaus_t s_plaus;
static hyst_t s_ctrl;
static float s_value_pct;
static uint16_t s_supply_mv;
static bool s_actuator;
static uint32_t s_actuator_on_since;
static uint8_t s_fb_miss;
static ringbuf_t s_telemetry;
static telemetry_t s_telemetry_storage[TELEMETRY_CAPACITY];

static const fault_config_t FAULT_CFG[FAULT_COUNT] = {
    [FAULT_SENSOR_COMM]  = { FAULT_SEV_CRITICAL, 3, 3, false },
    [FAULT_SENSOR_RANGE] = { FAULT_SEV_CRITICAL, 3, 5, false },
    [FAULT_SENSOR_STUCK] = { FAULT_SEV_DEGRADED, 1, 1, false },
    [FAULT_SUPPLY_LOW]   = { FAULT_SEV_CRITICAL, 2, 10, false },  /* slow to clear: avoid oscillating near the threshold */
    [FAULT_OVERTEMP]     = { FAULT_SEV_CRITICAL, 2, 10, false },
    [FAULT_ACTUATOR]     = { FAULT_SEV_CRITICAL, 1, 1, true },    /* latched: needs a human to look at the pump/relay */
};

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }

static float mv_to_pct(float mv)
{
    float pct = (SENSOR_MV_AT_0PCT - mv) * 100.0f / (SENSOR_MV_AT_0PCT - SENSOR_MV_AT_100PCT);
    return clampf(pct, 0.0f, 100.0f);
}

static void set_actuator(bool on)
{
    if (on && !s_actuator) { s_actuator_on_since = hal_millis(); s_fb_miss = 0; }
    s_actuator = on;
    hal_gpio_write(BOARD_PIN_ACTUATOR, on);
}

/* Read + validate inputs, report faults. Returns true if a fresh, valid process value is available. */
static bool sample_inputs(void)
{
    int32_t supply_raw = 0;
    if (hal_adc_read_mv(BOARD_ADC_VSUPPLY, &supply_raw) == HAL_OK) {
        s_supply_mv = (uint16_t)((float)supply_raw / VSUPPLY_DIVIDER_RATIO);
        fault_report(FAULT_SUPPLY_LOW, s_supply_mv < VSUPPLY_MIN_MV);
    }

    int32_t mv = 0;
    bool comm_ok = hal_adc_read_mv(BOARD_ADC_SENSOR, &mv) == HAL_OK;
    fault_report(FAULT_SENSOR_COMM, !comm_ok);
    if (!comm_ok) return false;

    plaus_result_t pr = plaus_check(&s_plaus, (float)mv);
    fault_report(FAULT_SENSOR_RANGE, pr == PLAUS_RANGE);
    fault_report(FAULT_SENSOR_STUCK, pr == PLAUS_STUCK);
    if (pr == PLAUS_RANGE || pr == PLAUS_STEP) return false;   /* reject this sample; keep last filtered value */

    s_value_pct = mavg_update(&s_avg, mv_to_pct((float)mv));
    return true;
}

static void check_actuator_feedback(void)
{
    if (!s_actuator) {
        s_fb_miss = 0;
        fault_report(FAULT_ACTUATOR, false);   /* condition gone — lets an acknowledged latched fault clear */
        return;
    }
    uint32_t on_for = hal_millis() - s_actuator_on_since;
    if (on_for >= ACTUATOR_SETTLE_MS && !hal_gpio_read(BOARD_PIN_ACTUATOR_FB)) {
        if (s_fb_miss < UINT8_MAX) s_fb_miss++;
    } else {
        s_fb_miss = 0;
    }
    fault_report(FAULT_ACTUATOR, s_fb_miss >= 2);                /* commanded ON but not running: open load, blown fuse, dry-run */
}

static void record(void)
{
    telemetry_t t = { hal_millis(), s_value_pct, s_supply_mv, fault_active_mask(), (uint8_t)s_actuator, (uint8_t)s_state };
    ringbuf_push(&s_telemetry, &t);
}

void app_init(void)
{
    set_actuator(false);                                          /* fail-safe default before anything else */
    fault_init(FAULT_CFG);
    mavg_init(&s_avg, 8);
    plaus_init(&s_plaus, SENSOR_MIN_VALID_MV, SENSOR_MAX_VALID_MV, 500.0f, 600);
    hyst_init(&s_ctrl, CTRL_ON_BELOW_PCT, CTRL_OFF_ABOVE_PCT, CTRL_MIN_ON_MS, CTRL_MIN_OFF_MS);
    ringbuf_init(&s_telemetry, s_telemetry_storage, sizeof(telemetry_t), TELEMETRY_CAPACITY, true);
    s_state = APP_SELF_TEST;
    hal_log("app: init\n");
}

void app_step(void)
{
    uint32_t now = hal_millis();
    bool fresh = sample_inputs();
    check_actuator_feedback();

    switch (s_state) {
    case APP_BOOT:
        app_init();
        break;
    case APP_SELF_TEST:
        /* Require one valid reading and a healthy supply before enabling outputs. */
        if (fresh && !fault_any_critical() && s_supply_mv >= VSUPPLY_MIN_MV) { s_state = APP_RUN; hal_log("app: self-test passed\n"); }
        else if (fault_any_critical()) { s_state = APP_SAFE; hal_log("app: self-test failed, mask=0x%lx\n", (unsigned long)fault_active_mask()); }
        break;
    case APP_RUN:
        if (fault_any_critical()) {
            hyst_force_off(&s_ctrl, now);
            set_actuator(false);
            s_state = APP_SAFE;
            hal_log("app: SAFE, mask=0x%lx\n", (unsigned long)fault_active_mask());
            break;
        }
        if (fresh && !fault_active(FAULT_SENSOR_STUCK)) {
            bool want = hyst_update(&s_ctrl, s_value_pct, now);
            if (want && s_actuator && (now - s_actuator_on_since) >= CTRL_MAX_ON_MS) {
                want = false;                                     /* max-on safety timeout */
                hyst_force_off(&s_ctrl, now);
                hal_log("app: max on-time reached\n");
            }
            set_actuator(want);
        } else if (fault_active(FAULT_SENSOR_STUCK)) {
            hyst_force_off(&s_ctrl, now);                         /* degraded: don't act on a frozen reading */
            set_actuator(false);
        }
        break;
    case APP_SAFE:
        set_actuator(false);
        if (!fault_any_critical()) { s_state = APP_SELF_TEST; hal_log("app: faults cleared, re-testing\n"); }
        break;
    }

    hal_gpio_write(BOARD_PIN_STATUS_LED, s_state == APP_RUN ? true : ((now / 250U) & 1U));  /* blink when not running */
    record();
    hal_watchdog_feed();                                          /* only reached if the loop completed */
}

app_state_t app_state(void) { return s_state; }
bool app_actuator_on(void) { return s_actuator; }
float app_value_pct(void) { return s_value_pct; }
size_t app_telemetry_pending(void) { return ringbuf_count(&s_telemetry); }
bool app_telemetry_pop(telemetry_t *out) { return ringbuf_pop(&s_telemetry, out); }

void app_acknowledge_faults(void)
{
    for (int i = 0; i < FAULT_COUNT; i++) fault_reset((fault_id_t)i);
}
