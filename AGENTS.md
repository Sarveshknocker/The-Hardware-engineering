# Hardware Engineering kit

## If the user describes a hardware idea or asks for hardware/firmware help
This repository **is** the kit. Treat the request as a call to design a buildable hardware system: open and follow `skills/hwmaker/SKILL.md` (the orchestrator). It routes to `hw-requirements`, `hw-research`, `hw-architecture`, `hw-components`, `hw-electrical`, `hw-power`, `hw-pcb`, `hw-firmware`, `hw-validate` and `hw-blueprint`. Tools run with Node ≥ 18 from this folder (`node bin/hwkit.mjs <pins|power|calc|trade|bom|fmea|research> …`). Write outputs to `.hw/`. Work autonomously; record assumptions instead of asking. Every electrical value must come from a current datasheet you cite. Flag mains, Li-ion and high-energy designs for qualified review.

Sub-agent briefs (if supported): `agents/`.

## If the user wants to change the kit itself
- Skills: `skills/<name>/SKILL.md`, frontmatter `name` (= folder) + `description`; bundled files in `references/`, `templates/`, `scripts/`. The orchestrator must route to every sub-skill and mention every tool (tested).
- Calculators/checkers: zero-dependency Node ≥ 18 ESM, every formula stated in output and covered by a test with a hand-checked value.
- MCU profiles and the I²C table: add only data verified against vendor datasheets/TRMs; keep them conservative.
- Firmware core: C99, no dynamic allocation, `-Wall -Wextra -Werror` clean; every behaviour covered by `tests/test_core.c`.
- Run `npm test` before committing.
