# Benchmark: what leading hardware-design projects do, and what this kit took

Researched October 2026 from the most-starred open-source projects for electronics design automation and part sourcing.
Star counts are from the GitHub API at the time. Only ideas and public data were used; the code here is original
(see [CREDITS.md](../CREDITS.md)).

| Project | Stars | Licence | Best at | Taken into this kit |
|---|---|---|---|---|
| [yaqwsx/jlcparts](https://github.com/yaqwsx/jlcparts) | ~0.8k | MIT | A daily, searchable snapshot of JLCPCB/LCSC stock with price breaks and the Basic/Extended class | `parts.mjs` reads its published data (search index, shards, attribute table) with a 24 h cache |
| [openscopeproject/InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) · [yaqwsx/KiKit](https://github.com/yaqwsx/KiKit) | ~4.6k · ~2k | MIT | Assembly BOMs and panelisation/fab automation for KiCad | `kicad.mjs fab` automates the standard outputs; the PCB skill points to both plugins for assembly and panels |
| [KiCad](https://gitlab.com/kicad/code/kicad) (kicad-cli) | ~3k (mirror) | GPL-3.0 | ERC/DRC, schematic parity, fabrication exports from the command line | `kicad.mjs check` and `fab` call the user's own kicad-cli (no KiCad code included) |
| [atopile/atopile](https://github.com/atopile/atopile) · [tscircuit/tscircuit](https://github.com/tscircuit/tscircuit) · [devbisme/skidl](https://github.com/devbisme/skidl) | ~4k · ~2.8k · ~1.7k | MIT | Circuits as code with automatic part picking and checks | The principle "compute and check, don't eyeball": live part data and KiCad checks feed the same BOM pipeline. Not adopted as a dependency: the kit stays tool-agnostic and works with KiCad projects people already have |
| [platformio/platformio-core](https://github.com/platformio/platformio-core) | ~9.5k | Apache-2.0 | Multi-board firmware builds | Already referenced by the firmware skill; unchanged |

## Measured (live)
- `parts search "ldo 3.3v sot-23-5" --min-stock 1000` returned five in-stock LDOs with price breaks in ~8 s (cold cache).
- `parts lookup ESP32-C3-MINI-1-H4X`: stock 324, Extended, price breaks from $2.97.
- `kicad bom` on KiCad's own hierarchical "video" demo (8 sheets): 189 placed parts → 69 BOM lines.
- Coverage finding: the free snapshot contains LCSC ids ≥ C6374509 only (~120k parts), so classics such as the
  BME280 and AMS1117 are absent. The tool says "unknown" for these and recommends a distributor check or Mouser.

## Fixed along the way
- `bom.mjs` printed "undefined" for parts without an MPN and counted all MPN-less lines as one unique part.
- `bom.mjs` treated LCSC-only lines as unorderable; they are orderable at JLCPCB and now raise a second-source warning instead.
- Search matching: "10k" matched "510k"; matching is now per token.

## Not adopted, and why
- Scraping undocumented distributor endpoints: fragile and against terms of use. Only published data (jlcparts) and
  official APIs (Mouser, with the user's key) are used.
- Hard-coding fab-house capability numbers: they change and differ per order option; the PCB skill tells the AI to
  copy them from the fab's published capabilities into the board's design rules.
- Adding more MCU pin profiles from memory: a wrong profile is worse than none. New profiles need datasheet-verified data.
