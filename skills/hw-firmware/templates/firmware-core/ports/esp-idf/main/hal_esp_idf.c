/*
 * HAL port for ESP-IDF v5.2+ (ESP32 / ESP32-S3 / ESP32-C3 …).
 * Uses: driver/gpio.h, esp_adc/adc_oneshot.h + calibration, driver/i2c_master.h, esp_task_wdt.h, esp_sleep.h.
 * Map logical ids from board.h to real pins in the tables below (keep them in sync with PINMAP.md).
 */
#include "hal.h"

#include <stdarg.h>
#include <stdio.h>

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

/* ---- Board mapping (EXAMPLE for ESP32-C3; change per PINMAP.md) ---- */
/* Avoids ESP32-C3 strapping pins (GPIO2/8/9), flash pins (GPIO12–17) and USB (GPIO18/19) — verified with pins.mjs. */
static const gpio_num_t PIN_MAP[] = {
    [0] = GPIO_NUM_5,   /* BOARD_PIN_ACTUATOR   → MOSFET gate driver input */
    [1] = GPIO_NUM_10,  /* BOARD_PIN_ACTUATOR_FB ← current-sense comparator */
    [2] = GPIO_NUM_7,   /* BOARD_PIN_STATUS_LED */
};
static const adc_channel_t ADC_MAP[] = {
    [0] = ADC_CHANNEL_3,  /* BOARD_ADC_SENSOR  (GPIO3 on ESP32-C3, ADC1) */
    [1] = ADC_CHANNEL_4,  /* BOARD_ADC_VSUPPLY (GPIO4 on ESP32-C3, ADC1) */
};
#define I2C_SDA GPIO_NUM_1
#define I2C_SCL GPIO_NUM_0
#define WDT_TIMEOUT_MS 5000

static const char *TAG = "hal";
static adc_oneshot_unit_handle_t s_adc;
static adc_cali_handle_t s_cali[2];
static i2c_master_bus_handle_t s_i2c_bus;

void hal_platform_init(void)
{
    /* GPIO: outputs start LOW (actuator off) before being enabled */
    gpio_set_level(PIN_MAP[0], 0);
    gpio_config_t out = { .pin_bit_mask = (1ULL << PIN_MAP[0]) | (1ULL << PIN_MAP[2]), .mode = GPIO_MODE_OUTPUT };
    ESP_ERROR_CHECK(gpio_config(&out));
    gpio_config_t in = { .pin_bit_mask = 1ULL << PIN_MAP[1], .mode = GPIO_MODE_INPUT, .pull_down_en = GPIO_PULLDOWN_ENABLE };
    ESP_ERROR_CHECK(gpio_config(&in));

    /* ADC1 one-shot with 12 dB attenuation (~0–3.1 V) and calibration */
    adc_oneshot_unit_init_cfg_t unit = { .unit_id = ADC_UNIT_1 };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&unit, &s_adc));
    adc_oneshot_chan_cfg_t ch = { .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT };
    for (int i = 0; i < 2; i++) {
        ESP_ERROR_CHECK(adc_oneshot_config_channel(s_adc, ADC_MAP[i], &ch));
#if ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
        adc_cali_curve_fitting_config_t cc = { .unit_id = ADC_UNIT_1, .chan = ADC_MAP[i], .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT };
        if (adc_cali_create_scheme_curve_fitting(&cc, &s_cali[i]) != ESP_OK) s_cali[i] = NULL;
#elif ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED
        adc_cali_line_fitting_config_t lc = { .unit_id = ADC_UNIT_1, .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_DEFAULT };
        if (adc_cali_create_scheme_line_fitting(&lc, &s_cali[i]) != ESP_OK) s_cali[i] = NULL;
#endif
    }

    /* I2C master bus (external pull-ups sized with calc.mjs; internal ones are too weak for >100 kHz) */
    i2c_master_bus_config_t bus = { .i2c_port = I2C_NUM_0, .sda_io_num = I2C_SDA, .scl_io_num = I2C_SCL,
                                    .clk_source = I2C_CLK_SRC_DEFAULT, .glitch_ignore_cnt = 7 };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus, &s_i2c_bus));

    /* Task watchdog: may already be initialised by sdkconfig (CONFIG_ESP_TASK_WDT_INIT) */
    esp_task_wdt_config_t wdt = { .timeout_ms = WDT_TIMEOUT_MS, .idle_core_mask = 0, .trigger_panic = true };
    if (esp_task_wdt_init(&wdt) == ESP_ERR_INVALID_STATE) ESP_ERROR_CHECK(esp_task_wdt_reconfigure(&wdt));
    ESP_ERROR_CHECK(esp_task_wdt_add(NULL));
}

uint32_t hal_millis(void) { return (uint32_t)(esp_timer_get_time() / 1000); }
void hal_delay_ms(uint32_t ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }
void hal_gpio_write(uint8_t pin, bool level) { gpio_set_level(PIN_MAP[pin], level ? 1 : 0); }
bool hal_gpio_read(uint8_t pin) { return gpio_get_level(PIN_MAP[pin]) != 0; }

hal_status_t hal_adc_read_mv(uint8_t channel, int32_t *mv)
{
    int raw = 0, sum = 0;
    for (int i = 0; i < 8; i++) {                     /* oversample ×8 to reduce noise */
        if (adc_oneshot_read(s_adc, ADC_MAP[channel], &raw) != ESP_OK) return HAL_ERR;
        sum += raw;
    }
    raw = sum / 8;
    int out = 0;
    if (s_cali[channel] && adc_cali_raw_to_voltage(s_cali[channel], raw, &out) == ESP_OK) *mv = out;
    else *mv = raw * 3100 / 4095;                     /* uncalibrated fallback — accuracy ±10 % */
    return HAL_OK;
}

hal_status_t hal_i2c_write_read(uint8_t addr7, const uint8_t *wr, size_t wr_len, uint8_t *rd, size_t rd_len, uint32_t timeout_ms)
{
    /* For production, create each device handle once at init instead of per transaction. */
    i2c_device_config_t dev = { .dev_addr_length = I2C_ADDR_BIT_LEN_7, .device_address = addr7, .scl_speed_hz = 100000 };
    i2c_master_dev_handle_t h;
    if (i2c_master_bus_add_device(s_i2c_bus, &dev, &h) != ESP_OK) return HAL_ERR;
    esp_err_t err;
    if (wr_len && rd_len) err = i2c_master_transmit_receive(h, wr, wr_len, rd, rd_len, (int)timeout_ms);
    else if (wr_len) err = i2c_master_transmit(h, wr, wr_len, (int)timeout_ms);
    else err = i2c_master_receive(h, rd, rd_len, (int)timeout_ms);
    i2c_master_bus_rm_device(h);
    return err == ESP_OK ? HAL_OK : (err == ESP_ERR_TIMEOUT ? HAL_TIMEOUT : HAL_NACK);
}

void hal_watchdog_feed(void) { esp_task_wdt_reset(); }

void hal_sleep_ms(uint32_t ms)
{
    esp_sleep_enable_timer_wakeup((uint64_t)ms * 1000ULL);
    esp_light_sleep_start();                          /* use esp_deep_sleep_start() for µA-level duty-cycled nodes */
}

void hal_log(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    esp_log_writev(ESP_LOG_INFO, TAG, fmt, ap);
    va_end(ap);
}
