/*
 * HAL port for the Arduino API (AVR, ESP32 Arduino core, RP2040 Arduino-Pico, STM32duino…).
 * Copy every header from include/, every .c file from src/, this file and firmware_core.ino into one sketch folder
 * (Arduino compiles .c files as C and .cpp files as C++).
 * Map logical ids from board.h to real pins below (keep in sync with PINMAP.md).
 */
#include <Arduino.h>
#include <Wire.h>
#include <stdarg.h>
#include <stdio.h>

extern "C" {
#include "hal.h"
}

static const uint8_t PIN_MAP[] = { 5 /* ACTUATOR */, 6 /* ACTUATOR_FB */, LED_BUILTIN /* STATUS_LED */ };
static const uint8_t ADC_MAP[] = { A0 /* SENSOR */, A1 /* VSUPPLY */ };
#ifndef ADC_REF_MV
#define ADC_REF_MV 3300     /* 5000 on 5 V AVR boards; ESP32 core: use analogReadMilliVolts() below */
#endif
#ifndef ADC_MAX_COUNT
#define ADC_MAX_COUNT 4095  /* 1023 on AVR */
#endif

extern "C" void hal_platform_init(void)
{
    digitalWrite(PIN_MAP[0], LOW);
    pinMode(PIN_MAP[0], OUTPUT);
    pinMode(PIN_MAP[1], INPUT);
    pinMode(PIN_MAP[2], OUTPUT);
    Wire.begin();
    Serial.begin(115200);
    /* Watchdog is platform-specific: AVR <avr/wdt.h> wdt_enable(WDTO_4S); ESP32 esp_task_wdt_*; RP2040 rp2040.wdt_begin(4000). */
}

extern "C" uint32_t hal_millis(void) { return millis(); }
extern "C" void hal_delay_ms(uint32_t ms) { delay(ms); }
extern "C" void hal_gpio_write(uint8_t pin, bool level) { digitalWrite(PIN_MAP[pin], level ? HIGH : LOW); }
extern "C" bool hal_gpio_read(uint8_t pin) { return digitalRead(PIN_MAP[pin]) == HIGH; }

extern "C" hal_status_t hal_adc_read_mv(uint8_t channel, int32_t *mv)
{
#if defined(ARDUINO_ARCH_ESP32)
    *mv = (int32_t)analogReadMilliVolts(ADC_MAP[channel]);      /* uses factory calibration */
#else
    long sum = 0;
    for (int i = 0; i < 8; i++) sum += analogRead(ADC_MAP[channel]);
    *mv = (int32_t)((sum / 8) * (long)ADC_REF_MV / ADC_MAX_COUNT);
#endif
    return HAL_OK;
}

extern "C" hal_status_t hal_i2c_write_read(uint8_t addr7, const uint8_t *wr, size_t wr_len, uint8_t *rd, size_t rd_len, uint32_t timeout_ms)
{
    (void)timeout_ms;
    if (wr_len) {
        Wire.beginTransmission(addr7);
        Wire.write(wr, wr_len);
        uint8_t e = Wire.endTransmission(rd_len == 0);           /* repeated start if a read follows */
        if (e == 2 || e == 3) return HAL_NACK;
        if (e != 0) return HAL_ERR;
    }
    if (rd_len) {
        if (Wire.requestFrom((int)addr7, (int)rd_len) != (int)rd_len) return HAL_NACK;
        for (size_t i = 0; i < rd_len; i++) rd[i] = (uint8_t)Wire.read();
    }
    return HAL_OK;
}

extern "C" void hal_watchdog_feed(void) { /* call the platform's watchdog reset here, e.g. wdt_reset() on AVR */ }
extern "C" void hal_sleep_ms(uint32_t ms) { delay(ms); /* replace with the platform's low-power sleep */ }

extern "C" void hal_log(const char *fmt, ...)
{
    char buf[128];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    Serial.print(buf);
}
