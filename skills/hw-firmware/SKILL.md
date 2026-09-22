---
name: hw-firmware
description: Firmware and embedded software — architecture (HAL/drivers/services/application layers; bare-metal super-loop vs RTOS vs embedded Linux; state machines), complete practical code for MCUs/processors/FPGAs, drivers for chosen sensors/actuators, fault handling, watchdog, low power, OTA, logging, plus libraries/SDKs/toolchains/IDEs/debuggers. Includes a portable, unit-tested C firmware core with ESP-IDF and Arduino ports. Use when writing or structuring firmware for a hardware project.
---

# Firmware

## 1. Architecture (`references/firmware-architecture.md`)
Layers: **HAL** (platform-specific) → **drivers** (one per chip, pure logic over the HAL) → **services** (filtering, fault management, storage, comms, power management) → **application** (state machine). Choose execution model: bare-metal super-loop (simple, deterministic) → RTOS tasks (FreeRTOS/Zephyr: concurrency, radios, multiple rates) → embedded Linux (complex UI/networking/vision). Document the state machine, task/loop timing, ISR responsibilities, memory budget, and the safe state.

## 2. Start from the tested core (`templates/firmware-core`)
Portable C99, no dynamic allocation, unit-tested on the host:
- `hal.h`: the only hardware boundary (GPIO, ADC mV, I²C, time, watchdog, sleep, log)
- `fault.c`: debounced faults with severity, latching, occurrence counters
- `filters.c`: moving average, EMA, median-of-3, debouncer, plausibility (range / rate / stuck), hysteresis controller with min on/off times
- `ringbuf.c`: store-and-forward telemetry buffer
- `app.c`: BOOT → SELF_TEST → RUN ⇄ SAFE state machine: validate → filter → control → actuate → record; actuator feedback check; max-on-time safety; brown-out handling; watchdog fed only after a full cycle
- `board.h`: pins/channels/calibration/thresholds (from PINMAP.md and calc.mjs results)
- Ports: `ports/esp-idf` (ESP-IDF v5.2+: GPIO, calibrated ADC oneshot, new I²C master driver, task watchdog, sleep) and `ports/arduino` (any Arduino core)
- Tests: `make test` (host gcc/clang), `make asan` for sanitizers. **Extend the tests for every behaviour you add.**

Adapt it: rename signals, replace the example control law, add drivers for the selected parts (register-level from the datasheet or a maintained library), keep the HAL boundary.

## 3. Write complete, practical code
- Every driver: init with presence check (ID register/ACK), configuration, read with timeout/CRC check, error codes into the fault manager.
- No blocking delays in time-critical paths; use timers/interrupts; keep ISRs short (set flags, push to queues).
- Explicit units in names (`_mv`, `_ms`, `_pct`); fixed-width integers; wrap-safe time math (`now - start >= period`).
- Configuration in one place (`board.h` / Kconfig / NVS), calibration stored in non-volatile memory with CRC and defaults.
- Low power: sleep between cycles, power-gate peripherals, batch radio use.
- OTA (if connected): signed images, A/B partitions, rollback on failed health check (see The Protectors firmware playbook).
- FPGA projects: HDL (Verilog/VHDL/SystemVerilog) with a testbench per module, simulation (Verilator/Icarus/GHDL), constraints file (pins, clocks), and timing closure report.

## 4. Toolchain (`references/toolchains.md`)
Specify SDK/framework + version, compiler, build system, IDE, flashing & debugging tools (SWD/JTAG probe), static analysis (cppcheck/clang-tidy), unit-test framework, CI.

Output `.hw/FIRMWARE.md` (architecture, state machine, timing, memory, modules, how to build/flash/test) and the code in `.hw/firmware/` (or the project's firmware folder).
