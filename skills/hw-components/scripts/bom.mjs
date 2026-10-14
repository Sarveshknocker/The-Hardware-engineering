#!/usr/bin/env node
// Hardware Engineering — BOM costing & supply-risk checker.
// Input: .hw/bom.json  [ { "ref": "U1", "qty": 1, "mpn": "ESP32-C3-MINI-1-N4", "manufacturer": "Espressif", "description": "Wi-Fi/BLE module",
//                          "price": { "1": 2.9, "100": 2.3, "1000": 1.95 } | 2.5, "supplier": "LCSC", "alternates": ["..."],
//                          "lifecycle": "active" | "nrnd" | "eol" | "obsolete" | "unknown", "stock": 12000, "dnp": false, "category": "..." } ]
//        or a CSV with the same column names (alternates separated by ';', price breaks as "1:2.9;100:2.3").
// Usage: node bom.mjs [.hw/bom.json|bom.csv] [--builds 1,100,1000] [--out .hw] [--json]
// Prices must come from current distributor data (the AI looks them up and cites the date) — none are built in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const split = (l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((s) => s.trim()); };
  const [head, ...rows] = lines.map(split);
  return rows.map((r) => {
    const o = Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']));
    if (o.qty) o.qty = Number(o.qty);
    if (o.stock) o.stock = Number(o.stock);
    if (o.dnp) o.dnp = /^(1|true|yes|dnp)$/i.test(o.dnp);
    o.alternates = String(o.alternates ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    for (const k of ['mpn', 'manufacturer', 'lifecycle', 'supplier', 'category']) if (o[k] === '') delete o[k];
    if (o.price) o.price = o.price.includes(':') ? Object.fromEntries(o.price.split(';').map((p) => p.split(':').map((x) => x.trim())).map(([k, v]) => [k, Number(v)])) : Number(o.price);
    return o;
  });
}

/** Unit price for an order quantity: highest price break ≤ quantity. */
export function unitPrice(price, orderQty) {
  if (typeof price === 'number') return price;
  if (!price || typeof price !== 'object') return null;
  const breaks = Object.entries(price).map(([q, p]) => [Number(q), Number(p)]).sort((a, b) => a[0] - b[0]);
  let best = null;
  for (const [q, p] of breaks) if (q <= orderQty) best = p;
  return best ?? breaks[0]?.[1] ?? null;
}

