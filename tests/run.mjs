// Tests for the Hardware Engineering kit. Offline (mocked network). The C firmware core is compiled and its
// unit tests run when a C compiler is found (CC env var, gcc or clang). Pass --live to also query real research APIs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { divider, led, i2cPullup, ldo, buck, rc, adc, trace, battery, nearestE24 } from '../skills/hw-electrical/scripts/calc.mjs';
import { checkPinmap, PROFILES, I2C_DB } from '../skills/hw-electrical/scripts/pins.mjs';
import { budget } from '../skills/hw-power/scripts/power.mjs';
import { decide, PROFILES as TRADE_PROFILES, CRITERIA } from '../skills/hw-architecture/scripts/trade.mjs';
import { analyseBom, unitPrice } from '../skills/hw-components/scripts/bom.mjs';
import { rankFmea } from '../skills/hw-validate/scripts/fmea.mjs';
import { research, DEFAULT_SOURCES } from '../skills/hw-research/scripts/research.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(KIT, 'bin', 'hwkit.mjs');
const node = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hwkit-'));
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------- calculators
test('calc: divider never exceeds the ADC limit and reports source impedance', () => {
  const d = divider({ vinMax: 12, voutMax: 3.0 });
  assert.ok(d.voutAtVinMax <= 3.0 && d.voutAtVinMax > 2.85, `vout ${d.voutAtVinMax}`);
  assert.match(d.sourceImpedance, /kΩ/);
  assert.throws(() => divider({ vinMax: 3, voutMax: 5 }), /vin-max > vout-max/);
});

test('calc: LED, I²C pull-up (UM10204), LDO thermal, buck, RC, ADC, IPC-2221 trace, battery', () => {
  const l = led({ vs: 3.3, vf: 2.0, i: 0.005 });
  assert.equal(l.chosenR, '270 Ω');                      // 260 Ω → next E24 up
  const p = i2cPullup({ vdd: 3.3, cb: 100e-12, mode: 'fast' });
  assert.equal(p.rMin, '967 Ω');                         // (3.3 − 0.4) / 3 mA
  assert.equal(p.rMax, '3.54 kΩ');                       // 300 ns / (0.8473 · 100 pF)
  assert.match(i2cPullup({ vdd: 3.3, cb: 800e-12, mode: 'fast' }).suggested, /none/);  // bus too capacitive
  const hot = ldo({ vin: 12, vout: 3.3, iout: 0.5, thetaJa: 60, ta: 40 });
  assert.equal(hot.dissipationW, 4.35);
  assert.match(hot.verdict, /Too hot/);
  assert.match(ldo({ vin: 5, vout: 3.3, iout: 0.5, thetaJa: 60, ta: 40 }).verdict, /OK/);
  near(buck({ vin: 12, vout: 5, iout: 2, eff: 0.9 }).inputCurrentA, 0.926, 0.001);
  near(rc({ r: 10000, c: 100e-9 }).cutoffHz, 159, 1);
  near(adc({ bits: 12, vref: 3.3 }).lsbMv, 0.806, 0.001);
  near(trace({ current: 2 }).widthMil, 30.8, 0.2);        // matches common IPC-2221 calculators
  near(trace({ current: 2, layer: 'internal' }).widthMil, 80.1, 0.5);
  near(battery({ capacityMah: 2000, avgMa: 1 }).days, 66.7, 0.1);
  assert.equal(nearestE24(4600, 'up'), 4700);
  assert.equal(nearestE24(1050, 'down'), 1000);
});

test('calc CLI prints formulas', () => {
  const r = node([CLI, 'calc', 'i2c-pullup', '--vdd', '3.3', '--cb', '100e-12']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /UM10204/);
});

// ---------------------------------------------------------------- pin checker
test('pins: ESP32 catches input-only output, ADC2+Wi-Fi, 5 V, flash pin, strapping, I²C clash with fix', () => {
  const r = checkPinmap({
    mcu: 'esp32', wifi: true,
    pins: [
      { pin: 'GPIO34', signal: 'RELAY', dir: 'out' },
      { pin: 'GPIO25', signal: 'SOIL', function: 'adc', dir: 'in' },
      { pin: 'GPIO4', signal: 'ECHO', dir: 'in', voltage: 5 },
      { pin: 'GPIO9', signal: 'LED', dir: 'out' },
      { pin: 'GPIO12', signal: 'BUZZER', dir: 'out' },
      { pin: '21', signal: 'SDA', function: 'i2c', dir: 'io' },
      { pin: 'GPIO21', signal: 'DUP', dir: 'out' },
    ],
    i2c: [{ bus: 'I2C0', pullups: null, devices: [{ part: 'MPU6050' }, { part: 'DS3231' }, { part: 'BME280' }] }],
  });
  const msgs = r.issues.map((i) => `${i.level}:${i.msg}`).join('\n');
  assert.equal(r.ok, false);
  for (const re of [/error:input-only/, /error:ADC2 pin is unusable while Wi-Fi/, /error:5 V signal on a 3\.3 V pin/, /error:reserved: SPI flash/, /warn:strapping pin/, /error:pin already assigned/, /error:address 0x68 collision.*Re-strap MPU6050 to 0x69/, /warn:no pull-ups/]) assert.match(msgs, re);
});

