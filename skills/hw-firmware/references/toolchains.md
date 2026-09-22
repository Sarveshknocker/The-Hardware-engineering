# Toolchains, SDKs & debugging

Verify current versions when starting a project.

| Platform | SDK / framework | Build & IDE | Debug / flash |
|---|---|---|---|
| ESP32 family | **ESP-IDF** (production), Arduino-ESP32 (prototyping), ESP-Matter, ESP-RainMaker | idf.py (CMake/Ninja), VS Code ESP-IDF extension, PlatformIO | esptool, USB-Serial/JTAG (S3/C3/C6), ESP-Prog, OpenOCD |
| STM32 | STM32Cube HAL/LL + CubeMX, Zephyr, Rust (embassy) | STM32CubeIDE, VS Code + CMake, PlatformIO | ST-LINK, J-Link, OpenOCD, STM32CubeProgrammer |
| Nordic nRF52/53/54/91 | **nRF Connect SDK (Zephyr-based)** | VS Code nRF Connect extension, west | J-Link (on DKs), nRF Util |
| RP2040 / RP2350 | Pico SDK (C/C++), Arduino-Pico, MicroPython, Rust (embassy-rp) | CMake, VS Code Pico extension | Raspberry Pi Debug Probe (CMSIS-DAP), picotool, UF2 drag-and-drop |
| AVR (ATmega/ATtiny) | avr-libc, Arduino | Arduino IDE, PlatformIO, Microchip Studio/MPLAB X | USBasp, Atmel-ICE, UPDI (tinyAVR) |
| Silicon Labs EFR32 | Simplicity SDK | Simplicity Studio | J-Link |
| Microchip PIC/SAM | MPLAB Harmony, XC compilers | MPLAB X | PICkit, MPLAB Snap |
| Embedded Linux (Pi, i.MX, AM62, STM32MP) | Yocto / Buildroot / Raspberry Pi OS | cross-compilers, VS Code remote | gdbserver, JTAG, serial console |
| FPGA | Lattice Radiant/Diamond, open-source Yosys + nextpnr (iCE40/ECP5), AMD Vivado, Gowin EDA | Verilator / Icarus / GHDL simulation, cocotb testbenches | vendor programmers, openFPGALoader |
| Cross-platform | **Zephyr RTOS**, FreeRTOS, PlatformIO, Rust embedded (embassy, RTIC), MicroPython/CircuitPython (prototypes) | | |

## Always include
- Static analysis: cppcheck, clang-tidy (bugprone, cert), compiler warnings as errors
- Unit tests on host: Unity/Ceedling, GoogleTest, Zephyr ztest, or plain C tests (as in the template)
- CI: build all targets + run host tests on every commit; archive firmware artefacts with version and git hash
- Debugging: SWD/JTAG probe for breakpoints & fault analysis, logic analyser (Saleae/sigrok-compatible) for buses, oscilloscope for power/analog, current profiler (Nordic PPK2, Joulescope, Otii) for low-power work
