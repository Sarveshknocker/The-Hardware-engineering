/*
 * Hardware abstraction layer (HAL) — the ONLY place the core touches hardware.
 * Implement these functions once per platform (see ports/esp-idf, ports/arduino, tests/mock_hal.c).
 * Keeping the application portable lets you unit-test logic on a PC and swap MCUs late in the project.
 */
#ifndef HAL_H
#define HAL_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

typedef enum { HAL_OK = 0, HAL_ERR = -1, HAL_TIMEOUT = -2, HAL_NACK = -3 } hal_status_t;

/* Time */
uint32_t hal_millis(void);                       /* monotonic ms since boot (wraps after ~49 days; use unsigned subtraction) */
void hal_delay_ms(uint32_t ms);

/* Digital I/O (logical pin ids defined in board.h) */
void hal_gpio_write(uint8_t pin, bool level);
bool hal_gpio_read(uint8_t pin);

/* Analog: millivolts at the ADC pin, already calibrated by the platform when possible */
hal_status_t hal_adc_read_mv(uint8_t channel, int32_t *mv);

/* I2C: write then read in one transaction (repeated start). Either length may be 0. */
hal_status_t hal_i2c_write_read(uint8_t addr7, const uint8_t *wr, size_t wr_len, uint8_t *rd, size_t rd_len, uint32_t timeout_ms);

/* Watchdog: feed only from the main loop when the system is healthy */
void hal_watchdog_feed(void);

/* Low power: returns after waking (light sleep) or never returns (deep sleep → reset) */
void hal_sleep_ms(uint32_t ms);

/* Logging (printf-style; may be a no-op in production builds) */
void hal_log(const char *fmt, ...);

#endif /* HAL_H */
