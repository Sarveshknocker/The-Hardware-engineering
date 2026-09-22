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