test('pins: clean ESP32-C3 map passes; AVR fixed I²C pins; RP2040 5 V; unknown MCU', () => {
  const c3 = checkPinmap({ mcu: 'esp32-c3', wifi: true, pins: [
    { pin: 'GPIO5', signal: 'GATE', dir: 'out' }, { pin: 'GPIO3', signal: 'SENSOR', function: 'adc', dir: 'in' },
    { pin: 'GPIO4', signal: 'VSUP', function: 'adc', dir: 'in' }, { pin: 'GPIO1', signal: 'SDA', function: 'i2c', dir: 'io' }, { pin: 'GPIO0', signal: 'SCL', function: 'i2c', dir: 'out' }],
    i2c: [{ bus: 'I2C0', pullups: '4.7k', devices: [{ part: 'SHT4x' }, { part: 'SSD1306' }] }] });
  assert.equal(c3.ok, true, JSON.stringify(c3.issues));
  assert.ok(checkPinmap({ mcu: 'esp32-c3', pins: [{ pin: 'GPIO5', signal: 'X', function: 'adc' }], wifi: true }).issues.some((i) => /ADC2/.test(i.msg)));
  const avr = checkPinmap({ mcu: 'atmega328p', pins: [{ pin: 'D2', signal: 'SDA', function: 'i2c' }, { pin: 'D4', signal: 'FAN', function: 'pwm', dir: 'out' }, { pin: 'A6', signal: 'BTN_LED', dir: 'out' }] });
  const am = avr.issues.map((i) => i.msg).join('\n');
  assert.match(am, /I2C is fixed to A4=SDA, A5=SCL/);
  assert.match(am, /no hardware PWM/);
  assert.match(am, /input-only/);
  assert.ok(checkPinmap({ mcu: 'rp2040-pico', pins: [{ pin: 'GP2', signal: 'IN5V', voltage: 5, dir: 'in' }] }).issues.some((i) => /5 V signal/.test(i.msg)));
  assert.ok(checkPinmap({ mcu: 'rp2040-pico', pins: [{ pin: 'GP2', signal: 'IN5V', voltage: 5, dir: 'in', levelShifter: true }] }).ok);
  assert.throws(() => checkPinmap({ mcu: 'z80', pins: [] }), /Unknown mcu/);
  assert.equal(Object.keys(PROFILES).length, 5);
  assert.ok(Object.keys(I2C_DB).length >= 40);
});

// ---------------------------------------------------------------- power budget
test('power: duty-cycled budget, self-discharge life, LDO dropout on Li-ion, Iq warning', () => {
  const b = budget({ source: { type: 'battery', chemistry: 'li-ion', capacityMah: 2500 }, ambientC: 40,
    rails: [{ name: '3V3', regulator: { type: 'ldo', vout: 3.3, iqUa: 50, dropoutV: 0.35, maxMa: 500 },
      loads: [{ name: 'MCU', activeMa: 80, sleepMa: 0.008, peakMa: 350, activeSeconds: 3, periodSeconds: 600 }] }] });
  near(b.totalAvgMa, 80 * 0.005 + 0.008 * 0.995 + 0.05, 1e-4);
  near(b.life.days, 2125 / (b.totalAvgMa + 2500 * 0.02 / 720) / 24, 0.05);
  assert.equal(b.ok, false);
  assert.ok(b.issues.some((i) => i.level === 'error' && /drops out/.test(i.msg)));
  assert.ok(b.issues.some((i) => /quiescent/.test(i.msg)));
});

test('power: buck-boost-free design passes with a buck from 2S Li-ion; headroom & coin-cell warnings', () => {
  const ok = budget({ source: { type: 'battery', chemistry: 'li-ion', cells: 2, capacityMah: 3000 },
    rails: [{ name: '3V3', regulator: { type: 'buck', vout: 3.3, efficiency: 0.9, iqUa: 1, maxMa: 1000 }, loads: [{ name: 'SoC', activeMa: 100, sleepMa: 0.01, dutyCycle: 0.01, peakMa: 400 }] }] });
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  assert.ok(ok.rails[0].sourceAvgMa < ok.rails[0].railAvgMa, 'buck from 7.4 V draws less source current than the 3.3 V rail');
  const tight = budget({ source: { type: 'dc', voltage: 5 }, rails: [{ name: '3V3', regulator: { type: 'ldo', vout: 3.3, maxMa: 300 }, loads: [{ name: 'WiFi', activeMa: 100, peakMa: 350 }] }] });
  assert.ok(tight.issues.some((i) => i.level === 'error' && /headroom/.test(i.msg)));
  const coin = budget({ source: { type: 'battery', chemistry: 'coin-cr2032', capacityMah: 220 }, rails: [{ name: 'VBAT', regulator: { type: 'none' }, loads: [{ name: 'BLE', activeMa: 8, sleepMa: 0.002, peakMa: 20, dutyCycle: 0.002 }] }] });
  assert.ok(coin.issues.some((i) => /coin cell/.test(i.msg)));
  const boostBad = budget({ source: { type: 'dc', voltage: 12 }, rails: [{ name: '5V', regulator: { type: 'boost', vout: 5 }, loads: [] }] });
  assert.ok(boostBad.issues.some((i) => /Boost output/.test(i.msg)));
});

