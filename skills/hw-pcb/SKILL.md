---
name: hw-pcb
description: PCB and physical design — stackup, placement, grounding and return paths, decoupling, signal integrity, high-current and thermal design, EMI/EMC, RF/antenna keep-outs, connectors, mechanical/enclosure, DFM/DFA, test points and fabrication/assembly outputs. Use when moving from prototype to a custom PCB or reviewing a layout.
---

# PCB & physical design

Follow `references/pcb-checklist.md` and the **layout guidelines in each critical part's datasheet** (switching regulators, RF modules, high-speed interfaces, precision analog).

## Process
1. **Tooling**: KiCad (free, open) for schematic & layout; generate BOM/CPL for assembly (e.g. JLCPCB/PCBWay/local assemblers); keep libraries with verified footprints (check land patterns against datasheets).
2. **Stackup**: 2-layer for simple, low-speed, low-current boards; **4-layer (Signal–GND–PWR–Signal)** as soon as there's RF, fast digital, switching regulators with sensitive analog, or dense routing. The cost difference is small and it greatly improves EMC.
3. **Placement order**: connectors & mechanical constraints → power entry & protection → regulators (switch-node loops tight) → MCU/module → high-speed parts near their peers → analog front-ends away from noise → decoupling at every supply pin.
4. **Routing**: power & high-current first (width via `calc.mjs trace`), then critical signals (clocks, differential pairs, analog), then the rest. Solid ground reference under signals; no splits under fast traces.
5. **Checks**: ERC/DRC with schematic parity, footprint verification (1:1 print), 3D/enclosure fit, thermal review, test-point coverage, fab-house capability rules (set them in the board's design rules from the fab's published capabilities).
6. **Outputs**: Gerbers/ODB++, drill, BOM, pick-and-place, assembly drawing, fabrication notes (thickness, copper weight, finish, impedance control if needed).

## KiCad automation
```bash
node <kit>/skills/hw-pcb/scripts/kicad.mjs bom   project.kicad_sch     # schematic (all sheets) → .hw/bom.json, no KiCad needed
node <kit>/skills/hw-pcb/scripts/kicad.mjs check .                     # ERC + DRC + schematic parity via kicad-cli → .hw/KICAD_CHECKS.md
node <kit>/skills/hw-pcb/scripts/kicad.mjs fab   project.kicad_pcb     # Gerbers, drill, pick-and-place → .hw/fab/
```
`check` and `fab` need kicad-cli (KiCad ≥ 7; `KICAD_CLI` if not on PATH). Add `MPN` (and `LCSC` for JLCPCB assembly) fields to symbols so the BOM can be checked against live stock. Every ERC/DRC error is fixed before fabrication; every remaining warning is justified in PCB.md. For panelisation and an interactive assembly BOM, the KiCad plugins KiKit and InteractiveHtmlBom are the standard tools.

Output `.hw/PCB.md`: stackup, placement plan (zones), critical routing rules, grounding strategy, thermal plan, EMC measures, connectors & mechanical, DFM notes, test points, and the fab/assembly plan.
