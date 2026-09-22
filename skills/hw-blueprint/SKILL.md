---
name: hw-blueprint
description: Assemble the final Hardware Blueprint — architecture, selected components with justifications, block & wiring diagrams, pin map, power tree and budget, PCB notes, firmware structure and code, BOM & cost, test/validation plan, failure handling, step-by-step implementation guide (prototype → PCB → production) and optimisation opportunities (smaller, faster, cheaper, more reliable, lower power, scalable, innovative). Use as the final step of hardware design.
---

# Hardware Blueprint

1. Fill `references/blueprint-template.md` → `.hw/HARDWARE_BLUEPRINT.md`, linking to the detailed documents (REQUIREMENTS, RESEARCH, ARCHITECTURE, COMPONENTS, TRADE_*, ELECTRICAL, PINMAP, POWER_BUDGET, PCB, FIRMWARE, BOM, TEST_PLAN, FMEA) instead of duplicating them.
2. **Optimisation section (required)**: for each axis (smaller, cheaper, lower power, more reliable, faster, scalable, more innovative), list concrete changes, their trade-offs and when they become worth it (e.g. "at > 1k units move from module to chip-down", "replace LDO with buck-boost: +4 months battery").
3. Quality bar:
   - [ ] Every must-have requirement traced to a design element and a test
   - [ ] Each major component has ≥ 2 alternatives compared and a justification
   - [ ] `pins.mjs`, `power.mjs`, `bom.mjs`, `fmea.mjs` run with no unresolved errors (or errors explained)
   - [ ] All values traceable to datasheets (revision noted) or calculator output
   - [ ] Safety hazards have hardware safeguards; qualified review recommended where required
   - [ ] Firmware builds (or host tests pass) and matches the pin map
   - [ ] Implementation guide is step-by-step and starts with a low-risk prototype
4. Summarise to the user in ≤ 15 lines.
