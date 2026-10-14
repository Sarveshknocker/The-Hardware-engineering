---
name: hw-components
description: Component selection for hardware projects — options per role (MCU/SoC/FPGA, sensors, actuators & drivers, communication modules, power ICs, storage, displays, converters, connectors, protection), specifications, pros/cons, compatibility, availability, power, performance and cost; weighted trade studies; final selection with justification; BOM with price breaks and supply-risk checks. Use when choosing parts or building a BOM.
---

# Components: compare, select, justify, cost

## 1. For each role, list ≥ 2–3 practical options
Use `references/component-guide.md` for families and selection criteria. For each option record **from the datasheet**: key specs, supply voltage & logic level, interface, current (active/sleep/peak), accuracy/performance, package (hand-solderable?), operating temperature, price (1/100/1k, source + date), availability/lifecycle, second sources, library/driver support.

## 1b. Check real availability before you commit
```bash
node <kit>/skills/hw-components/scripts/parts.mjs search "ldo 3.3v sot-23-5" --min-stock 1000     # in-stock candidates, cheapest-to-assemble first
node <kit>/skills/hw-components/scripts/parts.mjs lookup ESP32-C3-MINI-1-H4X                       # stock, price breaks, JLCPCB Basic/Extended
```
- Keyless source: the daily jlcparts snapshot of JLCPCB/LCSC stock (~120k parts, newer part numbers). **A miss means "unknown", never "unavailable"**: older classics are not in the snapshot, so check a distributor.
- With a free Mouser API key (`MOUSER_API_KEY`), `lookup` adds lifecycle (Active / NRND / Obsolete), stock and prices from Mouser. Use it for every active part in a production design: a part that is NRND or obsolete is a redesign waiting to happen.
- JLCPCB "Basic"/"Preferred" parts avoid per-part assembly setup fees; prefer them for passives and commodity parts when the specification allows.

## 2. Trade study per critical role
```bash
node <kit>/skills/hw-architecture/scripts/trade.mjs .hw/trade-<role>.json     # e.g. trade-mcu.json, trade-sensor.json
```
Justify each 1–5 score with datasheet numbers in `.hw/COMPONENTS.md`. Hard constraints encode must-haves (e.g. `"power": 4` for a coin-cell device). If "close call", pick the one with the better ecosystem/availability for prototyping and note the alternative.

## 3. Compatibility checks (for the selected set)
- Logic levels between every connected pair (3.3 V vs 5 V; open-drain buses).
- Supply rails available vs required; peak currents vs regulator capacity (`power.mjs`).
- Bus conflicts: I²C addresses, SPI chip selects, UART counts, pin budget (`pins.mjs`).
- Timing/bandwidth: sample rates vs bus speed, interrupt load.
- Mechanical: package, connector types, enclosure fit, thermal.

## 4. Selection statement
For each role: **chosen part → role in the system → placement → why it best meets requirements → what was rejected and why → second source**.

## 5. BOM
Write `.hw/bom.json` (or CSV) with ref, qty, MPN, manufacturer, description, price breaks, supplier, alternates, lifecycle, stock, category. With a KiCad schematic, generate it instead (`hw-pcb`: `kicad.mjs bom`). Then fill live stock/prices/lifecycle and cost it:
```bash
node <kit>/skills/hw-components/scripts/parts.mjs enrich .hw/bom.json     # → BOM_ENRICHMENT.md (dated)
node <kit>/skills/hw-components/scripts/bom.mjs .hw/bom.json --builds 1,100,1000
```
→ `.hw/BOM.md` + `bom.csv` with per-unit cost at each build size and checks (missing MPN, EOL/NRND, no second source for active parts, low stock). Remember that the BOM excludes PCB, assembly, enclosure, test and certification costs: list those separately in the blueprint.
