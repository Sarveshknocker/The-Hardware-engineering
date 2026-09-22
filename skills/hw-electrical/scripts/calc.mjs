#!/usr/bin/env node
// Hardware Engineering — circuit calculators (zero dependencies). Every result shows its formula.
//
//   node calc.mjs divider     --vin-max 12 --vout-max 3.0 [--r-total 100000]        ADC input divider (E24 values)
//   node calc.mjs led         --vs 3.3 --vf 2.0 --i 0.005                              LED series resistor
//   node calc.mjs i2c-pullup  --vdd 3.3 --cb 100e-12 [--mode standard|fast|fast-plus]  I²C pull-up range
//   node calc.mjs ldo         --vin 5 --vout 3.3 --iout 0.3 [--iq 0.005 --theta-ja 60 --ta 40 --tj-max 125]
//   node calc.mjs buck        --vin 12 --vout 5 --iout 2 [--eff 0.9]
//   node calc.mjs rc          --r 10000 --c 100e-9                                     RC low-pass cutoff
//   node calc.mjs adc         --bits 12 --vref 3.3 [--divider-ratio 0.25]              resolution
//   node calc.mjs trace       --current 2 [--temp-rise 10 --oz 1 --layer external]     IPC-2221 trace width
//   node calc.mjs battery     --capacity-mah 2000 --avg-ma 1.5 [--derating 0.8]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const r3 = (x) => Number(x.toPrecision(3));

/** All E24 values across decades 1 Ω … 10 MΩ. */
const E24_ALL = (() => { const out = []; for (let d = 0; d <= 6; d++) for (const v of E24) out.push(r3(v * 10 ** d)); return out; })();
export const nearestE24 = (x, dir = 'nearest') => {
  if (dir === 'up') return E24_ALL.find((v) => v >= x * 0.9999) ?? E24_ALL.at(-1);
  if (dir === 'down') return [...E24_ALL].reverse().find((v) => v <= x * 1.0001) ?? E24_ALL[0];
  return E24_ALL.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b));
};
export const fmtR = (r) => (r >= 1e6 ? `${r3(r / 1e6)} MΩ` : r >= 1e3 ? `${r3(r / 1e3)} kΩ` : `${r3(r)} Ω`);

/** Voltage divider for ADC inputs: chooses E24 pair so Vout(max) ≤ target, reports source impedance. */
export function divider({ vinMax, voutMax, rTotal = 100_000 }) {
  if (!(vinMax > voutMax && voutMax > 0)) throw new Error('need vin-max > vout-max > 0');
  const ratio = voutMax / vinMax;
  let best = null;
  for (const r2 of E24_ALL.filter((v) => v >= rTotal * ratio * 0.3 && v <= rTotal * ratio * 3)) {
    const r1 = nearestE24(r2 * (1 - ratio) / ratio, 'up'); // R1 rounded up → never exceeds target
    const vout = vinMax * r2 / (r1 + r2);
    if (vout > voutMax) continue;
    const err = (voutMax - vout) / voutMax;
    const sizeErr = Math.abs(Math.log((r1 + r2) / rTotal));
    const score = err + 0.05 * sizeErr;
    if (!best || score < best.score) best = { r1, r2, vout, score };
  }
  const { r1, r2, vout } = best;
  const rth = (r1 * r2) / (r1 + r2);
  return {
    R1_top: fmtR(r1), R2_bottom: fmtR(r2), ratio: r3(r2 / (r1 + r2)), voutAtVinMax: r3(vout),
    usedAdcRange: `${r3((vout / voutMax) * 100)} %`, currentUa: r3((vinMax / (r1 + r2)) * 1e6), sourceImpedance: fmtR(rth),
    formula: 'Vout = Vin·R2/(R1+R2); Rth = R1‖R2',
    notes: [
      rth > 10_000 ? `Source impedance ${fmtR(rth)} is high for many SAR ADCs — add 10–100 nF from ADC pin to GND, or buffer with an op-amp` : 'Source impedance OK for typical SAR ADCs; still add ~100 nF at the ADC pin for noise',
      'Add a series resistor + clamp/TVS if Vin can exceed vin-max (transients, reverse polarity)',
      'Use 1 % resistors and calibrate the ratio in firmware (two-point) for accuracy',
    ],
  };
}

export function led({ vs, vf, i }) {
  if (!(vs > vf && i > 0)) throw new Error('need vs > vf and i > 0');
  const r = (vs - vf) / i;
  const pick = nearestE24(r, 'up');
  const iActual = (vs - vf) / pick;
  return { exactR: fmtR(r), chosenR: fmtR(pick), currentMa: r3(iActual * 1000), resistorPowerMw: r3(iActual ** 2 * pick * 1000), formula: 'R = (Vs − Vf) / I; next E24 value up', notes: ['Check the GPIO source/sink limit (often 10–40 mA per pin, lower total per port)'] };
}

