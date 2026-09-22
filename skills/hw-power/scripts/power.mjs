#!/usr/bin/env node
// Hardware Engineering — power budget & battery-life engine.
//
// Input JSON (.hw/power.json):
// { "source": { "type": "battery", "chemistry": "li-ion" | "lifepo4" | "alkaline-aa" | "nimh-aa" | "coin-cr2032" | "custom",
//               "cells": 1, "capacityMah": 2500, "usableFraction": 0.85, "selfDischargePctPerMonth": 2, "vmin": 3.0, "vmax": 4.2 }
//   | { "type": "dc", "voltage": 12 },
//   "rails": [ { "name": "3V3", "regulator": { "type": "ldo" | "buck" | "boost" | "none", "vout": 3.3, "efficiency": 0.9,
//               "iqUa": 5, "dropoutV": 0.2, "maxMa": 500, "thetaJa": 60 },
//               "loads": [ { "name": "ESP32-S3", "activeMa": 80, "sleepMa": 0.008, "peakMa": 350,
//                            "activeSeconds": 3, "periodSeconds": 600 } ] } ],   // or "dutyCycle": 0.01
//   "ambientC": 40 }
// Usage: node power.mjs [.hw/power.json] [--out .hw] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHEMISTRY = {
  'li-ion': { vmin: 3.0, vmax: 4.2, nominal: 3.7, selfDischargePctPerMonth: 2, notes: 'Needs protection (OV/UV/OC/short), CC/CV charger, temperature-qualified charging (0–45 °C typ.)' },
  lifepo4: { vmin: 2.5, vmax: 3.65, nominal: 3.2, selfDischargePctPerMonth: 3, notes: 'Safer chemistry, flat discharge curve (hard to gauge by voltage), dedicated LiFePO4 charger' },
  'alkaline-aa': { vmin: 0.9, vmax: 1.6, nominal: 1.5, selfDischargePctPerMonth: 0.2, notes: 'Capacity collapses at high current and low temperature' },
  'nimh-aa': { vmin: 1.0, vmax: 1.45, nominal: 1.2, selfDischargePctPerMonth: 15, notes: 'Use low-self-discharge (LSD) cells for long standby' },
  'coin-cr2032': { vmin: 2.0, vmax: 3.2, nominal: 3.0, selfDischargePctPerMonth: 0.1, notes: 'High internal resistance: keep pulses < ~15 mA or buffer with a capacitor; ~220 mAh' },
  custom: { vmin: 0, vmax: 0, nominal: 0, selfDischargePctPerMonth: 0, notes: '' },
};

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

function duty(load) {
  if (typeof load.dutyCycle === 'number') return Math.min(1, Math.max(0, load.dutyCycle));
  if (load.activeSeconds !== undefined && load.periodSeconds) return Math.min(1, load.activeSeconds / load.periodSeconds);
  return 1; // always on
}