// ---------------------------------------------------------------- trade study
test('trade: hardware criteria/profiles, constraints, tie broken by win probability', () => {
  assert.deepEqual(CRITERIA, ['requirementFit', 'performance', 'power', 'cost', 'availability', 'ecosystem', 'integration', 'reliability', 'size', 'risk']);
  assert.equal(Object.keys(TRADE_PROFILES).length, 7);
  for (const w of Object.values(TRADE_PROFILES)) assert.deepEqual(Object.keys(w).sort(), [...CRITERIA].sort());
  const s = (o) => ({ ...Object.fromEntries(CRITERIA.map((k) => [k, 3])), ...o });
  const d = decide({ subsystem: 'MCU', profile: 'battery-iot', constraints: { power: 3 }, candidates: [
    { id: 'A', name: 'wifi-soc', scores: s({ power: 3, cost: 5, ecosystem: 5 }) },
    { id: 'B', name: 'ble-mcu', scores: s({ power: 5, cost: 3 }) },
    { id: 'C', name: 'sbc', scores: s({ power: 1, performance: 5 }) }] });
  assert.equal(d.ranked.find((c) => c.id === 'C').eligible, false);
  assert.equal(d.subsystem, 'MCU');
  const ranked = d.ranked.filter((c) => c.eligible);
  assert.ok(ranked[0].score > ranked[1].score || ranked[0].winProbability >= ranked[1].winProbability);
  const r = node([CLI, 'trade', path.join(writeJson({ subsystem: 'Sensor', candidates: [{ id: 'X', name: 'x', scores: s({}) }, { id: 'Y', name: 'y', scores: s({ cost: 5 }) }] }))]);
  assert.equal(r.status, 0, r.stderr);
});
function writeJson(obj) { const d = tmp(); const f = path.join(d, 'in.json'); fs.writeFileSync(f, JSON.stringify(obj)); return f; }

// ---------------------------------------------------------------- BOM
test('bom: price breaks, per-unit cost at build sizes, lifecycle/MPN/second-source checks, CSV', () => {
  assert.equal(unitPrice({ 1: 2.9, 100: 2.3, 1000: 1.95 }, 250), 2.3);
  assert.equal(unitPrice({ 10: 1.0 }, 1), 1.0);               // below first break → first break price
  const a = analyseBom([
    { ref: 'U1', qty: 1, mpn: 'ESP32-C3-MINI-1-N4', price: { 1: 2.9, 100: 2.3, 1000: 1.95 }, lifecycle: 'active', alternates: [] },
    { ref: 'U2', qty: 1, mpn: 'AP2112K-3.3', price: { 1: 0.4, 100: 0.18, 1000: 0.12 }, lifecycle: 'active', alternates: ['XC6220B331MR'] },
    { ref: 'C1 C2', qty: 2, mpn: 'CL05A106', price: { 1: 0.02, 1000: 0.005 }, lifecycle: 'active' },
    { ref: 'U3', qty: 1, mpn: 'LM7805', price: 0.3, lifecycle: 'obsolete' },
    { ref: 'R1', qty: 1, price: 0.01 },
    { ref: 'U1', qty: 1, mpn: 'DUP', price: 1, dnp: true },
  ]);
  assert.deepEqual(a.costs.map((c) => c.perUnit), [3.65, 2.83, 2.39]);
  const m = a.issues.map((i) => `${i.ref}:${i.msg}`).join('\n');
  assert.match(m, /U3:LM7805: lifecycle OBSOLETE/);
  assert.match(m, /R1:missing manufacturer part number/);
  assert.match(m, /U1:ESP32-C3-MINI-1-N4: no alternate/);
  assert.match(m, /U1:reference designator used twice/);
  assert.equal(a.ok, false);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'b.csv'), 'ref,qty,mpn,price,alternates,lifecycle\nU1,1,X1,1:2;100:1.5,,active\nR1,4,RC0402,0.01,,active\n');
  const r = node([CLI, 'bom', path.join(dir, 'b.csv'), '--out', dir]);
  assert.match(r.stdout, /1 units → \$2\.04\/unit/);
  assert.ok(fs.existsSync(path.join(dir, 'BOM.md')) && fs.existsSync(path.join(dir, 'bom.csv')));
});

