# Reading a datasheet like an engineer

Extract these for every chosen part and keep them in COMPONENTS.md with the datasheet revision:

## Absolute maximum vs recommended operating conditions
- **Absolute maximum** ratings are *damage* limits, not operating points. Design to the **recommended operating conditions** with margin.
- Supply range, I/O voltage limits (is the pin 5 V tolerant *only when powered*?), operating temperature grade.

## Electrical characteristics (use min/max, not typical)
- Supply current in each mode (active, idle, sleep, deep sleep) and **peak** current (radio TX bursts, motor start).
- Logic thresholds VIH/VIL/VOH/VOL (level-shifting decisions), output drive current, input leakage.
- ADC: resolution, INL/DNL, ENOB, reference, input impedance/sample-and-hold requirements.
- Timing: startup time, conversion time, bus speeds, setup/hold, wake-up latency.

## Pinout & package
- Pin functions and alternate functions, strapping/boot pins, pins with special constraints (analog-only, input-only, open-drain).
- Package: hand-solderable (SOIC/QFP) vs reflow-only (QFN/BGA), exposed pad (must be soldered to ground/thermal copper), footprint & land pattern.

## Application information
- Typical application circuit and **required external components** (decoupling values & placement, bootstrap caps, inductors, crystals & load caps).
- **Layout guidelines**: follow them exactly for switching regulators, RF, high-speed and precision analog parts.

## Thermal
- θJA / θJC and the copper area they assume; derating curves; thermal pad requirements.

## Interfaces & protocol details
- I²C address(es) and address pins, SPI mode/max clock, UART levels, register maps, CRC, timing of commands.

## Errata & lifecycle
- Silicon errata document (separate PDF!), revision differences, lifecycle status (active/NRND/EOL), second sources.

## Red flags
- Missing min/max values (only typical), "preliminary" datasheets, no errata published for complex chips, parts only available from one marketplace seller, clones/counterfeits of popular parts (buy from authorised distributors).
