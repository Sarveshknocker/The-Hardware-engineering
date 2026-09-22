# The Hardware Engineering kit

**Describe a hardware idea. Your AI coding assistant then works as a deep-research hardware architect, electronics engineer, embedded engineer and firmware developer. It turns the idea into a technically feasible, optimised, buildable, testable and real-world-ready system, with computed values, checked wiring and tested firmware.**

Works with **Claude Code, OpenAI Codex, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Cline/Roo, Aider, Jules, Amp, Zed**, and chat-only AIs. IoT sensors, robots, wearables, home automation, agriculture, industrial monitoring, motor control, instruments, drones, anything with electronics.

```
idea ─► Requirements ─► Research ─► Architecture ─► Components ─► Electrical ─► Power ─► PCB ─► Firmware ─► Validation ─► Blueprint
        environment,    datasheets,  subsystems,     ≥2 options,   wiring,       tree,     EMC,   tested C    FMEA, tests,  BOM, pin map,
        safety,         app notes,   MCU vs SBC      trade study   pin checker,  budget,   DFM    core +      calibration   step-by-step
        compliance      open designs vs FPGA         + BOM cost    calculators   battery          ports                     build guide
```

## Why it's different: engineering tools, not just prose
LLMs are good at explaining electronics but make confident mistakes with numbers and pinouts. This kit makes the AI **compute and check**:

| Tool | What it catches / computes |
|---|---|
| `pins.mjs`: pin-map & I²C checker | Non-existent or flash-reserved pins, **strapping pins**, input-only pins used as outputs, **ADC2 used with Wi-Fi**, non-ADC pins, AVR fixed peripheral pins, **5 V into 3.3 V pins**, UART0/USB/JTAG reuse, **I²C address collisions** across 40+ common parts (with the fix, e.g. "re-strap MPU6050 to 0x69"), missing pull-ups. Profiles: ESP32, ESP32-S3, ESP32-C3, RP2040/Pico, ATmega328P |
| `power.mjs`: power budget | Duty-cycled average/peak/sleep current per rail, LDO vs buck efficiency and quiescent current, **battery life including self-discharge**, **LDO dropout at low battery** (the classic 1-cell Li-ion → 3.3 V trap), regulator headroom vs radio/motor peaks, LDO junction temperature, coin-cell pulse limits |
| `calc.mjs`: circuit calculators | ADC dividers (E24 values, never over range, source impedance), LED resistors, **I²C pull-up range per NXP UM10204**, LDO thermal, buck currents, RC filters, ADC resolution, **IPC-2221 trace width**, battery life |
| `trade.mjs`: trade studies | Weighted comparison of parts/architectures with 7 profiles (battery-IoT, cost-sensitive, high-performance, safety-critical, rapid-prototype, harsh-environment…), hard constraints and Monte-Carlo robustness |
| `bom.mjs`: BOM costing | Per-unit cost at 1/100/1000 with price breaks, **obsolete/NRND parts**, missing MPNs, no second source, low stock, duplicate designators; CSV export |
| `fmea.mjs`: Design FMEA | RPN ranking with **severity-first** priority (S ≥ 9 always needs a hardware safeguard) |
| `research.mjs` | Open designs & firmware (GitHub), **EE Stack Exchange**, HN, arXiv, OpenAlex, Wikipedia; the AI adds datasheets, errata, app notes and distributor data via web search |
| **Firmware core** (C99) | Portable HAL + fault manager + filters + plausibility checks + hysteresis control with min on/off times + store-and-forward buffer + BOOT→SELF_TEST→RUN⇄SAFE state machine, watchdog, brown-out and actuator-feedback handling. **54 host unit tests**, `-Wall -Wextra -Werror` clean, **ESP-IDF v5 and Arduino ports** |

