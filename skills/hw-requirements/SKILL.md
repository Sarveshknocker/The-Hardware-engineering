---
name: hw-requirements
description: Deep analysis of a hardware project idea — purpose, users, use cases, operating environment, functional and non-functional requirements (accuracy, speed, range, power, size, cost, lifetime), constraints, safety and regulatory needs — producing measurable requirements. First step of any hardware design.
---

# Requirements: turn the idea into measurable specs

1. **Restate the idea** and identify the *core function* (sense? actuate? communicate? compute? display? store?) and the *value* to the user.
2. **Use cases**: 3–6 concrete scenarios (who, where, what happens step by step, what goes wrong). Include installation, maintenance, charging/battery change, firmware update and end of life.
3. **Environment**: indoor/outdoor, temperature range (commercial 0–70 °C, industrial −40–85 °C, automotive −40–125 °C), humidity/condensation, water/dust (IP rating), UV, vibration/shock, EMI sources nearby (motors, radios), altitude, mounting.
4. **Quantify everything** with `references/requirements-template.md`: every requirement gets an ID, a measurable value with tolerance, priority (must/should/could), and verification method (test, analysis, inspection).
5. **Constraints**: budget per unit at target volume, total development budget, timeline, size/weight, power source (mains, USB, battery, solar, PoE, vehicle 12/24 V), connectivity available on site, maker vs production build, team skills and tools.
6. **Safety & compliance**: hazards (electric shock, fire, burns, moving parts, RF exposure, chemical, laser, medical), applicable regimes. Mark as "confirm with a compliance lab":
   - EMC & radio: FCC Part 15 (US), CE (RED/EMC/LVD, EU), UKCA, ISED (Canada), WPC/ETA (India) etc. **Pre-certified radio modules** greatly reduce radio-certification effort.
   - Safety: IEC 62368-1 (ICT/AV equipment), IEC 60335 (household appliances), IEC 61010 (lab/measurement), IEC 60601 (medical), ISO 26262 (automotive functional safety), IEC 61508 (industrial functional safety).
   - Batteries: UN 38.3 (transport), IEC 62133 (Li-ion safety). Environmental: RoHS, REACH, WEEE.
7. **Success criteria**: how we'll know the prototype works (measurable acceptance tests).

Output `.hw/REQUIREMENTS.md` with an **Assumptions** section for everything you inferred.
