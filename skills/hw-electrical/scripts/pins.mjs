#!/usr/bin/env node
// Hardware Engineering — pin-map & bus checker.
// Validates a proposed pin assignment against a curated MCU profile and checks I²C buses for address collisions,
// missing pull-ups and 5 V signals on non-tolerant pins. Profiles cover common maker/production MCUs; for any other
// part, the AI must verify against the datasheet (pin mux tables, strapping pins, errata).
//
// Input JSON (.hw/pinmap.json):
// { "mcu": "esp32" | "esp32-s3" | "rp2040-pico" | "atmega328p", "wifi": true, "octalPsram": false,
//   "pins": [ { "pin": "GPIO21", "signal": "I2C_SDA", "function": "i2c" | "adc" | "pwm" | "gpio" | "uart" | "spi" | "usb" | "dac",
//              "dir": "in" | "out" | "io", "voltage": 3.3, "levelShifter": false } ],
//   "i2c": [ { "bus": "I2C0", "pullups": "4.7k" | null, "devices": [ { "part": "BME280", "address": "0x76" }, { "part": "MPU6050" } ] } ] }
// Usage: node pins.mjs [.hw/pinmap.json] [--out .hw] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Curated from vendor datasheets / technical reference manuals. Keep conservative.
export const PROFILES = {
  esp32: {
    label: 'ESP32 (ESP32-D0WD, e.g. ESP32-WROOM-32)', logicV: 3.3, fiveVTolerant: [],
    gpios: range(0, 39).filter((n) => ![20, 24, 28, 29, 30, 31].includes(n)),
    reserved: { 6: 'SPI flash', 7: 'SPI flash', 8: 'SPI flash', 9: 'SPI flash', 10: 'SPI flash', 11: 'SPI flash' },
    strapping: { 0: 'boot mode (must be high at reset for normal boot)', 2: 'boot mode (must be low/floating for serial download)', 5: 'SDIO timing', 12: 'flash voltage (MTDI) — high at reset selects 1.8 V flash and can brick boot on 3.3 V modules', 15: 'boot log / SDIO timing' },
    inputOnly: [34, 35, 36, 39], noPullups: [34, 35, 36, 39],
    adc1: [32, 33, 34, 35, 36, 37, 38, 39], adc2: [0, 2, 4, 12, 13, 14, 15, 25, 26, 27], dac: [25, 26],
    uart0: { 1: 'UART0 TX (boot log / programming)', 3: 'UART0 RX (programming)' }, usb: {},
    notes: ['ADC2 cannot be used while Wi-Fi is active', 'GPIO 16/17 are used by PSRAM on WROVER modules', 'ADC is non-linear near 0 V and Vref — use esp_adc calibration'],
  },
  'esp32-s3': {
    label: 'ESP32-S3 (e.g. ESP32-S3-WROOM-1)', logicV: 3.3, fiveVTolerant: [],
    gpios: [...range(0, 21), ...range(26, 48)],
    reserved: { 26: 'SPI flash/PSRAM', 27: 'SPI flash/PSRAM', 28: 'SPI flash/PSRAM', 29: 'SPI flash/PSRAM', 30: 'SPI flash/PSRAM', 31: 'SPI flash/PSRAM', 32: 'SPI flash/PSRAM' },
    octalPsramReserved: [33, 34, 35, 36, 37],
    strapping: { 0: 'boot mode', 3: 'JTAG signal source', 45: 'VDD_SPI voltage', 46: 'boot mode / ROM log' },
    inputOnly: [], noPullups: [],
    adc1: range(1, 10), adc2: range(11, 20), dac: [],
    uart0: { 43: 'UART0 TX (boot log)', 44: 'UART0 RX' }, usb: { 19: 'USB D−', 20: 'USB D+' },
    jtag: { 39: 'JTAG MTCK', 40: 'JTAG MTDO', 41: 'JTAG MTDI', 42: 'JTAG MTMS' },
    notes: ['ADC2 conflicts with Wi-Fi', 'On modules with octal PSRAM (e.g. N8R8), GPIO 33–37 are unavailable', 'GPIO 19/20 are the native USB pins'],
  },
  'esp32-c3': {
    label: 'ESP32-C3 (e.g. ESP32-C3-MINI-1 / WROOM-02)', logicV: 3.3, fiveVTolerant: [],
    gpios: range(0, 21),
    reserved: { 12: 'SPI flash (SPIHD)', 13: 'SPI flash (SPIWP)', 14: 'SPI flash (SPICS0)', 15: 'SPI flash (SPICLK)', 16: 'SPI flash (SPID)', 17: 'SPI flash (SPIQ)' },
    strapping: { 2: 'boot configuration (keep high at reset)', 8: 'boot configuration (must be high for serial download)', 9: 'boot mode (low at reset = download mode; often the BOOT button)' },
    inputOnly: [], noPullups: [],
    adc1: [0, 1, 2, 3, 4], adc2: [5], dac: [],
    uart0: { 20: 'UART0 RX (boot log / programming)', 21: 'UART0 TX (boot log)' }, usb: { 18: 'USB D−', 19: 'USB D+ (USB-Serial/JTAG)' },
    notes: ['ADC2 (GPIO5) is not usable with Wi-Fi and is not recommended by Espressif — use ADC1 (GPIO0–4)', 'GPIO0/1 double as the 32 kHz crystal pins', 'GPIO11 is VDD_SPI by default (not a GPIO unless reconfigured via eFuse)'],
  },
  'rp2040-pico': {
    label: 'RP2040 on Raspberry Pi Pico', logicV: 3.3, fiveVTolerant: [],
    gpios: range(0, 29),
    reserved: { 23: 'Pico: SMPS power-save control', 24: 'Pico: VBUS sense', 25: 'Pico: on-board LED', 29: 'Pico: VSYS/3 ADC measurement' },
    strapping: {}, inputOnly: [], noPullups: [],
    adc1: [26, 27, 28, 29], adc2: [], dac: [],
    uart0: {}, usb: {},
    notes: ['All GPIO are 3.3 V only — never apply 5 V', 'PIO can implement extra UART/SPI/I²S/WS2812 interfaces on any GPIO', 'ADC is 12-bit with known DNL spikes (RP2040 errata E11)'],
  },
  atmega328p: {
    label: 'ATmega328P (Arduino Uno / Nano)', logicV: 5, fiveVTolerant: 'all',
    gpios: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
    reserved: {}, strapping: {},
    inputOnly: ['A6', 'A7'], noPullups: ['A6', 'A7'],
    adc1: ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], adc2: [], dac: [],
    pwm: ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'],
    fixed: { i2c: { A4: 'SDA', A5: 'SCL' }, spi: { D10: 'SS', D11: 'MOSI', D12: 'MISO', D13: 'SCK' }, uart: { D0: 'RX', D1: 'TX' } },
    uart0: { D0: 'USB-serial RX (programming)', D1: 'USB-serial TX (programming)' }, usb: {},
    notes: ['A6/A7 exist on Nano (TQFP) only and are analog-input-only', 'D13 has the on-board LED (loads the pin)', 'Interrupt pins: D2, D3 (pin-change interrupts on all)'],
  },
};

