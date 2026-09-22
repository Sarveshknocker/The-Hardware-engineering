# Hardware test plan template

## 1. Bring-up (first power-on of a new board)
1. Visual inspection (orientation, solder bridges, missing parts); measure rail-to-GND resistance (no shorts).
2. Power from a **current-limited bench supply** (limit just above expected idle); check each rail voltage and ripple.
3. Program the MCU (SWD/UART/USB); run a "blinky + UART hello" build.
4. Bring up peripherals one by one with minimal test code: I²C scan (addresses match PINMAP), SPI ID reads, ADC readings vs multimeter, actuator drive with dummy load.
5. Record deviations and rework in a bring-up log.

## 2. Functional tests
One test per functional requirement (FR-xx), with stimulus, expected response and tolerance.

## 3. Calibration & accuracy
Reference instruments, points, temperature, repeatability (n ≥ 10), accuracy vs requirement.

## 4. Power & battery
Current profile per state (active, radio TX, sleep) with a current profiler; compare with POWER_BUDGET.md; battery life extrapolation; brown-out behaviour (ramp supply down/up slowly); charging across temperature; reverse-polarity and over-voltage tests on the input (protected!).

## 5. Environmental
Temperature (min/max operating, cycling), humidity/condensation, IP ingress (spray/dust), UV/outdoor exposure, vibration/drop (if portable/mobile). Use a thermal chamber or controlled approximations for prototypes.

## 6. EMC / RF pre-compliance
Near-field probe scan of switching regulators/clocks, radiated/conducted pre-scan at a lab or with a spectrum analyser, ESD gun on connectors/buttons (IEC 61000-4-2 levels), RF range test in the real environment, coexistence (Wi-Fi + BLE + motors).

## 7. Reliability & endurance
Long-duration run (≥ 72 h burn-in), actuator cycle life, connector mating cycles, flash write endurance, OTA update/rollback loops, power-cycle test (hundreds of random power cuts during writes).

## 8. Fault injection
Disconnect/short each sensor, stall motors, block radio, corrupt configuration, fill storage, kill the network during OTA, drop supply mid-operation, hold reset/boot pins — the device must reach the defined safe state and recover as specified.

## 9. Field pilot
N units in real conditions for weeks; telemetry of faults, resets (reset reason), battery, RSSI; user feedback.

## 10. Production test
Fixture (pogo pins/bed-of-nails or connector-based), programming, self-test firmware reporting pass/fail per subsystem, calibration step, serial number & keys provisioning, label, record results per unit.

| Test ID | Requirement | Procedure | Equipment | Pass criteria | Result |
|---|---|---|---|---|---|