/** Accept loosely-typed rows (JSON written by hand or by an AI): alternates as array, numbers as numbers. */
export function normalise(items) {
  return items.map((it) => ({
    ...it,
    qty: Number(it.qty),
    alternates: Array.isArray(it.alternates) ? it.alternates : String(it.alternates ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    stock: it.stock === undefined || it.stock === '' ? undefined : Number(it.stock),
  }));
}

const ACTIVE_REF = /^(U|IC|Q|D|LED|Y|X|K|J|SW|M|MOD|L)\d/i; // parts where a second source matters most

export function analyseBom(rawItems, builds = [1, 100, 1000]) {
  const items = normalise(rawItems);
  const lines = items.filter((i) => !i.dnp);
  const issues = [];
  const add = (level, ref, msg) => issues.push({ level, ref, msg });
  const refs = new Set();
  for (const it of items) {
    for (const r of String(it.ref ?? '').split(/[,\s]+/).filter(Boolean)) {
      if (refs.has(r)) add('error', r, 'reference designator used twice');
      refs.add(r);
    }
    if (it.dnp) continue;
    if (!it.mpn && !it.lcsc) add('error', it.ref, 'missing manufacturer part number (MPN) or LCSC id — generic descriptions are not orderable');
    else if (!it.mpn) add('warn', it.ref, `${it.lcsc}: LCSC id only — add the MPN so the part can be second-sourced`);
    if (!(it.qty > 0)) add('error', it.ref, 'quantity missing or zero');
    if (unitPrice(it.price, 1) === null) add('warn', it.ref, 'no price — look up current distributor pricing');
    const lc = String(it.lifecycle ?? 'unknown').toLowerCase();
    if (['eol', 'obsolete'].includes(lc)) add('error', it.ref, `${it.mpn}: lifecycle ${lc.toUpperCase()} — replace before design freeze`);
    else if (lc === 'nrnd') add('warn', it.ref, `${it.mpn}: NRND (not recommended for new designs)`);
    else if (lc === 'unknown') add('info', it.ref, `${it.mpn ?? '?'}: lifecycle unknown — check the manufacturer page`);
    if (ACTIVE_REF.test(String(it.ref)) && !(it.alternates?.length)) add('warn', it.ref, `${it.mpn ?? it.value ?? it.description ?? 'part'}: no alternate/second source for an active or critical part`);
    if (typeof it.stock === 'number' && builds.some((b) => it.stock < b * it.qty)) add('warn', it.ref, `${it.mpn}: stock ${it.stock} is below the need for a ${Math.max(...builds.filter((b) => it.stock < b * it.qty))}-unit build`);
  }
  const costs = builds.map((b) => {
    let total = 0, priced = 0;
    for (const it of lines) {
      const p = unitPrice(it.price, b * (it.qty || 0));
      if (p !== null) { total += p * (it.qty || 0); priced++; }
    }
    return { build: b, perUnit: Math.round(total * 100) / 100, pricedLines: priced, totalLines: lines.length };
  });
  const byCategory = {};
  for (const it of lines) {
    const p = unitPrice(it.price, builds.at(-1) * (it.qty || 0));
    if (p !== null) byCategory[it.category ?? 'uncategorised'] = Math.round(((byCategory[it.category ?? 'uncategorised'] ?? 0) + p * it.qty) * 100) / 100;
  }
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { lines: items.length, fitted: lines.length, uniqueParts: new Set(lines.map((l) => l.mpn ?? l.lcsc ?? `${l.value}|${l.footprint}`)).size, costs, byCategory, issues, ok: !issues.some((i) => i.level === 'error') };
}

export function toMarkdown(rawItems, a) {
  const items = normalise(rawItems);
  const icon = { error: '❌', warn: '⚠️', info: 'ℹ️' };
  return `# Bill of materials

| Ref | Qty | MPN | Manufacturer | Description | Unit price (1 / 100 / 1000) | Supplier | Alternates | Lifecycle |
|---|---|---|---|---|---|---|---|---|
${items.map((i) => `| ${i.ref}${i.dnp ? ' (DNP)' : ''} | ${i.qty} | ${i.mpn ?? '—'} | ${i.manufacturer ?? '—'} | ${i.description ?? ''} | ${[1, 100, 1000].map((q) => { const p = unitPrice(i.price, q * (i.qty || 1)); return p === null ? '—' : `$${p}`; }).join(' / ')} | ${i.supplier ?? '—'} | ${(i.alternates ?? []).join(', ') || '—'} | ${i.lifecycle ?? 'unknown'} |`).join('\n')}

**Per-unit BOM cost** (components only; excludes PCB, assembly, enclosure, test, shipping, duties):
${a.costs.map((c) => `- ${c.build} unit build: **$${c.perUnit}** (${c.pricedLines}/${c.totalLines} lines priced)`).join('\n')}

Cost by category (at ${a.costs.at(-1).build} units): ${Object.entries(a.byCategory).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} $${v}`).join(' · ') || '—'}

## Supply & data checks ${a.ok ? '✅' : '❌'}
${a.issues.map((i) => `- ${icon[i.level]} **${i.ref}**: ${i.msg}`).join('\n') || '- none'}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? '.hw/bom.json';
  let items;
  try { const text = fs.readFileSync(file, 'utf8'); items = file.endsWith('.csv') ? parseCSV(text) : JSON.parse(text); } catch (e) { console.error(`Cannot read ${file}: ${e.message}`); process.exit(2); }
  const builds = String(opt('--builds', '1,100,1000')).split(',').map(Number).filter((n) => n > 0);
  const a = analyseBom(items, builds);
  if (args.includes('--json')) { console.log(JSON.stringify(a, null, 2)); process.exit(a.ok ? 0 : 1); }
  const out = path.resolve(opt('--out', '.hw'));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'BOM.md'), toMarkdown(items, a));
  const csv = ['ref,qty,mpn,manufacturer,description,unit_price_1,supplier,alternates,lifecycle', ...items.map((i) => [i.ref, i.qty, i.mpn, i.manufacturer, i.description, unitPrice(i.price, 1) ?? '', i.supplier, (i.alternates ?? []).join(';'), i.lifecycle ?? ''].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  fs.writeFileSync(path.join(out, 'bom.csv'), csv);
  for (const c of a.costs) console.log(`${String(c.build).padStart(6)} units → $${c.perUnit}/unit (${c.pricedLines}/${c.totalLines} priced)`);
  for (const i of a.issues.filter((x) => x.level !== 'info')) console.log(`${i.level.toUpperCase().padEnd(5)} ${i.ref}: ${i.msg}`);
  console.log(`→ ${path.relative(process.cwd(), path.join(out, 'BOM.md'))}, bom.csv`);
  process.exit(a.ok ? 0 : 1);
}
