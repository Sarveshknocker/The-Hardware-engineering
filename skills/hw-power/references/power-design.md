# Power design notes

## Source selection
| Source | Use when | Notes |
|---|---|---|
| External certified AC-DC adapter (5/12/24 V) | Fixed installations | Moves mains safety out of your product; choose Level VI efficiency |
| USB-C 5 V (sink) | Consumer devices, dev kits | 5.1 kΩ CC pull-downs for 5 V @ up to 3 A; PD controller for higher voltages |
| Li-ion / Li-Po (1S 3.0–4.2 V) | Portable, rechargeable | Protection + charger + (power-path); buck-boost for 3.3 V rail; shipping rules |
| LiFePO4 | Safer, long cycle life, solar storage | Different charge voltage (3.65 V/cell) |
| Primary cells (AA alkaline, lithium AA, Li-SOCl₂) | Multi-year sensors, no charging | Li-SOCl₂ needs pulse buffering (hybrid layer capacitor) |
| Coin cell (CR2032) | Tiny BLE beacons | ~220 mAh, low pulse current capability |
| Solar + battery | Remote outdoor nodes | Size panel for worst-month insolation × 2–3 margin; MPPT charger for > 1 W |
| PoE (802.3af/at) | Networked fixed devices | PD controller + isolated DC-DC or certified module |
| Vehicle 12/24 V | Automotive/industrial | Load dump & cold-crank protection, wide-input bucks (≥ 40–60 V rated) |

## Battery life rule of thumb
Life ≈ usable capacity / average current. Average current is dominated by (a) sleep current × time and (b) radio/active bursts × duty. Reduce whichever term is larger first (`power.mjs` shows both).

## Decoupling & bulk capacitance
- 100 nF ceramic per supply pin, placed at the pin; plus the datasheet's bulk value (1–10 µF) per IC/rail.
- Radios and motors: bulk capacitance near the load (e.g. 100–470 µF low-ESR near a servo/motor driver) to prevent brown-outs.
- Ceramic capacitors lose capacitance with DC bias: choose voltage rating ≥ 2× and check DC-bias curves.

## Monitoring
Battery voltage via switched divider or fuel gauge (MAX17048 for Li-ion), charger status pins to GPIO, current sense (INA2xx) for diagnostics and fault detection.

## Brown-out behaviour
Enable the MCU brown-out detector; firmware stops actuators, saves state and sleeps below a threshold with hysteresis; don't restart radios repeatedly on a dying battery (boot-loop drain).
