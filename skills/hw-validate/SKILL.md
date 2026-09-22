---
name: hw-validate
description: Testing, debugging, calibration, validation and safety for hardware — bring-up procedure, functional/environmental/EMC-precompliance/power/reliability tests, calibration methods, fault injection, production test, a Design FMEA with automated RPN ranking, and failure-mode handling in hardware and firmware. Use when planning how to prove a device works and fails safely.
---

# Validate & make it fail safely

## 1. Failure modes: FMEA
List failure modes per subsystem using `references/failure-modes.md` (sensor, actuator, power, comms, firmware, mechanical, environment, user). For each: effect, cause, severity S, occurrence O, detection D (1–10), current controls, mitigation, owner. Then:
```bash
node <kit>/skills/hw-validate/scripts/fmea.mjs .hw/fmea.json
```
→ `.hw/FMEA.md`, ranked. **Severity ≥ 9 is always HIGH** and needs a hardware-level safeguard (fuse, thermal cutoff, interlock, current limit), not firmware alone. Re-score after mitigation.

## 2. How hardware + firmware handle each failure
For each HIGH/MEDIUM mode define: detection (plausibility, timeouts, feedback, CRC, watchdog, current sense), reaction (safe state, degraded mode, retry with backoff, alert), recovery (automatic vs latched until acknowledged), and logging. The firmware core template implements these patterns; map each failure mode to the code that handles it.

## 3. Test plan (`references/test-plan.md`)
Bring-up → functional → calibration → power/battery → environmental → EMC pre-compliance → reliability/endurance → fault injection → field pilot → production test. Each test has: purpose, setup/equipment, procedure, pass criteria (linked to REQUIREMENTS IDs), and results column.

## 4. Calibration
Identify what needs calibration (sensor offset/gain, ADC reference/divider ratio, load cell, current sense, RTC drift), the method (one/two/multi-point against a reference, temperature compensation), where coefficients are stored (NVS with CRC + defaults), and how to re-calibrate in the field.

Output `.hw/TEST_PLAN.md` and `.hw/FMEA.md`.