export function budget(spec) {
  const src = spec.source ?? { type: 'dc', voltage: 5 };
  const chem = src.type === 'battery' ? { ...CHEMISTRY[src.chemistry ?? 'custom'] } : null;
  if (src.type === 'battery' && !CHEMISTRY[src.chemistry ?? 'custom']) throw new Error(`Unknown chemistry ${src.chemistry}`);
  const cells = src.cells ?? 1;
  const vmin = src.type === 'battery' ? (src.vmin ?? chem.vmin * cells) : src.voltage;
  const vmax = src.type === 'battery' ? (src.vmax ?? chem.vmax * cells) : src.voltage;
  const vnom = src.type === 'battery' ? (src.nominalV ?? chem.nominal * cells) : src.voltage;
  const issues = [];

  const rails = (spec.rails ?? []).map((rail) => {
    const reg = rail.regulator ?? { type: 'none' };
    const loads = (rail.loads ?? []).map((l) => {
      const d = duty(l);
      const avg = (l.activeMa ?? 0) * d + (l.sleepMa ?? 0) * (1 - d);
      return { name: l.name, duty: r4(d), avgMa: r4(avg), activeMa: l.activeMa ?? 0, sleepMa: l.sleepMa ?? 0, peakMa: l.peakMa ?? l.activeMa ?? 0 };
    });
    const railAvg = loads.reduce((s, l) => s + l.avgMa, 0);
    const railPeak = loads.reduce((s, l) => s + l.peakMa, 0);
    const railSleep = loads.reduce((s, l) => s + l.sleepMa, 0);
    const iq = (reg.iqUa ?? 0) / 1000;
    const vout = reg.vout ?? vnom;
    // Current drawn from the source for a given rail current.
    const fromSource = (iRail, vIn) => {
      if (reg.type === 'buck' || reg.type === 'boost') return (vout * iRail) / ((reg.efficiency ?? 0.85) * vIn) + iq;
      return iRail + iq; // LDO / direct: input current ≈ output current
    };
    const srcAvg = fromSource(railAvg, vnom);
    const srcSleep = fromSource(railSleep, vnom);

    if (reg.type === 'ldo' && vmin < vout + (reg.dropoutV ?? 0.2)) issues.push({ level: 'error', rail: rail.name, msg: `LDO drops out: source min ${r2(vmin)} V < ${vout} V + ${reg.dropoutV ?? 0.2} V dropout — use a buck-boost, lower-dropout LDO, or a different cell configuration` });
    if (reg.type === 'buck' && vmin < vout + 0.3) issues.push({ level: 'error', rail: rail.name, msg: `Buck cannot regulate: source min ${r2(vmin)} V is too close to ${vout} V — use a buck-boost` });
    if (reg.type === 'boost' && vmax > vout) issues.push({ level: 'error', rail: rail.name, msg: `Boost output ${vout} V is below source max ${r2(vmax)} V — use a buck-boost or SEPIC` });
    if (reg.maxMa && railPeak > reg.maxMa * 0.8) issues.push({ level: railPeak > reg.maxMa ? 'error' : 'warn', rail: rail.name, msg: `Peak ${r2(railPeak)} mA vs regulator rating ${reg.maxMa} mA — keep ≥ 20 % headroom (Wi-Fi/radio TX and motor start-up are the usual culprits)` });
    let ldoHeat = null;
    if (reg.type === 'ldo') {
      const p = (vmax - vout) * (railPeak / 1000);
      const tj = (spec.ambientC ?? 25) + p * (reg.thetaJa ?? 60);
      ldoHeat = { worstCaseW: r2(p), tjC: r2(tj) };
      if (tj > 105) issues.push({ level: 'error', rail: rail.name, msg: `LDO junction ≈ ${r2(tj)} °C at peak load from ${r2(vmax)} V — use a buck or improve copper/θJA` });
      const eff = vout / vnom;
      if (eff < 0.6 && railAvg > 5) issues.push({ level: 'warn', rail: rail.name, msg: `LDO efficiency ≈ ${Math.round(eff * 100)} % at nominal input with ${r2(railAvg)} mA average — a buck converter would extend battery life` });
    }
    if (railSleep > 0 && iq > railSleep * 2) issues.push({ level: 'warn', rail: rail.name, msg: `Regulator quiescent current ${reg.iqUa} µA dominates sleep current (${r2(railSleep * 1000)} µA) — choose a nano-Iq regulator` });
    return { name: rail.name, regulator: reg.type, vout, loads, railAvgMa: r4(railAvg), railPeakMa: r2(railPeak), railSleepUa: r2(railSleep * 1000), sourceAvgMa: r4(srcAvg), sourceSleepUa: r2(srcSleep * 1000), ldoHeat };
  });

  const totalAvg = rails.reduce((s, r) => s + r.sourceAvgMa, 0) + (spec.otherLeakageUa ?? 0) / 1000;
  const totalPeak = rails.reduce((s, r) => s + r.railPeakMa, 0);
  let life = null;
  if (src.type === 'battery') {
    const usable = (src.capacityMah ?? 0) * (src.usableFraction ?? 0.85);
    const selfPctMonth = src.selfDischargePctPerMonth ?? chem.selfDischargePctPerMonth;
    const selfMa = ((src.capacityMah ?? 0) * selfPctMonth) / 100 / (30 * 24); // self-discharge as an equivalent current
    const hours = usable / (totalAvg + selfMa);
    life = { usableMah: r2(usable), selfDischargeEquivMa: r4(selfMa), hours: r2(hours), days: r2(hours / 24), months: r2(hours / (24 * 30)) };
    if (chem?.notes) issues.push({ level: 'info', rail: 'battery', msg: chem.notes });
    if (src.chemistry === 'coin-cr2032' && totalPeak > 15) issues.push({ level: 'warn', rail: 'battery', msg: `Peak ${r2(totalPeak)} mA is high for a coin cell — add a bulk capacitor or choose AA/Li-ion` });
  }
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { source: { ...src, vmin: r2(vmin), vmax: r2(vmax), vnom: r2(vnom) }, rails, totalAvgMa: r4(totalAvg), totalPeakMa: r2(totalPeak), life, issues, ok: !issues.some((i) => i.level === 'error') };
}