// Default 7-bit I²C addresses of common parts [default, ...alternates]. Verify against the exact breakout/datasheet.
export const I2C_DB = {
  BME280: [0x76, 0x77], BMP280: [0x76, 0x77], BME680: [0x76, 0x77], BMP388: [0x77, 0x76], SHT31: [0x44, 0x45], SHT4X: [0x44], AHT20: [0x38], HTU21D: [0x40], SI7021: [0x40],
  MPU6050: [0x68, 0x69], MPU9250: [0x68, 0x69], ICM20948: [0x69, 0x68], LSM6DS3: [0x6a, 0x6b], ADXL345: [0x53, 0x1d], BNO055: [0x28, 0x29],
  DS3231: [0x68], DS1307: [0x68], PCF8563: [0x51], AT24C32: [0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57],
  SSD1306: [0x3c, 0x3d], SH1106: [0x3c, 0x3d], INA219: range(0x40, 0x4f), INA226: range(0x40, 0x4f), ADS1115: [0x48, 0x49, 0x4a, 0x4b], MCP4725: [0x60, 0x61],
  PCF8574: range(0x20, 0x27), PCF8574A: range(0x38, 0x3f), MCP23017: range(0x20, 0x27), TCA9548A: range(0x70, 0x77), PCA9685: range(0x40, 0x7f),
  BH1750: [0x23, 0x5c], TSL2561: [0x39, 0x29, 0x49], VEML7700: [0x10], VL53L0X: [0x29], VL53L1X: [0x29], APDS9960: [0x39],
  SCD30: [0x61], SCD4X: [0x62], SGP30: [0x58], SGP40: [0x59], CCS811: [0x5a, 0x5b], MAX30102: [0x57], MLX90614: [0x5a], TMP102: [0x48, 0x49, 0x4a, 0x4b],
  ATECC608: [0x60], MAX17048: [0x36], BQ27441: [0x55], LTR390: [0x53], QMC5883L: [0x0d], HMC5883L: [0x1e], AS5600: [0x36],
};
const hex = (n) => `0x${n.toString(16).padStart(2, '0')}`;