// ---------------------------------------------------------------- FMEA
test('fmea: severity ≥ 9 is HIGH regardless of RPN; RPN thresholds; validation', () => {
  const r = rankFmea([
    { id: 'F1', item: 'Cell', failureMode: 'Overcharge', effect: 'Fire', S: 10, O: 2, D: 3, mitigation: 'OVP' },
    { id: 'F2', item: 'Sensor', failureMode: 'Drift', effect: 'Bad data', S: 5, O: 7, D: 6 },
    { id: 'F3', item: 'WiFi', failureMode: 'Drop', effect: 'Gap', S: 3, O: 6, D: 2, mitigation: 'buffer' },
    { id: 'F4', item: 'LED', failureMode: 'Dead', effect: 'No status', S: 2, O: 3, D: 5 },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.priority]), [['F1', 'HIGH'], ['F2', 'HIGH'], ['F3', 'LOW'], ['F4', 'LOW']]);
  assert.ok(r[0].needs.some((n) => /hardware|independent protection/.test(n)));
  assert.ok(r[1].needs.includes('mitigation missing'));
  assert.throws(() => rankFmea([{ id: 'X', S: 11, O: 1, D: 1 }]), /1–10/);
});

// ---------------------------------------------------------------- research (mocked)
test('research: defaults include EE Stack Exchange; normalised output', async () => {
  assert.deepEqual(DEFAULT_SOURCES, ['github', 'electronics', 'hn', 'arxiv', 'openalex', 'wikipedia']);
  const recent = new Date(Date.now() - 10 * 864e5).toISOString();
  const fx = (url) => {
    const u = new URL(url);
    if (u.host === 'api.stackexchange.com') {
      assert.equal(u.searchParams.get('site'), 'electronics');
      return Promise.resolve(Response.json({ items: [{ title: 'LoRa soil moisture node power budget', link: 'https://electronics.stackexchange.com/q/1', score: 30, answer_count: 3, creation_date: 1700000000, tags: ['lora', 'battery'] }] }));
    }
    if (u.host === 'api.github.com') return Promise.resolve(Response.json({ items: [{ full_name: 'a/lora-soil-moisture', html_url: 'https://github.com/a/lora-soil-moisture', description: 'LoRa soil moisture sensor node', stargazers_count: 50, pushed_at: recent, topics: [] }] }));
    return Promise.resolve(new Response('nf', { status: 404 }));
  };
  const run = await research('lora soil moisture node', { fetchImpl: fx, limit: 3 });
  assert.ok(run.items.some((i) => i.source === 'electronics' && i.metrics.answers === 3));
  assert.ok(run.items.some((i) => i.source === 'github'));
});

// ---------------------------------------------------------------- firmware core (C)
const CC = [process.env.CC, 'gcc', 'clang'].filter(Boolean).find((c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0);
if (CC) {
  test(`firmware core: compiles with -Wall -Wextra -Werror (${CC}) and host unit tests pass`, () => {
    const core = path.join(KIT, 'skills/hw-firmware/templates/firmware-core');
    const out = path.join(tmp(), process.platform === 'win32' ? 'test_core.exe' : 'test_core');
    const src = [...fs.readdirSync(path.join(core, 'src')).map((f) => path.join(core, 'src', f)), ...fs.readdirSync(path.join(core, 'tests')).map((f) => path.join(core, 'tests', f))];
    const b = spawnSync(CC, ['-std=c99', '-Wall', '-Wextra', '-Werror', '-Wshadow', '-I', path.join(core, 'include'), ...src, '-lm', '-o', out], { encoding: 'utf8' });
    assert.equal(b.status, 0, b.stderr);
    const r = spawnSync(out, [], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /, 0 failed/);
  });
}

// ---------------------------------------------------------------- installer & skills
test('init → update → remove round-trip keeps user content intact', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Board notes\nKeep.\n');
  let r = node([CLI, 'init', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /Keep\.[\s\S]*\.hw-kit\/skills\/hwmaker\/SKILL\.md/);
  for (const f of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursor/rules/hardware-engineering.mdc', '.windsurf/rules/hardware-engineering.md', '.clinerules/hardware-engineering.md', '.claude/skills/hwmaker/SKILL.md', '.claude/agents/firmware-engineer.md', '.hw-kit/skills/hw-firmware/templates/firmware-core/src/app.c']) assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  r = node([CLI, 'update', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').match(/hardware-engineering:start/g) ?? []).length, 1);
  r = node([CLI, 'remove', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), '# Board notes\nKeep.\n');
  assert.ok(!fs.existsSync(path.join(dir, '.hw-kit')));
});

