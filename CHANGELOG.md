# Changelog

## 0.2.0 — 2026-10-15
Upgrade informed by leading open-source hardware design and sourcing projects (see `research/BENCHMARK.md`).

### Added
- **`parts.mjs`**: keyword search across the daily JLCPCB/LCSC snapshot (stock, price breaks, Basic/Extended class),
  lookup by MPN or LCSC id, optional Mouser lifecycle/stock/prices (`MOUSER_API_KEY`), and `enrich` to fill a BOM with
  dated stock, prices, LCSC ids, MPNs and lifecycle. Token-aware matching; honest "unknown" outside snapshot coverage.
- **`kicad.mjs`**: KiCad 6–9 schematic → BOM (hierarchical sheets, per-instance references, multi-unit parts, DNP,
  exclude-from-BOM, power symbols, MPN/LCSC fields); ERC + DRC + schematic parity and fab exports via kicad-cli.
- Skills: availability check before committing to parts; KiCad automation; rationalizations, red flags, definition
  of done. CLI: `parts`, `kicad`. Evals, Codex plugin manifests.
- Tests: mock jlcparts + Mouser server, enrichment → costing, KiCad hierarchy fixture, ERC/DRC report parsing.

### Fixed
- `bom.mjs`: "undefined" in second-source warnings; unique-part count for lines without MPN; LCSC-only lines are now
  orderable (warning instead of error).

## 0.1.0
- Initial release: requirements, research, architecture, trade studies, calculators, pin and power checkers, BOM,
  firmware core, FMEA, blueprint, installer.
