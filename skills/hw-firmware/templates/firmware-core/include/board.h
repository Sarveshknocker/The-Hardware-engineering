/*
 * Board configuration: logical pin/channel ids and calibrated constants.
 * The HAL port maps these logical ids to real GPIO/ADC channels (see ports/ and the PINMAP.md produced by pins.mjs).
 * Values below are EXAMPLES for a sensor-controlled actuator (e.g. soil-moisture → pump). Replace per project.
 */
#ifndef BOARD_H
#define BOARD_H

/* Logical I/O ids */
#define BOARD_PIN_ACTUATOR        0   /* drives MOSFET/relay driver gate — never the load directly */
#define BOARD_PIN_ACTUATOR_FB     1   /* feedback: current-sense comparator / flow switch (1 = load really running) */
#define BOARD_PIN_STATUS_LED      2
#define BOARD_ADC_SENSOR          0   /* analog sensor output (after divider/filter) */
#define BOARD_ADC_VSUPPLY         1   /* supply sense through divider */

/* Sensor calibration (two-point, measured on the real sensor) */
#define SENSOR_MV_AT_0PCT         2600.0f  /* e.g. capacitive soil sensor in dry air */
#define SENSOR_MV_AT_100PCT       1100.0f  /* e.g. same sensor in water */
#define SENSOR_MIN_VALID_MV       200.0f   /* below → wire short / sensor dead */
#define SENSOR_MAX_VALID_MV       3000.0f  /* above → open circuit / disconnected */

/* Supply monitoring */
#define VSUPPLY_DIVIDER_RATIO     0.248f   /* R2/(R1+R2) — from calc.mjs divider */
#define VSUPPLY_MIN_MV            3300     /* below → brown-out risk: stop actuator, save state */

/* Control */
#define CTRL_ON_BELOW_PCT         30.0f
#define CTRL_OFF_ABOVE_PCT        45.0f
#define CTRL_MIN_ON_MS            (10UL * 1000UL)
#define CTRL_MIN_OFF_MS           (60UL * 1000UL)
#define CTRL_MAX_ON_MS            (5UL * 60UL * 1000UL)  /* safety timeout: a stuck-dry sensor must not run the pump forever */
#define ACTUATOR_SETTLE_MS        2000UL                 /* time for feedback to confirm after switching on */

/* Scheduling */
#define APP_PERIOD_MS             1000UL
#define TELEMETRY_CAPACITY        64

#endif /* BOARD_H */
