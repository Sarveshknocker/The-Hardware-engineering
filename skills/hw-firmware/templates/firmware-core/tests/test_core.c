/*
 * Host unit tests for the firmware core. Build & run from firmware-core/:
 *   make test      (or: gcc -std=c99 -Wall -Wextra -Werror -Iinclude src/<all>.c tests/<all>.c -lm -o test_core)
 */
#include "app.h"
#include "board.h"
#include "fault.h"
#include "filters.h"
#include "hal.h"
#include "ringbuf.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

extern uint32_t mock_now_ms;
extern int32_t mock_adc_mv[4];
extern hal_status_t mock_adc_status[4];
extern bool mock_gpio[8];
extern bool mock_fb_follows_actuator;
extern unsigned mock_wdt_feeds;

static int g_fail, g_pass;
#define CHECK(cond) do { if (cond) g_pass++; else { g_fail++; printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define NEAR(a, b, eps) (fabs((double)(a) - (double)(b)) <= (eps))

/* Sensor mV for a desired moisture %, inverse of mv_to_pct in app.c */
static int32_t mv_for_pct(float pct) { return (int32_t)(SENSOR_MV_AT_0PCT - pct * (SENSOR_MV_AT_0PCT - SENSOR_MV_AT_100PCT) / 100.0f); }
static void run_steps(int n) { for (int i = 0; i < n; i++) { app_step(); mock_now_ms += APP_PERIOD_MS; } }
static void reset_world(void)
{
    mock_now_ms = 0; memset(mock_gpio, 0, sizeof mock_gpio);
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(40); mock_adc_mv[BOARD_ADC_VSUPPLY] = 900;  /* 900 / 0.248 ≈ 3629 mV */
    mock_adc_status[0] = mock_adc_status[1] = HAL_OK;
    mock_fb_follows_actuator = true; mock_wdt_feeds = 0;
    app_init();
}

static void test_filters(void)
{
    mavg_t m; mavg_init(&m, 4);
    CHECK(NEAR(mavg_update(&m, 10), 10, 1e-6));
    mavg_update(&m, 20); mavg_update(&m, 30);
    CHECK(NEAR(mavg_update(&m, 40), 25, 1e-6));
    CHECK(NEAR(mavg_update(&m, 50), 35, 1e-6));        /* oldest (10) dropped */

    ema_t e; ema_init(&e, 0.5f);
    CHECK(NEAR(ema_update(&e, 10), 10, 1e-6));
    CHECK(NEAR(ema_update(&e, 20), 15, 1e-6));

    CHECK(NEAR(median3(5, 100, 6), 6, 1e-6));
    CHECK(NEAR(median3(3, 1, 2), 2, 1e-6));

    debounce_t d; debounce_init(&d, 3, false);
    CHECK(!debounce_update(&d, true)); CHECK(!debounce_update(&d, true)); CHECK(debounce_update(&d, true));
    CHECK(debounce_update(&d, false));                   /* one glitch does not flip it back */

    plaus_t p; plaus_init(&p, 0, 100, 10, 3);
    CHECK(plaus_check(&p, 50) == PLAUS_OK);
    CHECK(plaus_check(&p, 150) == PLAUS_RANGE);
    CHECK(plaus_check(&p, 70) == PLAUS_STEP);            /* 50 → 70 exceeds max step 10 */
    CHECK(plaus_check(&p, 71) == PLAUS_OK);
    plaus_check(&p, 71); plaus_check(&p, 71);
    CHECK(plaus_check(&p, 71) == PLAUS_STUCK);
    CHECK(plaus_check(&p, NAN) == PLAUS_RANGE);

    hyst_t h; hyst_init(&h, 30, 45, 1000, 5000);
    CHECK(hyst_update(&h, 20, 0));                       /* turns on */
    CHECK(hyst_update(&h, 50, 500));                     /* min-on time not yet elapsed */
    CHECK(!hyst_update(&h, 50, 1000));                   /* now off */
    CHECK(!hyst_update(&h, 10, 3000));                   /* min-off time protects the actuator */
    CHECK(hyst_update(&h, 10, 6000));
    CHECK(hyst_update(&h, 40, 8000));                    /* inside hysteresis band: stays on */
    /* millis() wrap-around */
    hyst_t w; hyst_init(&w, 30, 45, 1000, 1000);
    CHECK(hyst_update(&w, 10, 0xFFFFFF00u));
    CHECK(!hyst_update(&w, 60, 0x00000300u));            /* 0x400 ms later across the wrap */
}

