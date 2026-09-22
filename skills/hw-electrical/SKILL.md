---
name: hw-electrical
description: Electrical design & wiring — interfaces (GPIO, ADC, PWM, I²C, SPI, UART, CAN, RS-485, USB, Ethernet, wireless), pull-ups, level shifting, signal conditioning, protection circuits, grounding, connection tables and pin assignments, with circuit calculators (dividers, LED/pull-up resistors, LDO thermal, buck, RC, ADC, trace width) and an automated pin-map/I²C checker. Use when wiring components or creating schematics/pin maps.
---

# Electrical design, wiring & pin maps

## 1. Interface design per connection (`references/interfaces.md`)
For each link: protocol/speed, voltage levels, pull-ups/terminations, cable length, noise environment, and protection. Use the calculators instead of guessing:
```bash
node <kit>/skills/hw-electrical/scripts/calc.mjs divider    --vin-max 14.6 --vout-max 3.0          # battery/voltage sensing into ADC
node <kit>/skills/hw-electrical/scripts/calc.mjs i2c-pullup --vdd 3.3 --cb 150e-12 --mode fast      # pull-up range for the bus
node <kit>/skills/hw-electrical/scripts/calc.mjs led        --vs 3.3 --vf 2.0 --i 0.005
node <kit>/skills/hw-electrical/scripts/calc.mjs ldo        --vin 5 --vout 3.3 --iout 0.4 --theta-ja 60 --ta 50
node <kit>/skills/hw-electrical/scripts/calc.mjs rc         --r 1000 --c 100e-9                    # ADC anti-alias / debounce filter
node <kit>/skills/hw-electrical/scripts/calc.mjs adc        --bits 12 --vref 3.3 --divider-ratio 0.2
node <kit>/skills/hw-electrical/scripts/calc.mjs trace      --current 3 --temp-rise 10 --oz 1       # PCB trace width (IPC-2221)
```

## 2. Protection (`references/protection.md`)
Reverse polarity, over-voltage/transients (TVS), over-current (fuse/PTC/eFuse), ESD on external connectors, flyback on inductive loads, input series resistors, isolation where required (mains, long industrial lines, medical).

## 3. Pin assignment: then check it automatically
Write `.hw/pinmap.json` and run:
```bash
node <kit>/skills/hw-electrical/scripts/pins.mjs .hw/pinmap.json
```
Profiles: `esp32`, `esp32-s3`, `esp32-c3`, `rp2040-pico`, `atmega328p`. It checks non-existent/reserved (flash/PSRAM) pins, strapping pins, input-only pins used as outputs, missing internal pull-ups, non-ADC pins used for ADC, **ADC2 vs Wi-Fi**, fixed peripheral pins (AVR), 5 V signals on 3.3 V pins without level shifting, UART0/USB/JTAG reuse, **I²C address collisions** (40+ common parts, suggests re-strapping) and missing pull-ups. For other MCUs, apply the same checks manually from the datasheet pin-mux table and state that you did.

## 4. Output `.hw/ELECTRICAL.md`
- **Connection table**: `From (part.pin) → To (part.pin) | Signal | Type (power/analog/digital/bus) | Voltage | Notes (pull-up, series R, filter, protection)`
- **Pin map** (generated `PINMAP.md`) with every MCU pin's role
- **Power connections**: every IC's supply pins, decoupling (value, placement), ground strategy
- **Circuit explanations** for each non-trivial sub-circuit (divider, MOSFET driver, level shifter, filter, protection), with calculator outputs
- **Wiring diagram** (Mermaid for prototypes; schematic in KiCad for PCB)
