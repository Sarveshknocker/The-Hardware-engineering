# Interface cheat sheet

| Interface | Wires | Typical speed / distance | Must-dos | Common mistakes |
|---|---|---|---|---|
| **GPIO (digital)** | 1 | — | Define idle state (pull-up/down), series R (~33–330 Ω) on lines leaving the board, debounce mechanical inputs | Floating inputs; driving loads directly from pins |
| **ADC** | 1 + GND | — | Source impedance low or add 10–100 nF at pin; divider for higher voltages; RC anti-alias; reference stability; oversample | Exceeding input range; high-impedance dividers without cap; using ADC2 with ESP32 Wi-Fi |
| **PWM** | 1 | kHz–tens of kHz (motors 16–25 kHz to be inaudible) | Gate driver/MOSFET for loads; RC filter for analog-out | PWM directly into motors; wrong frequency for driver |
| **I²C** | SDA, SCL (+GND) | 100 k / 400 k / 1 MHz, < ~1 m on PCB | **One** set of pull-ups sized for bus capacitance; unique addresses; 3.3 V ↔ 5 V via bidirectional shifter (BSS138 / PCA9306) | Multiple breakout pull-ups in parallel; long cables (use buffers like P82B715/PCA9615 differential); address clashes |
| **SPI** | SCLK, MOSI, MISO, CS per device | 1–50+ MHz, short traces | Separate CS per device with pull-ups (deselected at boot); correct mode (CPOL/CPHA); series termination at high speed | Shared MISO with devices that don't tri-state; CS floating at reset |
| **UART** | TX, RX (+GND) | 9600–921600 baud, < ~1–2 m at TTL levels | Cross TX↔RX; match levels; use RS-232/RS-485 transceivers for longer runs | TTL levels over long cables; no common ground |
| **RS-485** | A/B (+GND/shield) | up to ~1200 m at low baud; Modbus RTU | 120 Ω termination at both ends, fail-safe biasing, TVS; isolated transceiver for industrial | Star topology; missing termination; ground loops |
| **CAN / CAN-FD** | CANH/CANL | 125 k–1 M (FD up to 5–8 M data), tens of m | 120 Ω at both ends, transceiver, common-mode choke optional, TVS | Missing termination; stubs too long |
| **USB 2.0 FS** | D+, D− , VBUS, GND | 12 Mb/s | 90 Ω differential routing, ESD protection (e.g. USBLC6-2), CC resistors (5.1 kΩ) for USB-C device, VBUS detection | USB-C without CC resistors (no power from C chargers) |
| **Ethernet** | PHY + magnetics | 10/100 Mb/s | Use a MagJack or discrete magnetics; follow PHY layout guide; 100 Ω differential | Routing without reference plane |
| **1-Wire** | DQ (+GND, parasite) | slow, tens of m | 4.7 kΩ pull-up; strong pull-up for parasite power | Long unterminated star networks |
| **I²S** | BCLK, WS, SD (+MCLK) | audio rates | Short traces, clean clocks | Mixing up Philips/left-justified formats |
| **Wireless** | antenna | — | Use certified modules, respect antenna keep-out, no metal/ground under antenna, enclosure material RF-transparent | Ground pour under module antenna; metal enclosures |

## Level shifting
- Unidirectional push-pull (SPI, UART, GPIO): 74LVC1T45/74AHCT125 (3.3→5 V), resistor divider (5→3.3 V, slow signals only).
- Bidirectional open-drain (I²C): BSS138-based shifter or PCA9306/TCA9406.
- Check VIH: a 3.3 V output often fails a 5 V CMOS input (VIH = 0.7·5 V = 3.5 V), so use HCT/AHCT buffers.

## Grounding
Single ground reference; star or plane; separate high-current return paths (motors, LEDs) from sensitive analog returns; join analog and digital ground at one point near the ADC/regulator when planes are split (usually a solid plane with careful placement is better than splitting).