test('every skill has valid frontmatter, referenced files exist, orchestrator routes to all', () => {
  const skills = fs.readdirSync(path.join(KIT, 'skills'));
  for (const s of skills) {
    const md = fs.readFileSync(path.join(KIT, 'skills', s, 'SKILL.md'), 'utf8');
    const fm = md.match(/^---\nname: ([\w-]+)\ndescription: (.+)\n---/);
    assert.ok(fm, `${s}: bad frontmatter`);
    assert.equal(fm[1], s);
    for (const ref of md.matchAll(/`((?:references|templates|scripts)\/[\w./-]+\.\w+)`/g)) assert.ok(fs.existsSync(path.join(KIT, 'skills', s, ref[1])), `${s}: missing ${ref[1]}`);
  }
  const orch = fs.readFileSync(path.join(KIT, 'skills/hwmaker/SKILL.md'), 'utf8');
  for (const s of skills.filter((x) => x !== 'hwmaker')) assert.ok(orch.includes(s), `orchestrator does not route to ${s}`);
  for (const n of ['pins.mjs', 'power.mjs', 'calc.mjs', 'bom.mjs', 'fmea.mjs', 'trade.mjs']) assert.ok(orch.includes(n), `orchestrator does not mention ${n}`);
});

// ---------------------------------------------------------------- v0.2: live parts, KiCad
const { readSchematic, toBom, parseSexpr, summariseReport, checksMarkdown } = await import('../skills/hw-pcb/scripts/kicad.mjs');
const http = await import('node:http');
const zlib = await import('node:zlib');
const { spawn } = await import('node:child_process');
const nodeAsync = (args, opts = {}) => new Promise((resolve) => {
  const c = spawn(process.execPath, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) } });
  let stdout = ''; let stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  c.on('close', (status) => resolve({ status, stdout, stderr }));
});
const PARTS = path.join(KIT, 'skills/hw-components/scripts/parts.mjs');
const KICAD = path.join(KIT, 'skills/hw-pcb/scripts/kicad.mjs');

/** Mock of the jlcparts static site and the Mouser search API. */
async function mockParts() {
  const gz = (s) => zlib.gzipSync(Buffer.from(s));
  const schema = { lcsc: 0, mfr: 1, joints: 2, description: 3, datasheet: 4, price: 5, img: 6, url: 7, attributes: 8, stock: 9, subcategory: 10 };
  const shard = [JSON.stringify(schema),
    JSON.stringify(['C7000001', 'RT9013-33GB', 5, 'LDO 3.3V 500mA SOT-23-5', 'https://ds/rt9013', [{ qFrom: 1, qTo: 99, price: 0.06 }, { qFrom: 100, qTo: null, price: 0.04 }], null, null, [0], 120000, 1]),
    JSON.stringify(['C7000002', 'XC6206P332MR', 3, 'LDO 3.3V 200mA SOT-23', 'https://ds/xc6206', [{ qFrom: 1, qTo: null, price: 0.03 }], null, null, [1], 900000, 1]),
    JSON.stringify(['C7000003', 'RC0603FR-0710KL', 2, 'Resistor 10kΩ ±1% 0603', null, [{ qFrom: 1, qTo: null, price: 0.001 }], null, null, [1], 5000000, 2]),
    JSON.stringify(['C7000004', 'RC0603FR-07510KL', 2, 'Resistor 510kΩ ±1% 0603', null, [{ qFrom: 1, qTo: null, price: 0.001 }], null, null, [0], 10, 2]),
  ].join('\n');
  const index = [
    'C7000001\tshard-a.jsonl.gz\tc7000001 rt9013-33gb ldo 3.3v 500ma sot-23-5 (ldo) regulators',
    'C7000002\tshard-a.jsonl.gz\tc7000002 xc6206p332mr ldo 3.3v 200ma sot-23 (ldo) regulators',
    'C7000003\tshard-a.jsonl.gz\tc7000003 rc0603fr-0710kl 10kω ±1% 0603 chip resistor',
    'C7000004\tshard-a.jsonl.gz\tc7000004 rc0603fr-07510kl 510kω ±1% 0603 chip resistor',
  ].join('\n');
  const lut = [['Basic/Extended', { values: { 'catalog class 1': ['Extended', 'identifier'] } }], ['Basic/Extended', { values: { 'catalog class 1': ['Basic', 'identifier'] } }]];
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      if (req.url === '/jlc/manifest.json') { res.writeHead(200); return res.end(JSON.stringify({ created: '2026-10-14T00:00:00Z', searchIndex: 'search-index.tsv.gz', attributesLut: 'lut.json.gz' })); }
      if (req.url === '/jlc/search-index.tsv.gz') { res.writeHead(200); return res.end(gz(index)); }
      if (req.url === '/jlc/lut.json.gz') { res.writeHead(200); return res.end(gz(JSON.stringify(lut))); }
      if (req.url === '/jlc/shard-a.jsonl.gz') { res.writeHead(200); return res.end(gz(shard)); }
      if (req.url.startsWith('/mouser/search/partnumber')) {
        const mpn = JSON.parse(body).SearchByPartRequest.mouserPartNumber;
        const parts = mpn === 'BME280' ? [{ ManufacturerPartNumber: 'BME280', Manufacturer: 'Bosch', Description: 'Env sensor', AvailabilityInStock: '4321', LifecycleStatus: 'Not Recommended for New Designs', PriceBreaks: [{ Quantity: 1, Price: '$4.10', Currency: 'USD' }], DataSheetUrl: 'https://ds/bme280', ProductDetailUrl: 'https://mouser/bme280' }] : [];
        res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ SearchResults: { Parts: parts } }));
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, seen, env: { HW_JLCPARTS_URL: `${base}/jlc`, HW_MOUSER_API: `${base}/mouser` } };
}

