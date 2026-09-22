## Hardware Engineering — idea → buildable hardware system

This workspace has the **Hardware Engineering** kit at `{{KIT}}/`. Whenever the user describes a hardware / electronics / IoT / embedded / robotics / device idea, or asks for components, wiring, pin maps, power design, PCB guidance or firmware — **follow the kit instead of improvising**:

| Task | Open and follow |
|---|---|
| Full autonomous hardware design (end to end) | `{{KIT}}/skills/hwmaker/SKILL.md` |
| Requirements, environment, safety & compliance | `{{KIT}}/skills/hw-requirements/SKILL.md` |
| Research designs, datasheets, app notes, standards | `{{KIT}}/skills/hw-research/SKILL.md` |
| System architecture & processing platform | `{{KIT}}/skills/hw-architecture/SKILL.md` |
| Component options, trade studies, BOM | `{{KIT}}/skills/hw-components/SKILL.md` |
| Interfaces, wiring, protection, pin map | `{{KIT}}/skills/hw-electrical/SKILL.md` |
| Power tree, budget, battery life, thermal | `{{KIT}}/skills/hw-power/SKILL.md` |
| PCB, EMC, mechanical, DFM | `{{KIT}}/skills/hw-pcb/SKILL.md` |
| Firmware architecture & complete code | `{{KIT}}/skills/hw-firmware/SKILL.md` |
| Testing, calibration, FMEA, failure handling | `{{KIT}}/skills/hw-validate/SKILL.md` |
| Final blueprint & implementation guide | `{{KIT}}/skills/hw-blueprint/SKILL.md` |

Sub-agent briefs: `{{KIT}}/agents/`. Calculators/checkers are dependency-free Node ≥ 18; the firmware core builds with any C99 compiler.

**Mode: autonomous** — one idea → `.hw/HARDWARE_BLUEPRINT.md` with all supporting documents and code. Record assumptions instead of asking.
Always: values from current datasheets (cited), compare practical alternatives, compute with the kit tools, design safety into hardware, recommend qualified review for mains/Li-ion/high-energy designs.