function normPin(p, profile) {
  const s = String(p).trim().toUpperCase();
  if (typeof profile.gpios[0] === 'string') return s.replace(/^PIN/, '');
  const m = /^(GPIO|IO|GP)?(\d+)$/.exec(s);
  return m ? Number(m[2]) : s;
}

export function checkPinmap(spec) {
  const profile = PROFILES[spec.mcu];
  if (!profile) throw new Error(`Unknown mcu "${spec.mcu}". Profiles: ${Object.keys(PROFILES).join(', ')} — for other parts verify manually against the datasheet.`);
  const issues = [];
  const add = (level, pin, msg) => issues.push({ level, pin: pin ?? '—', msg });
  const used = new Map();

  for (const p of spec.pins ?? []) {
    const pin = normPin(p.pin, profile);
    const label = `${p.pin} (${p.signal})`;
    if (!profile.gpios.includes(pin)) { add('error', label, `pin does not exist / is not a GPIO on ${profile.label}`); continue; }
    if (used.has(pin)) add('error', label, `pin already assigned to ${used.get(pin)}`);
    used.set(pin, p.signal);
    if (profile.reserved[pin]) add('error', label, `reserved: ${profile.reserved[pin]}`);
    if (spec.octalPsram && profile.octalPsramReserved?.includes(pin)) add('error', label, 'reserved by octal PSRAM on this module');
    if (profile.strapping[pin]) add('warn', label, `strapping pin — ${profile.strapping[pin]}. Ensure the attached circuit doesn't force the wrong level at reset`);
    if (profile.uart0[pin]) add('warn', label, `${profile.uart0[pin]} — using it blocks serial programming/logging`);
    if (profile.usb[pin] && p.function !== 'usb') add('warn', label, `${profile.usb[pin]} — reusing it disables native USB`);
    if (profile.jtag?.[pin]) add('info', label, `${profile.jtag[pin]} — fine unless you need JTAG debugging`);
    if ((p.dir === 'out' || p.dir === 'io') && profile.inputOnly.includes(pin)) add('error', label, 'input-only pin cannot drive an output');
    if (p.pullup === 'internal' && profile.noPullups.includes(pin)) add('error', label, 'no internal pull-up on this pin — fit an external resistor');
    if (p.function === 'adc') {
      if (![...profile.adc1, ...profile.adc2].includes(pin)) add('error', label, 'not an ADC-capable pin');
      else if (profile.adc2.includes(pin) && spec.wifi) add('error', label, 'ADC2 pin is unusable while Wi-Fi is active — move to an ADC1 pin');
    }
    if (p.function === 'dac' && !profile.dac.includes(pin)) add('error', label, 'no DAC on this pin');
    if (p.function === 'pwm' && profile.pwm && !profile.pwm.includes(pin)) add('error', label, 'no hardware PWM on this pin');
    if (profile.fixed) for (const [fn, map] of Object.entries(profile.fixed)) {
      if (p.function === fn && !map[pin]) add('error', label, `${fn.toUpperCase()} is fixed to ${Object.entries(map).map(([k, v]) => `${k}=${v}`).join(', ')} on this MCU`);
    }
    const v = p.voltage ?? profile.logicV;
    const tolerant = profile.fiveVTolerant === 'all' || profile.fiveVTolerant.includes(pin);
    if (v > profile.logicV + 0.3 && !tolerant && !p.levelShifter) add('error', label, `${v} V signal on a ${profile.logicV} V pin — add a level shifter or divider (and protection)`);
    if (v < profile.logicV * 0.7 && p.dir !== 'out' && !p.levelShifter) add('warn', label, `${v} V signal may not reach the ${profile.logicV} V input-high threshold — check VIH or add a level shifter`);
  }

  const buses = [];
  for (const bus of spec.i2c ?? []) {
    const taken = new Map();
    const devs = [];
    for (const d of bus.devices ?? []) {
      const known = I2C_DB[String(d.part).toUpperCase().replace(/[-\s]/g, '')];
      const addr = d.address !== undefined ? Number(d.address) : known?.[0];
      if (addr === undefined || Number.isNaN(addr)) { add('warn', bus.bus, `${d.part}: unknown address — take it from the datasheet`); continue; }
      if (taken.has(addr)) {
        const other = taken.get(addr);
        const altsOf = (part) => (I2C_DB[String(part).toUpperCase().replace(/[-\s]/g, '')] ?? []).filter((a) => a !== addr && !taken.has(a));
        const mine = altsOf(d.part), theirs = altsOf(other);
        const fix = mine.length ? `Re-strap ${d.part} to ${mine.map(hex).join('/')}`
          : theirs.length ? `Re-strap ${other} to ${theirs.map(hex).join('/')} (e.g. address-select pin high)`
          : 'Neither part has a free alternate address — use a second I²C bus or an I²C mux (TCA9548A)';
        add('error', bus.bus, `address ${hex(addr)} collision: ${other} and ${d.part}. ${fix}`);
      } else taken.set(addr, d.part);
      devs.push({ part: d.part, address: hex(addr) });
    }
    if (!bus.pullups) add('warn', bus.bus, 'no pull-ups declared — I²C needs one set of pull-ups per bus (size them with calc.mjs i2c-pullup)');
    buses.push({ bus: bus.bus, devices: devs });
  }

  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { mcu: profile.label, pins: (spec.pins ?? []).map((p) => ({ ...p, pinNormalized: normPin(p.pin, profile) })), buses, issues, notes: profile.notes, ok: !issues.some((i) => i.level === 'error') };
}