test('parts: token-aware search ranks Basic parts first; lookup by MPN/LCSC; honest "unknown" outside coverage', async () => {
  const { server, env } = await mockParts();
  const dir = tmp();
  const e = { ...env, HW_CACHE: path.join(dir, 'cache'), MOUSER_API_KEY: '' };
  try {
    let r = await nodeAsync([PARTS, 'search', 'ldo', '3.3v', '--json'], { env: e });
    assert.equal(r.status, 0, r.stderr);
    const s = JSON.parse(r.stdout);
    assert.deepEqual(s.parts.map((p) => p.mpn), ['XC6206P332MR', 'RT9013-33GB'], 'Basic before Extended');
    assert.equal(s.parts[0].assemblyClass, 'Basic'); assert.deepEqual(s.parts[1].priceBreaks, [{ qty: 1, price: 0.06 }, { qty: 100, price: 0.04 }]);
    r = await nodeAsync([PARTS, 'search', '10k', 'resistor', '--json'], { env: e });
    assert.deepEqual(JSON.parse(r.stdout).parts.map((p) => p.lcsc), ['C7000003'], '"10k" must not match "510k"');
    r = await nodeAsync([PARTS, 'search', 'resistor', '--min-stock', '1000', '--json'], { env: e });
    assert.ok(JSON.parse(r.stdout).parts.every((p) => p.stock >= 1000));
    r = await nodeAsync([PARTS, 'lookup', 'C7000001', '--json'], { env: e });
    assert.equal(JSON.parse(r.stdout).results[0].mpn, 'RT9013-33GB');
    r = await nodeAsync([PARTS, 'lookup', 'BME280'], { env: e });
    assert.match(r.stdout, /Unknown: not in the free JLCPCB snapshot \(4 parts, LCSC ids ≥ C7000001/);
    assert.match(r.stdout, /does not mean the part is unavailable/);
  } finally { server.close(); }
});

test('parts enrich: fills stock, prices, JLC class and Mouser lifecycle into bom.json; bom.mjs costs it', async () => {
  const { server, seen, env } = await mockParts();
  const dir = tmp();
  const e = { ...env, HW_CACHE: path.join(dir, 'cache'), MOUSER_API_KEY: 'test-key' };
  fs.writeFileSync(path.join(dir, 'bom.json'), JSON.stringify([
    { ref: 'U1', qty: 1, mpn: 'RT9013-33GB', description: 'LDO' }, { ref: 'U2', qty: 1, mpn: 'BME280', description: 'sensor' },
    { ref: 'R1,R2', qty: 2, lcsc: 'C7000003', description: '10k' }, { ref: 'J1', qty: 1, description: 'USB-C' }, { ref: 'TP1', qty: 1, dnp: true },
  ]));
  try {
    const r = await nodeAsync([PARTS, 'enrich', path.join(dir, 'bom.json'), '--out', dir, '--json'], { env: e });
    assert.equal(r.status, 0, r.stderr);
    const bom = JSON.parse(fs.readFileSync(path.join(dir, 'bom.json'), 'utf8'));
    const u1 = bom.find((l) => l.ref === 'U1'); const u2 = bom.find((l) => l.ref === 'U2'); const r1 = bom.find((l) => l.ref === 'R1,R2');
    assert.equal(u1.lcsc, 'C7000001'); assert.equal(u1.stock, 120000); assert.deepEqual(u1.price, { 1: 0.06, 100: 0.04 }); assert.equal(u1.assemblyClass, 'Extended');
    assert.equal(u2.supplier, 'Mouser'); assert.equal(u2.lifecycle, 'nrnd'); assert.equal(u2.stock, 4321); assert.deepEqual(u2.price, { 1: 4.1 });
    assert.equal(r1.assemblyClass, 'Basic');
    const report = JSON.parse(r.stdout);
    assert.match(report.find((x) => x.ref === 'J1').status, /no MPN/);
    assert.equal(report.find((x) => x.ref === 'TP1').status, 'dnp');
    assert.ok(seen.some((u) => u.includes('apiKey=test-key')));
    assert.match(fs.readFileSync(path.join(dir, 'BOM_ENRICHMENT.md'), 'utf8'), /\| U2 \| BME280 \| ok \| 4321 \|/);
    const cost = node([path.join(KIT, 'skills/hw-components/scripts/bom.mjs'), path.join(dir, 'bom.json'), '--out', dir, '--json']);
    const a = JSON.parse(cost.stdout);
    assert.ok(a.issues.some((i) => /NRND/i.test(i.msg) && i.ref === 'U2'), JSON.stringify(a.issues));
    assert.equal(r1.mpn, 'RC0603FR-0710KL', 'MPN filled from the LCSC record');
    assert.ok(!a.issues.some((i) => i.ref === 'R1,R2' && i.level === 'error'), 'an LCSC-only line is orderable');
    assert.ok(a.issues.some((i) => i.ref === 'J1' && i.level === 'error'));
  } finally { server.close(); }
});

const SUB = `(kicad_sch (version 20231120) (generator "eeschema")
  (lib_symbols (symbol "Device:R" (property "Reference" "R")))
  (symbol (lib_id "Device:R") (at 10 10 0) (unit 1) (in_bom yes) (on_board yes) (dnp no)
    (property "Reference" "R3" (at 0 0 0)) (property "Value" "10k" (at 0 0 0)) (property "Footprint" "Resistor_SMD:R_0603_1608Metric" (at 0 0 0)) (property "LCSC" "C25804" (at 0 0 0))
    (instances (project "demo" (path "/root/sub1" (reference "R3") (unit 1)) (path "/root/sub2" (reference "R4") (unit 1)))))
)`;
const TOP = `(kicad_sch (version 20231120) (generator "eeschema")
  (lib_symbols (symbol "Device:R" (property "Reference" "R")))
  (symbol (lib_id "Device:R") (at 10 10 0) (unit 1) (in_bom yes) (on_board yes)
    (property "Reference" "R1" (at 0 0 0)) (property "Value" "10k" (at 0 0 0)) (property "Footprint" "Resistor_SMD:R_0603_1608Metric" (at 0 0 0)) (property "LCSC" "C25804" (at 0 0 0)))
  (symbol (lib_id "Device:R") (at 20 10 0) (unit 1) (in_bom yes) (on_board yes)
    (property "Reference" "R10" (at 0 0 0)) (property "Value" "10k" (at 0 0 0)) (property "Footprint" "Resistor_SMD:R_0603_1608Metric" (at 0 0 0)) (property "LCSC" "C25804" (at 0 0 0)))
  (symbol (lib_id "Amplifier_Operational:LM324") (at 30 10 0) (unit 1) (in_bom yes)
    (property "Reference" "U1" (at 0 0 0)) (property "Value" "LM324" (at 0 0 0)) (property "Footprint" "Package_SO:SOIC-14" (at 0 0 0)) (property "MPN" "LM324DR" (at 0 0 0)) (property "Manufacturer" "TI" (at 0 0 0)))
  (symbol (lib_id "Amplifier_Operational:LM324") (at 40 10 0) (unit 2) (in_bom yes)
    (property "Reference" "U1" (at 0 0 0)) (property "Value" "LM324" (at 0 0 0)) (property "Footprint" "Package_SO:SOIC-14" (at 0 0 0)) (property "MPN" "LM324DR" (at 0 0 0)))
  (symbol (lib_id "power:GND") (at 0 0 0) (property "Reference" "#PWR01" (at 0 0 0)) (property "Value" "GND" (at 0 0 0)))
  (symbol (lib_id "Connector:TestPoint") (at 0 0 0) (dnp yes) (property "Reference" "TP1" (at 0 0 0)) (property "Value" "TestPoint" (at 0 0 0)) (property "Footprint" "TestPoint:TestPoint_Pad_1.0x1.0mm" (at 0 0 0)))
  (symbol (lib_id "Graphic:Logo") (at 0 0 0) (in_bom no) (property "Reference" "LOGO1" (at 0 0 0)) (property "Value" "Logo" (at 0 0 0)))
  (symbol (lib_id "Device:C") (at 0 0 0) (property "Reference" "C?" (at 0 0 0)) (property "Value" "100nF \\"X7R\\"" (at 0 0 0)) (property "Footprint" "Capacitor_SMD:C_0402_1005Metric" (at 0 0 0)))
  (sheet (at 50 50) (size 10 10) (property "Sheetname" "sub" (at 0 0 0)) (property "Sheetfile" "sub.kicad_sch" (at 0 0 0)))
  (sheet (at 70 50) (size 10 10) (property "Sheetname" "missing" (at 0 0 0)) (property "Sheetfile" "missing.kicad_sch" (at 0 0 0)))
)`;

test('kicad bom: hierarchy, per-instance refs, multi-unit, power/DNP/in_bom flags, grouping, escaped strings', () => {
  assert.deepEqual(parseSexpr('(a "b \\"c\\"" (d 1))'), ['a', { str: 'b "c"' }, ['d', '1']]);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'top.kicad_sch'), TOP); fs.writeFileSync(path.join(dir, 'sub.kicad_sch'), SUB);
  const { parts, warnings } = readSchematic(path.join(dir, 'top.kicad_sch'));
  assert.deepEqual(parts.map((p) => p.ref).sort(), ['C?', 'LOGO1', 'R1', 'R10', 'R3', 'R4', 'TP1', 'U1'].sort());
  assert.ok(warnings.some((w) => /missing sheet file missing\.kicad_sch/.test(w)));
  assert.ok(warnings.some((w) => /unannotated reference\(s\) \(C\?\)/.test(w)));
  const bom = toBom(parts);
  const r = bom.find((l) => l.ref.startsWith('R'));
  assert.equal(r.ref, 'R1,R3,R4,R10', 'natural sort, one line for identical parts across sheets');
  assert.equal(r.qty, 4); assert.equal(r.lcsc, 'C25804');
  const u = bom.find((l) => l.ref === 'U1');
  assert.equal(u.qty, 1, 'a quad op-amp is one part, not four'); assert.equal(u.mpn, 'LM324DR'); assert.equal(u.manufacturer, 'TI');
  assert.ok(!bom.some((l) => l.ref.includes('LOGO1')), 'in_bom no excluded');
  assert.equal(bom.find((l) => l.ref === 'TP1').dnp, true);
  assert.equal(bom.find((l) => l.ref === 'C?').value, '100nF "X7R"');
  const x = node([KICAD, 'bom', path.join(dir, 'top.kicad_sch'), '--out', path.join(dir, 'hw')]);
  assert.equal(x.status, 0, x.stderr);
  assert.match(x.stdout, /8 placed parts → 4 BOM lines/);
  assert.ok(fs.existsSync(path.join(dir, 'hw/bom.json')));
  fs.writeFileSync(path.join(dir, 'old.sch'), 'EESchema Schematic File Version 4');
  assert.equal(node([KICAD, 'bom', path.join(dir, 'old.sch')]).status, 1);
});