## Your 16 requirements → where they live
| # | Requirement | Skill / output |
|---|---|---|
| 1 | Complete architecture, subsystems working together | `hw-architecture` → ARCHITECTURE.md (block diagram) |
| 2–4 | Component families, multiple options with specs/pros/cons/power/cost, selection & why | `hw-components` + `trade.mjs` → COMPONENTS.md, TRADE_*.md |
| 5 | Role & placement of each component | ARCHITECTURE.md + COMPONENTS.md |
| 6–7 | Connections (GPIO/ADC/PWM/I²C/SPI/UART/CAN/USB/Ethernet/wireless, pull-ups, level shifting, protection), pin tables | `hw-electrical` + `calc.mjs`, `pins.mjs` → ELECTRICAL.md, PINMAP.md |
| 8 | Power architecture, battery, regulators, protection, thermal, optimisation | `hw-power` + `power.mjs` → POWER_BUDGET.md |
| 9 | PCB: SI, grounding, EMI/EMC, placement, connectors, thermal | `hw-pcb` → PCB.md |
| 10 | Protocols & data flow | ARCHITECTURE.md § data flow |
| 11–13 | Firmware architecture, complete code, SDKs/toolchains/IDEs | `hw-firmware` + tested firmware core → FIRMWARE.md, firmware/ |
| 14–15 | Testing, debugging, calibration, validation, safety, failure modes & handling | `hw-validate` + `fmea.mjs` → TEST_PLAN.md, FMEA.md |
| 16 | Smaller / faster / cheaper / more reliable / lower-power / scalable / innovative | HARDWARE_BLUEPRINT.md § optimisation |

## Use it
**Option A: open this repo directly** in your AI tool and describe the idea:
> Design a solar-powered soil-moisture node that waters a small garden bed with a 12 V pump and reports to my phone. Budget ~$25 per unit.

**Option B: install into a project folder:**
```bash
npx github:Sarveshknocker/The-Hardware-engineering init path/to/project
```
`init` adds instruction files for every AI tool without touching your existing text. Use `update` to refresh and `remove` to uninstall; your `.hw/` outputs are kept.

**Option C: Claude Code plugin**: `/plugin marketplace add Sarveshknocker/The-Hardware-engineering` then `/plugin install hardware-engineering@hardware-engineering`.

It runs **autonomously** and produces `.hw/`: REQUIREMENTS, RESEARCH, ARCHITECTURE, COMPONENTS, TRADE_*, ELECTRICAL, PINMAP, POWER_BUDGET, PCB, FIRMWARE (+ code), TEST_PLAN, FMEA, BOM (+ CSV) and **HARDWARE_BLUEPRINT.md**. The blueprint includes a step-by-step build guide: dev-board prototype → custom PCB → production.

More prompts: [prompts/README.md](prompts/README.md).

## CLI (usable without an AI too)
```bash
node bin/hwkit.mjs pins     .hw/pinmap.json
node bin/hwkit.mjs power    .hw/power.json
node bin/hwkit.mjs calc     i2c-pullup --vdd 3.3 --cb 150e-12 --mode fast
node bin/hwkit.mjs calc     divider --vin-max 14.6 --vout-max 3.0
node bin/hwkit.mjs trade    .hw/trade-mcu.json
node bin/hwkit.mjs bom      .hw/bom.csv --builds 1,100,1000
node bin/hwkit.mjs fmea     .hw/fmea.json
node bin/hwkit.mjs research "lora soil moisture node"
```
Firmware core: `cd skills/hw-firmware/templates/firmware-core && make test`.

## Safety
Designs involving mains voltage, lithium batteries, high current, heaters, motors or anything that can injure people must be reviewed by a qualified engineer and certified where required. The kit designs hardware safeguards in (fuses, thermal cutoffs, protection ICs, isolation), flags these cases explicitly, and never relies on firmware alone for safety.

## Limitations
- **Datasheets are the source of truth.** MCU profiles and the I²C address table are curated conveniences. The AI is instructed to verify every value against the current datasheet and errata.
- **Prices and stock change daily.** The BOM tool computes; the AI must look up and date the prices.
- **The ESP-IDF and Arduino ports are written against current APIs but haven't been compiled in CI**, because that needs those SDKs. The portable core is compiled and unit-tested. Build the ports once on your toolchain.
- **Paper designs need bring-up.** The test plan starts with a current-limited, step-by-step bring-up for exactly that reason.

## Related kits
[Idea Enhancer](https://github.com/Sarveshknocker/-Idea-Enhancer-and-Value-Maximiser) (concept & business) · [The AI Maker](https://github.com/Sarveshknocker/The-Ai-Maker-) (on-device AI) · [The-protectors-](https://github.com/Sarveshknocker/The-protectors-) (firmware & IoT security) · [3D-animated-web-developer](https://github.com/Sarveshknocker/3D-animated-web-developer) (product website).

## Develop
```bash
npm test            # all calculators/checkers + C firmware core (if gcc/clang is available)
npm run test:live   # + real research APIs
```
License: MIT.