static void test_fault_manager(void)
{
    fault_config_t cfg[FAULT_COUNT];
    memset(cfg, 0, sizeof cfg);
    cfg[FAULT_SENSOR_COMM] = (fault_config_t){ FAULT_SEV_CRITICAL, 3, 2, false };
    cfg[FAULT_ACTUATOR] = (fault_config_t){ FAULT_SEV_CRITICAL, 1, 1, true };
    fault_init(cfg);
    fault_report(FAULT_SENSOR_COMM, true); fault_report(FAULT_SENSOR_COMM, true);
    CHECK(!fault_active(FAULT_SENSOR_COMM));             /* debounced: needs 3 */
    fault_report(FAULT_SENSOR_COMM, true);
    CHECK(fault_active(FAULT_SENSOR_COMM) && fault_any_critical());
    fault_report(FAULT_SENSOR_COMM, false);
    CHECK(fault_active(FAULT_SENSOR_COMM));              /* needs 2 OKs */
    fault_report(FAULT_SENSOR_COMM, false);
    CHECK(!fault_active(FAULT_SENSOR_COMM));
    CHECK(fault_occurrences(FAULT_SENSOR_COMM) == 1);

    fault_report(FAULT_ACTUATOR, true); fault_report(FAULT_ACTUATOR, false);
    CHECK(fault_active(FAULT_ACTUATOR));                 /* latched */
    fault_reset(FAULT_ACTUATOR);
    CHECK(!fault_active(FAULT_ACTUATOR));
    CHECK(fault_active_mask() == 0);
}

static void test_ringbuf(void)
{
    int storage[3]; ringbuf_t rb; int v;
    ringbuf_init(&rb, storage, sizeof(int), 3, true);
    for (int i = 1; i <= 4; i++) ringbuf_push(&rb, &i);  /* 1 is overwritten */
    CHECK(ringbuf_count(&rb) == 3 && rb.dropped == 1);
    CHECK(ringbuf_pop(&rb, &v) && v == 2);
    ringbuf_init(&rb, storage, sizeof(int), 2, false);
    int a = 7, b = 8, c = 9;
    CHECK(ringbuf_push(&rb, &a) && ringbuf_push(&rb, &b) && !ringbuf_push(&rb, &c));
    CHECK(ringbuf_pop(&rb, &v) && v == 7 && ringbuf_pop(&rb, &v) && v == 8 && !ringbuf_pop(&rb, &v));
}

static void test_app_normal_control(void)
{
    reset_world();
    run_steps(2);
    CHECK(app_state() == APP_RUN);
    CHECK(!app_actuator_on());                           /* 40 % is inside the band */
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(20);
    run_steps(10);                                       /* moving average settles below 30 % */
    CHECK(app_actuator_on());
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(60);
    run_steps(15);
    CHECK(!app_actuator_on());
    CHECK(app_telemetry_pending() > 0);
    CHECK(mock_wdt_feeds >= 27);
}

static void test_app_sensor_disconnect_goes_safe_and_recovers(void)
{
    reset_world();
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(10);
    run_steps(12);
    CHECK(app_actuator_on());
    mock_adc_mv[BOARD_ADC_SENSOR] = 3300;               /* open circuit: above SENSOR_MAX_VALID_MV */
    run_steps(3);
    CHECK(app_state() == APP_SAFE);
    CHECK(!app_actuator_on() && !mock_gpio[BOARD_PIN_ACTUATOR]);
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(50);
    run_steps(8);
    CHECK(app_state() == APP_RUN);                       /* non-latched fault cleared → automatic recovery */
}

static void test_app_brownout_blocks_actuator(void)
{
    reset_world();
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(10);
    run_steps(12);
    CHECK(app_actuator_on());
    mock_adc_mv[BOARD_ADC_VSUPPLY] = 700;                /* 700 / 0.248 ≈ 2.8 V < 3.3 V */
    run_steps(2);
    CHECK(app_state() == APP_SAFE && !app_actuator_on());
}

static void test_app_actuator_feedback_latches(void)
{
    reset_world();
    mock_fb_follows_actuator = false;                    /* pump commanded but not running (blown fuse / open load) */
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(10);
    run_steps(20);
    CHECK(app_state() == APP_SAFE);
    CHECK(fault_active(FAULT_ACTUATOR));
    mock_fb_follows_actuator = true;
    run_steps(5);
    CHECK(app_state() == APP_SAFE);                      /* latched: stays safe until acknowledged */
    app_acknowledge_faults();
    run_steps(3);
    CHECK(app_state() == APP_RUN);
}

static void test_app_max_on_timeout(void)
{
    reset_world();
    mock_adc_mv[BOARD_ADC_SENSOR] = mv_for_pct(5);      /* sensor says "dry" forever */
    run_steps((int)(CTRL_MAX_ON_MS / APP_PERIOD_MS) + 15);
    CHECK(!app_actuator_on());                           /* safety timeout stopped the pump */
}

int main(void)
{
    test_filters();
    test_fault_manager();
    test_ringbuf();
    test_app_normal_control();
    test_app_sensor_disconnect_goes_safe_and_recovers();
    test_app_brownout_blocks_actuator();
    test_app_actuator_feedback_latches();
    test_app_max_on_timeout();
    printf("%d passed, %d failed\n", g_pass, g_fail);
    return g_fail ? 1 : 0;
}
