# Choosing the processing platform

Pick the **least complex** platform that meets requirements with margin (≈ 30–50 % headroom in CPU, RAM, flash and pins). Verify current specs and prices from datasheets and distributors.

| Need | Typical fit | Why | Watch-outs |
|---|---|---|---|
| Simple sensing/control, lowest cost, 5 V logic | 8-bit AVR/PIC (e.g. ATmega328P, ATtiny, PIC16) | Robust, cheap, simple | Limited RAM/flash, no native wireless |
| General embedded control, rich peripherals, low power | 32-bit Cortex-M MCU (STM32 G0/L0/L4/U5, RP2040/RP2350, nRF52/53/54, SAMD, NXP LPC/MCX) | Mature tooling, timers, ADCs, DMA, low-power modes | Pick the family with the peripherals you need (CAN-FD, USB, crypto, ADC quality) |
| Wi-Fi / BLE connectivity in one chip | ESP32 family (C3/C6/S3/…), Raspberry Pi Pico W/2 W, nRF7002 + host MCU | Integrated radio, pre-certified modules | Wi-Fi peak currents (hundreds of mA), deep-sleep current varies by module/board |
| Ultra-low-power BLE / Thread / Zigbee / Matter | nRF52/53/54, EFR32 (Silicon Labs), ESP32-C6/H2, TI CC26xx | Designed for coin-cell/years battery life | Radio stacks & certification tied to vendor SDKs |
| Long-range low-rate (km) | LoRa (SX126x / LR11xx modules, STM32WL), NB-IoT/LTE-M modules | Range, battery | Duty-cycle regulations, gateway/network needed, low data rates |
| Real-time motor control / power electronics | Motor-control MCUs (STM32G4, TI C2000, Infineon XMC) | High-res PWM, fast ADCs, comparators | Needs control expertise; safety interlocks in hardware |
| Linux, cameras, UI, networking stacks, heavy compute | SBC / MPU (Raspberry Pi, CM modules, i.MX, AM62x, STM32MP) | Rich OS & libraries | Boot time, SD-card corruption risk, higher power, supply-chain lifecycle; use a watchdog & read-only rootfs |
| On-device AI (vision/audio) | MCU with NPU (e.g. ESP32-S3 vector ext., STM32N6, nRF54 + TinyML), Coral/Hailo/Jetson class accelerators | Latency, privacy, offline | Model size/quantisation; thermal; power (see The AI Maker) |
| Deterministic parallel logic, custom interfaces, very high-speed I/O | FPGA (Lattice iCE40/ECP5, AMD/Xilinx Artix/Spartan, Gowin) or MCU + PIO (RP2040) | Hardware parallelism, precise timing | HDL skills, toolchain complexity, power; check if RP2040 PIO or MCU timers suffice first |
| Safety-critical | Safety MCUs (TI Hercules, Infineon AURIX, STM32 with safety packages) + independent hardware interlocks | Lockstep cores, ECC, certification kits | Process & documentation overhead |

## Decision questions
1. Hardest real-time requirement (µs? ms? s?) → bare-metal/RTOS MCU vs Linux.
2. Connectivity → integrated radio SoC vs separate module.
3. Power source & autonomy → sleep current and wake-up energy dominate.
4. Peripherals count & type → pins, ADC channels/quality, timers, CAN, USB, camera, display interfaces.
5. Memory → firmware size, buffers, TLS (≥ ~40–60 KB RAM for TLS), OTA (needs 2× app partition or external flash).
6. Ecosystem & team → SDK quality, examples, community, debugging (SWD/JTAG), your experience.
7. Supply & lifecycle → multiple distributors, longevity programmes for products.

## Module vs chip-down
Pre-certified **modules** (e.g. ESP32-C3-MINI-1, nRF52840 modules, LoRa modules) avoid RF layout and radio certification. Go chip-down only at high volume or tight size/cost targets, with RF expertise.
