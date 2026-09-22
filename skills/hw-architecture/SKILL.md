---
name: hw-architecture
description: Hardware system architecture — decompose into subsystems (compute, sensing, actuation, power, communication, storage, HMI, protection), choose processing architecture (MCU vs MPU/SBC vs FPGA vs hybrid), define data flow, control loops and power flow, and compare architecture alternatives with a weighted trade study. Use when designing how a device's subsystems fit together.
---

# System architecture

## 1. Subsystems & block diagram
Decompose into: **compute**, **sensing** (signal conditioning), **actuation** (drivers), **power** (source → protection → conversion → distribution → monitoring), **communication** (local buses, wired/wireless links), **storage**, **HMI** (buttons, LEDs, display, buzzer), **timing** (crystals, RTC), **protection** (ESD, reverse polarity, over-current, isolation), **mechanical/enclosure**.
Draw it as a Mermaid diagram in `.hw/ARCHITECTURE.md` with signal and power arrows labelled by interface (I²C @ 400 kHz, SPI @ 10 MHz, 3V3 @ 350 mA peak…). For every block: role, placement (board/area/enclosure), interfaces, and why it exists.

## 2. Processing architecture: choose deliberately (`references/processor-selection.md`)
MCU (bare-metal / RTOS) vs MPU/SoC running Linux vs FPGA vs MCU + co-processor/radio module vs hybrid. Justify by real-time needs, compute, connectivity, power, boot time, cost, and team skills.

## 3. Data flow & protocols
Table: source → destination, interface/protocol, data rate, latency requirement, error handling (CRC, retries, timeouts), and what happens when the link fails (buffering, safe state). Include cloud/app protocols if connected (MQTT, HTTP/REST, CoAP, BLE GATT, LoRaWAN, Modbus, CAN).

## 4. Control & timing
Loop rates, interrupt vs polling, deterministic timing needs (motor control, sampling), clock sources and accuracy (crystal vs internal RC, RTC for timestamps), time synchronisation.

## 5. Compare architectures
Design ≥ 2 genuinely different architectures (e.g. single Wi-Fi SoC vs low-power MCU + separate radio; SBC vs MCU; off-the-shelf modules vs custom PCB). Score them:
```bash
node <kit>/skills/hw-architecture/scripts/trade.mjs .hw/trade-architecture.json
```
Criteria (1–5, 5 = best): `requirementFit, performance, power, cost, availability, ecosystem, integration, reliability, size, risk`. Profiles: `balanced, battery-iot, cost-sensitive, high-performance, safety-critical, rapid-prototype, harsh-environment`; add hard constraints for must-have requirements. The same engine is used for component trade studies (`hw-components`).

## 6. Output
`.hw/ARCHITECTURE.md`: block diagram, subsystem table (role, placement, interfaces, key parts), processing-architecture decision with reasoning, data-flow table, timing, state machine overview, the trade-study result, and scalability/variants.