test('kicad check: ERC/DRC JSON summarised; clear exit 3 when kicad-cli is missing', () => {
  const erc = { sheets: [{ path: '/', violations: [{ severity: 'error', type: 'pin_not_connected', description: 'Pin not connected', items: [{ description: 'Pin 3 of U1' }] }, { severity: 'warning', type: 'lib_symbol_mismatch', description: 'Symbol differs' }] }] };
  const drc = { violations: [{ severity: 'error', type: 'clearance', description: 'Clearance violation' }], unconnected_items: [{ severity: 'error', description: 'Missing connection' }], schematic_parity: [{ severity: 'warning', type: 'missing_footprint', description: 'J2 has no footprint' }] };
  const e = summariseReport(erc, 'ERC'); const d = summariseReport(drc, 'DRC');
  assert.equal(e.errors, 1); assert.equal(e.warnings, 1); assert.match(e.examples[0], /pin_not_connected: Pin not connected \(Pin 3 of U1\)/);
  assert.equal(d.errors, 2); assert.equal(d.warnings, 1); assert.equal(d.byType['parity: missing_footprint'], 1); assert.equal(d.byType.unconnected_items, 1);
  assert.match(checksMarkdown([e, d]), /## DRC: 2 error\(s\), 1 warning\(s\)/);
  const r = spawnSync(process.execPath, [KICAD, 'check', tmp()], { encoding: 'utf8', env: { ...process.env, KICAD_CLI: path.join(tmp(), 'nope.exe') } });
  assert.equal(r.status, 3); assert.match(r.stderr, /kicad-cli not found/);
});

test('evals well formed; plugin manifests agree with package.json; entry lists every skill', () => {
  const e = JSON.parse(fs.readFileSync(path.join(KIT, 'evals/cases.json'), 'utf8'));
  const ids = new Set();
  for (const c of e.cases) { assert.ok(c.id && !ids.has(c.id)); ids.add(c.id); assert.ok(c.prompt && c.graders.length >= 2 && c.expected, c.id); }
  assert.ok(e.cases.some((c) => c.kind === 'negative'));
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT, 'package.json'), 'utf8'));
  // The plugin keeps its published name (install commands depend on it); versions must match the package.
  const claude = JSON.parse(fs.readFileSync(path.join(KIT, '.claude-plugin/plugin.json'), 'utf8'));
  const codex = JSON.parse(fs.readFileSync(path.join(KIT, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(codex.name, claude.name); assert.equal(claude.version, pkg.version); assert.equal(codex.version, pkg.version);
  const entry = fs.readFileSync(path.join(KIT, 'adapters/entry.md'), 'utf8');
  for (const s of fs.readdirSync(path.join(KIT, 'skills'))) assert.ok(entry.includes(`skills/${s}/SKILL.md`), `entry.md misses ${s}`);
});

if (process.env.LIVE === '1' || process.argv.includes('--live')) {
  test('LIVE: hardware research sources respond', async () => {
    const run = await research('esp32 deep sleep current', { limit: 3 });
    const ok = new Set(run.items.map((i) => i.source));
    assert.ok(ok.size >= 3, `only ${[...ok]}; errors ${JSON.stringify(run.errors)}`);
  });
}

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`✔ ${t.name}`); }
  catch (e) { failed++; console.log(`✖ ${t.name}\n   ${String(e.message).split('\n').slice(0, 10).join('\n   ')}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed${CC ? '' : ' (C firmware tests skipped — no gcc/clang found; set CC)'}`);
process.exit(failed ? 1 : 0);
