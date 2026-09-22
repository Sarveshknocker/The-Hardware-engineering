#!/usr/bin/env node
// Hardware Engineering — FMEA ranker (Design FMEA, AIAG-style 1–10 scales).
// Input .hw/fmea.json: [ { "id": "F1", "item": "Battery", "failureMode": "Over-discharge", "effect": "Cell damage, device dead",
//   "cause": "No UVLO in firmware", "S": 8, "O": 5, "D": 6, "controls": "BMS UVLO 2.8 V", "mitigation": "...", "owner": "..." } ]
// S = severity (10 = hazardous without warning), O = occurrence (10 = almost certain), D = detection (10 = cannot detect).
// RPN = S·O·D. Priority: severity ≥ 9 is always HIGH (safety/regulatory), else by RPN (≥ 120 HIGH, ≥ 60 MEDIUM).
// Usage: node fmea.mjs [.hw/fmea.json] [--out .hw] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function rankFmea(rows) {
  const out = rows.map((r) => {
    for (const k of ['S', 'O', 'D']) if (!Number.isInteger(r[k]) || r[k] < 1 || r[k] > 10) throw new Error(`${r.id ?? r.failureMode}: ${k} must be an integer 1–10`);
    const rpn = r.S * r.O * r.D;
    const priority = r.S >= 9 ? 'HIGH' : rpn >= 120 ? 'HIGH' : rpn >= 60 ? 'MEDIUM' : 'LOW';
    const needs = [];
    if (r.S >= 9) needs.push('safety: design out the hazard or add an independent protection (not firmware-only)');
    if (r.O >= 7) needs.push('reduce occurrence: design change, derating, better part');
    if (r.D >= 7) needs.push('improve detection: self-test, monitoring, production test');
    if (!r.mitigation && priority !== 'LOW') needs.push('mitigation missing');
    return { ...r, rpn, priority, needs };
  });
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority] || b.S - a.S || b.rpn - a.rpn);
}

export function toMarkdown(rows) {
  const counts = rows.reduce((c, r) => ((c[r.priority] = (c[r.priority] ?? 0) + 1), c), {});
  return `# Design FMEA

HIGH ${counts.HIGH ?? 0} · MEDIUM ${counts.MEDIUM ?? 0} · LOW ${counts.LOW ?? 0}  (S ≥ 9 is always HIGH; otherwise RPN ≥ 120 HIGH, ≥ 60 MEDIUM)

| Priority | ID | Item | Failure mode | Effect | Cause | S | O | D | RPN | Current controls | Mitigation | Needs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.priority} | ${r.id ?? ''} | ${r.item} | ${r.failureMode} | ${r.effect} | ${r.cause ?? ''} | ${r.S} | ${r.O} | ${r.D} | **${r.rpn}** | ${r.controls ?? ''} | ${r.mitigation ?? '—'} | ${r.needs.join('; ')} |`).join('\n')}

Re-score after mitigations are implemented and verified; keep the before/after columns in design reviews.
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? '.hw/fmea.json';
  let rows;
  try { rows = rankFmea(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { console.error(e.message); process.exit(2); }
  if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  const out = path.resolve(opt('--out', '.hw'));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'FMEA.md'), toMarkdown(rows));
  for (const r of rows) console.log(`${r.priority.padEnd(6)} RPN ${String(r.rpn).padStart(4)}  S${r.S}  ${r.id ?? ''} ${r.item}: ${r.failureMode}`);
  console.log(`→ ${path.relative(process.cwd(), path.join(out, 'FMEA.md'))}`);
}