export function toMarkdown(b) {
  const icon = { error: '❌', warn: '⚠️', info: 'ℹ️' };
  return `# Power budget

Source: ${b.source.type === 'battery' ? `${b.source.cells ?? 1}× ${b.source.chemistry}, ${b.source.capacityMah} mAh, ${b.source.vmin}–${b.source.vmax} V (nominal ${b.source.vnom} V)` : `DC ${b.source.vnom} V`}

${b.rails.map((r) => `## Rail ${r.name} (${r.regulator}${r.vout ? `, ${r.vout} V` : ''})
| Load | Active mA | Sleep mA | Peak mA | Duty | Avg mA |
|---|---|---|---|---|---|
${r.loads.map((l) => `| ${l.name} | ${l.activeMa} | ${l.sleepMa} | ${l.peakMa} | ${l.duty} | ${l.avgMa} |`).join('\n')}
| **Rail total** | | ${r.railSleepUa} µA | **${r.railPeakMa}** | | **${r.railAvgMa}** |

From source: average ${r.sourceAvgMa} mA · sleep ${r.sourceSleepUa} µA${r.ldoHeat ? ` · LDO worst-case ${r.ldoHeat.worstCaseW} W → Tj ≈ ${r.ldoHeat.tjC} °C` : ''}
`).join('\n')}
**Total average from source: ${b.totalAvgMa} mA · simultaneous peak: ${b.totalPeakMa} mA**
${b.life ? `\n**Battery life ≈ ${b.life.days} days (${b.life.months} months)**. Usable ${b.life.usableMah} mAh; self-discharge ≈ ${b.life.selfDischargeEquivMa} mA equivalent.\n` : ''}
## Checks ${b.ok ? '✅' : '❌'}
${b.issues.map((i) => `- ${icon[i.level]} **${i.rail}**: ${i.msg}`).join('\n') || '- none'}

_Model: average = Σ(active·duty + sleep·(1−duty)); buck/boost input = Vout·I/(η·Vin) + Iq; LDO input ≈ output current + Iq. Validate with a current profiler (e.g. PPK2, Otii, µCurrent) on real hardware._
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? '.hw/power.json';
  let spec;
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`Cannot read ${file}: ${e.message}`); process.exit(2); }
  let b;
  try { b = budget(spec); } catch (e) { console.error(e.message); process.exit(2); }
  if (args.includes('--json')) { console.log(JSON.stringify(b, null, 2)); process.exit(b.ok ? 0 : 1); }
  const out = path.resolve(opt('--out', '.hw'));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'POWER_BUDGET.md'), toMarkdown(b));
  console.log(`Average ${b.totalAvgMa} mA · peak ${b.totalPeakMa} mA${b.life ? ` · battery life ≈ ${b.life.days} days` : ''}`);
  for (const i of b.issues) console.log(`${i.level.toUpperCase().padEnd(5)} ${i.rail}: ${i.msg}`);
  console.log(`→ ${path.relative(process.cwd(), path.join(out, 'POWER_BUDGET.md'))}`);
  process.exit(b.ok ? 0 : 1);
}