const I2C = { standard: { tr: 1000e-9, iol: 3e-3 }, fast: { tr: 300e-9, iol: 3e-3 }, 'fast-plus': { tr: 120e-9, iol: 20e-3 } };
/** I²C pull-up range per NXP UM10204: Rmin = (Vdd − VOL)/IOL, Rmax = tr / (0.8473·Cb). */
export function i2cPullup({ vdd, cb, mode = 'fast' }) {
  const m = I2C[mode];
  if (!m) throw new Error('mode: standard | fast | fast-plus');
  const vol = vdd > 2 ? 0.4 : 0.2 * vdd;
  const rmin = (vdd - vol) / m.iol;
  const rmax = m.tr / (0.8473 * cb);
  const ok = rmax > rmin;
  const suggested = ok ? nearestE24(Math.min(rmax * 0.8, Math.max(rmin * 1.2, Math.sqrt(rmin * rmax))), 'nearest') : null;
  return {
    mode, rMin: fmtR(rmin), rMax: fmtR(rmax), suggested: suggested ? fmtR(suggested) : 'none — reduce bus capacitance or use a buffer/slower mode',
    formula: 'Rmin = (Vdd − VOL)/IOL; Rmax = tr/(0.8473·Cb)  [UM10204]',
    notes: ['Only ONE set of pull-ups per bus — breakout boards often include their own; parallel pull-ups lower the effective value', 'Cb ≈ 10 pF per device + ~1–3 pF/cm of trace/cable'],
  };
}

export function ldo({ vin, vout, iout, iq = 0, thetaJa = 60, ta = 25, tjMax = 125 }) {
  const p = (vin - vout) * iout + vin * iq;
  const tj = ta + p * thetaJa;
  return {
    dissipationW: r3(p), junctionTempC: r3(tj), efficiency: `${r3((vout * iout) / (vin * (iout + iq)) * 100)} %`,
    verdict: tj > tjMax - 20 ? `❌ Too hot (Tj ${r3(tj)} °C vs max ${tjMax} °C with 20 °C margin) — use a buck converter, larger package/copper, or lower Vin` : '✅ Thermally OK',
    formula: 'P = (Vin − Vout)·Iout + Vin·Iq; Tj = Ta + P·θJA',
    notes: ['θJA from the datasheet assumes a specific copper area — use the value for your layout', 'Check dropout: Vin(min) ≥ Vout + Vdropout at max current'],
  };
}

export function buck({ vin, vout, iout, eff = 0.9 }) {
  const pout = vout * iout, pin = pout / eff;
  return { inputCurrentA: r3(pin / vin), lossW: r3(pin - pout), dutyCycle: r3(vout / vin), formula: 'Iin = Vout·Iout / (η·Vin); D ≈ Vout/Vin', notes: ['Efficiency drops at light load — check the datasheet curve (PFM/burst mode for battery devices)', 'Follow the datasheet layout: tight input-cap loop, short switch node'] };
}

export function rc({ r, c }) {
  const fc = 1 / (2 * Math.PI * r * c);
  return { cutoffHz: r3(fc), timeConstantMs: r3(r * c * 1000), formula: 'fc = 1/(2πRC); τ = RC', notes: ['Anti-aliasing: set fc below half the sampling rate'] };
}

export function adc({ bits, vref, dividerRatio = 1 }) {
  const lsb = vref / 2 ** bits;
  return { lsbMv: r3(lsb * 1000), inputReferredLsbMv: r3((lsb / dividerRatio) * 1000), fullScaleInputV: r3(vref / dividerRatio), formula: 'LSB = Vref / 2^bits', notes: ['Effective bits (ENOB) are lower than nominal — check datasheet; ESP32 ADCs are non-linear near the rails, use calibration APIs', 'Average/oversample for noise reduction'] };
}

/** IPC-2221 trace width: I = k·ΔT^0.44·A^0.725 (A in mil²), k = 0.048 external / 0.024 internal. */
export function trace({ current, tempRise = 10, oz = 1, layer = 'external' }) {
  const k = layer === 'internal' ? 0.024 : 0.048;
  const areaMil2 = (current / (k * tempRise ** 0.44)) ** (1 / 0.725);
  const thicknessMil = oz * 1.378;
  const widthMil = areaMil2 / thicknessMil;
  return { widthMil: r3(widthMil), widthMm: r3(widthMil * 0.0254), crossSectionMil2: r3(areaMil2), formula: 'IPC-2221: A = (I / (k·ΔT^0.44))^(1/0.725); W = A / (1.378·oz)', notes: ['IPC-2221 is conservative for external layers; IPC-2152 is more accurate', 'Add margin for vias (each ~1 A for 0.3 mm drill, check calculator) and connectors'] };
}

export function battery({ capacityMah, avgMa, derating = 0.8 }) {
  const hours = (capacityMah * derating) / avgMa;
  return { hours: r3(hours), days: r3(hours / 24), formula: 'life = capacity·derating / I_avg', notes: ['Derating covers temperature, ageing, cut-off voltage; include self-discharge for multi-month designs (use power.mjs)'] };
}

export const CALCS = { divider, led, 'i2c-pullup': i2cPullup, ldo, buck, rc, adc, trace, battery };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()); const v = rest[i + 1]; o[k] = v !== undefined && !v.startsWith('--') ? (isNaN(Number(v)) ? v : Number(v)) : true; }
  if (!CALCS[cmd]) { console.error(`Usage: node calc.mjs <${Object.keys(CALCS).join('|')}> [--options]  (see header)`); process.exit(2); }
  try {
    const res = CALCS[cmd](o);
    for (const [k, v] of Object.entries(res)) if (k !== 'notes') console.log(`${k.padEnd(22)} ${v}`);
    for (const n of res.notes ?? []) console.log(`  · ${n}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
