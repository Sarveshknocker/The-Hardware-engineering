/* Host-side HAL mock: controllable time, ADC values and GPIO for unit tests. */
#include "hal.h"
#include <stdarg.h>
#include <stdio.h>

uint32_t mock_now_ms = 0;
int32_t mock_adc_mv[4] = { 1850, 820, 0, 0 };   /* sensor mid-range, supply 820 mV at divider → ~3.3 V */
hal_status_t mock_adc_status[4] = { HAL_OK, HAL_OK, HAL_OK, HAL_OK };
bool mock_gpio[8];
bool mock_fb_follows_actuator = true;            /* feedback pin mirrors the actuator unless a fault is injected */
unsigned mock_wdt_feeds = 0;
int mock_verbose = 0;

uint32_t hal_millis(void) { return mock_now_ms; }
void hal_delay_ms(uint32_t ms) { mock_now_ms += ms; }
void hal_gpio_write(uint8_t pin, bool level) { if (pin < 8) mock_gpio[pin] = level; }
bool hal_gpio_read(uint8_t pin)
{
    if (pin == 1 && mock_fb_follows_actuator) return mock_gpio[0];
    return pin < 8 ? mock_gpio[pin] : false;
}
hal_status_t hal_adc_read_mv(uint8_t ch, int32_t *mv)
{
    if (ch >= 4) return HAL_ERR;
    *mv = mock_adc_mv[ch];
    return mock_adc_status[ch];
}
hal_status_t hal_i2c_write_read(uint8_t a, const uint8_t *w, size_t wl, uint8_t *r, size_t rl, uint32_t t)
{
    (void)a; (void)w; (void)wl; (void)r; (void)rl; (void)t;
    return HAL_NACK;
}
void hal_watchdog_feed(void) { mock_wdt_feeds++; }
void hal_sleep_ms(uint32_t ms) { mock_now_ms += ms; }
void hal_log(const char *fmt, ...)
{
    if (!mock_verbose) return;
    va_list ap;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
}
