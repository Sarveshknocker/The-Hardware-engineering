# Firmware architecture patterns

## Execution models
| Model | Use when | Structure |
|---|---|---|
| Super-loop + interrupts | Single main job, few rates, simple devices | `init(); for(;;){ read(); process(); act(); sleep_until_next_tick(); }` with ISRs setting flags |
| Cooperative scheduler | Several periodic jobs, no preemption needed | Table of `{period, last_run, fn}` checked in the loop |
| RTOS (FreeRTOS, Zephyr) | Radio stacks, multiple independent rates, blocking I/O, complex apps | Tasks with priorities, queues for data, event groups, one task owns each peripheral |
| Embedded Linux | Cameras, rich UI, heavy networking, AI frameworks | systemd services, watchdog daemon, read-only rootfs + overlay, A/B updates (RAUC/SWUpdate/Mender) |
| Event-driven / active objects | Complex reactive behaviour | Hierarchical state machines + event queues (e.g. QP framework) |

## Essential services
- **Fault manager**: debounced detection, severity, latching, counters, reporting (template included)
- **Watchdog**: hardware/independent watchdog fed only when all tasks report healthy (task check-in pattern for RTOS)
- **Safe state**: defined for every actuator (off/closed/neutral) and entered on critical faults, brown-out, watchdog reset, or lost communication with a controller
- **Persistent storage**: config + calibration + counters with version and CRC; wear-levelling (NVS/LittleFS) for frequent writes
- **Logging**: levels, ring-buffered, timestamped; reset reason and fault history retained across reboots
- **Power manager**: sleep policy, peripheral power gating, battery monitoring with hysteresis
- **Comms**: connection state machine with exponential backoff, store-and-forward buffer, message schema versioning, time sync
- **Update**: bootloader, signed images, rollback, health check after update

## State machine template
`BOOT → SELF_TEST → (CALIBRATE) → RUN ⇄ (SLEEP) → SAFE/FAULT → (MAINTENANCE/UPDATE)`. Each state lists: entry actions, periodic actions, exit conditions, outputs.

## Coding rules (inspired by MISRA C / BARR-C, pragmatic subset)
- No dynamic allocation after init; bounded loops; no recursion
- Check every return value from drivers/HAL; propagate error codes
- `volatile` for ISR-shared variables; protect multi-byte shared data (critical sections/atomic)
- Integer math where the MCU lacks an FPU; watch overflow in time and ADC arithmetic
- Compile with `-Wall -Wextra -Werror`; static analysis in CI
- Host-side unit tests for logic; hardware-in-the-loop tests for drivers

## Memory budget
Flash: app + libraries + OTA second slot + filesystem. RAM: stacks per task (measure high-water marks), buffers, TLS (~40–60 KB), heap for SDKs. Keep ≥ 25 % headroom.