export function toMarkdown(r) {
  const icon = { error: '❌', warn: '⚠️', info: 'ℹ️' };
  return `# Pin map — ${r.mcu}

| Pin | Signal | Function | Dir | Voltage | Notes |
|---|---|---|---|---|---|
${r.pins.map((p) => `| ${p.pin} | ${p.signal} | ${p.function ?? 'gpio'} | ${p.dir ?? '—'} | ${p.voltage ?? '—'} | ${[p.levelShifter && 'level shifter', p.pullup && `pull-up: ${p.pullup}`, p.note].filter(Boolean).join('; ')} |`).join('\n')}

${r.buses.map((b) => `**${b.bus}**: ${b.devices.map((d) => `${d.part} @ ${d.address}`).join(', ')}`).join('  \n')}

## Checks ${r.ok ? '✅ no errors' : '❌ errors found'}
${r.issues.map((i) => `- ${icon[i.level]} **${i.pin}**: ${i.msg}`).join('\n') || '- none'}

## MCU notes
${r.notes.map((n) => `- ${n}`).join('\n')}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? '.hw/pinmap.json';
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`Cannot read ${file}: ${e.message}`); process.exit(2); }
  let r;
  try { r = checkPinmap(spec); } catch (e) { console.error(e.message); process.exit(2); }
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }
  const out = path.resolve(opt('--out', '.hw'));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'PINMAP.md'), toMarkdown(r));
  for (const i of r.issues) console.log(`${i.level.toUpperCase().padEnd(5)} ${i.pin}: ${i.msg}`);
  console.log(`${r.ok ? '✔ no errors' : '✖ errors found'} → ${path.relative(process.cwd(), path.join(out, 'PINMAP.md'))}`);
  process.exit(r.ok ? 0 : 1);
}
