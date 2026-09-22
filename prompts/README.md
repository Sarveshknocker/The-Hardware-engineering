# Ready-to-paste prompts

Agentic tools read the kit automatically (open this repo, or `init` it into your project folder). For **chat-only AIs**, attach `skills/hwmaker/SKILL.md` and the sub-skills, and run the CLI tools yourself when the AI asks (paste the outputs back).

---

### 1. Full design (autonomous)
```
Design this hardware project with the Hardware Engineering kit: <idea>.
Constraints: <budget, power source, environment, size, quantity>.
Research proven designs and datasheets, compare component options, give me the architecture, wiring and pin map,
power budget, PCB notes, complete firmware, test plan, FMEA, BOM and a step-by-step build guide.
```

### 2. Prototype fast (dev boards only)
```
Using the Hardware Engineering kit, design a Stage A prototype of <idea> using off-the-shelf dev boards and breakouts only.
Give me the shopping list, wiring table, pin map (checked with pins.mjs), power budget and working firmware.
```

### 3. Review my existing design
```
Using the Hardware Engineering kit, review my design in <folder / schematic PDF / pin list>.
Run pins.mjs, power.mjs and bom.mjs on it, check protection, grounding and firmware fault handling, and list concrete fixes by severity.
```

### 4. Optimise
```
Using the Hardware Engineering kit, make <existing device> cheaper / smaller / lower-power / more reliable.
Compare alternatives with trade.mjs and quantify the gains (cost from bom.mjs, battery life from power.mjs).
```

### 5. Firmware only
```
Using the Hardware Engineering kit firmware core, write complete firmware for <MCU> that <function>,
with drivers for <parts>, fault handling for every FMEA item, low-power sleep, and host unit tests.
```
