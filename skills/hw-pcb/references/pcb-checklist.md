# PCB checklist

## Grounding & return paths
- [ ] Continuous ground plane under all signals (4-layer: layer 2 solid GND)
- [ ] Every signal has an adjacent return path; no traces crossing plane splits
- [ ] High-current returns (motors, LEDs, heaters) don't flow under sensitive analog/ADC areas
- [ ] Ground stitching vias along board edges and around RF/switching areas

## Decoupling & power
- [ ] 100 nF per supply pin, via to ground right at the pad; bulk capacitors per rail
- [ ] Switching regulator: input-cap loop minimal, switch node small, feedback trace away from inductor, follow datasheet layout exactly
- [ ] Trace widths from current (IPC-2221/2152), vias sized/doubled for current and heat
- [ ] Polarity markings and test points on every rail

## Signal integrity
- [ ] Crystal close to MCU, short traces, ground guard, no signals underneath
- [ ] Differential pairs (USB 90 Ω, Ethernet 100 Ω) length-matched with a reference plane; impedance-controlled stackup if needed
- [ ] Series termination (22–33 Ω) on fast clock/SPI lines if long
- [ ] Analog: short high-impedance nodes, guard traces, RC filter at ADC pin, separate from PWM/switch nodes

## EMI / EMC
- [ ] Keep fast edges short; reduce loop areas; ferrites/common-mode chokes on cables that leave the enclosure
- [ ] TVS/ESD at every external connector, placed at the connector, with a short path to ground/chassis
- [ ] Spread-spectrum or slower edge rates where allowed
- [ ] Shielding can footprint provision for sensitive/noisy sections (optional)
- [ ] Pre-compliance scan plan (near-field probe, spectrum analyser, or a lab pre-scan)

## RF
- [ ] Module antenna at the board edge, **no copper (all layers) in the keep-out**, per module datasheet
- [ ] No metal/batteries/displays in the antenna near-field; enclosure RF-transparent
- [ ] 50 Ω feed and matching network footprint (π-network) for chip-down/external antennas; u.FL for testing

## Thermal
- [ ] Thermal pads soldered with via arrays to inner/bottom copper
- [ ] Hot parts (regulators, drivers, LEDs) spread out, away from temperature sensors and batteries
- [ ] Temperature sensor placement measures the environment, not the board (thermal isolation slot, external probe)

## Mechanical & connectors
- [ ] Mounting holes (plated or not, grounded or isolated as needed), keep-outs around screws
- [ ] Connectors: keyed/polarised, locking for vibration, rated current, strain relief; mates available
- [ ] Buttons/LEDs/USB aligned with enclosure openings; tolerance stack-up checked in 3D
- [ ] Conformal coating keep-outs (connectors, test points) if coating is used

## DFM / DFA / test
- [ ] Fab-house design rules (min trace/space, drill, annular ring, solder-mask sliver)
- [ ] Footprints verified; pin 1 & polarity marks on silkscreen; reference designators readable
- [ ] Fiducials for automated assembly; parts on one side if possible (cost)
- [ ] Test points for power rails, debug (SWD/JTAG/UART), key signals; programming header / pogo pads
- [ ] Panelisation & tooling rails per assembler
