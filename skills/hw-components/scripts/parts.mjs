#!/usr/bin/env node
// Hardware Engineering — live part search and stock/price/lifecycle lookup.
//
//   node parts.mjs search "<words>" [--limit 15] [--min-stock 100] [--basic] [--json]
//   node parts.mjs lookup <MPN | LCSC id> [--json]
//   node parts.mjs enrich [.hw/bom.json] [--out .hw]          fills stock, price breaks, LCSC id, datasheet, lifecycle
//
// Sources:
//  - JLCPCB/LCSC parts in stock (no key): the jlcparts database (https://github.com/yaqwsx/jlcparts, MIT), rebuilt daily.
//    Gives stock, price breaks, datasheet and the JLCPCB "Basic/Extended/Preferred" assembly class.
//  - Mouser (optional, MOUSER_API_KEY from a free Mouser API account): lifecycle (Active/NRND/Obsolete), stock, prices.
// Data is cached for 24 h in .hw/cache/. Every value is dated in the output; confirm before ordering.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const JLC = () => process.env.HW_JLCPARTS_URL ?? 'https://yaqwsx.github.io/jlcparts/data';
const MOUSER = () => process.env.HW_MOUSER_API ?? 'https://api.mouser.com/api/v1';
const CACHE = () => path.resolve(process.env.HW_CACHE ?? '.hw/cache');
const DAY = 86_400_000;
const UA = 'hardware-engineering-kit (+https://github.com/Sarveshknocker/The-Hardware-engineering)';

async function cached(name, url, { gz = false, json = false } = {}) {
  const file = path.join(CACHE(), name.replace(/[^\w.-]/g, '_'));
  try { if (Date.now() - fs.statSync(file).mtimeMs < DAY) { const t = fs.readFileSync(file, 'utf8'); return json ? JSON.parse(t) : t; } } catch {}
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const text = gz ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  fs.mkdirSync(CACHE(), { recursive: true });
  fs.writeFileSync(file, text);
  return json ? JSON.parse(text) : text;
}

let indexRows = null; let assemblyClass = null; let manifest = null; let minLcsc = Infinity;
/** What the free snapshot covers. A miss outside coverage means unknown, never unavailable. */
export const coverage = () => ({ parts: indexRows?.length ?? 0, minLcsc: Number.isFinite(minLcsc) ? `C${minLcsc}` : null, asOf: manifest?.created ?? null });
async function jlcIndex() {
  manifest ??= await cached('jlc-manifest.json', `${JLC()}/manifest.json`, { json: true });
  if (!indexRows) {
    const tsv = await cached('jlc-search-index.tsv', `${JLC()}/${manifest.searchIndex}`, { gz: true });
    indexRows = tsv.split('\n').filter(Boolean).map((l) => { const [lcsc, shard, text] = l.split('\t'); return { lcsc, shard, text: text ?? '' }; });
    for (const r of indexRows) { const n = Number(r.lcsc.slice(1)); if (n < minLcsc) minLcsc = n; }
  }
  return indexRows;
}
async function jlcClasses() {
  if (assemblyClass) return assemblyClass;
  const lut = await cached('jlc-attributes-lut.json', `${JLC()}/${manifest.attributesLut}`, { gz: true, json: true });
  assemblyClass = new Map();
  lut.forEach(([name, v], i) => { if (name === 'Basic/Extended') assemblyClass.set(i, Object.values(v.values ?? {})[0]?.[0]); });
  return assemblyClass;
}
const shardCache = new Map();
async function jlcShard(name) {
  if (!shardCache.has(name)) {
    const text = await cached(`jlc-${name.replace(/\.gz$/, '')}`, `${JLC()}/${name}`, { gz: true });
    const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const schema = lines[0]; const rows = new Map();
    for (const row of lines.slice(1)) rows.set(row[schema.lcsc], Object.fromEntries(Object.entries(schema).map(([k, i]) => [k, row[i]])));
    shardCache.set(name, rows);
  }
  return shardCache.get(name);
}

async function jlcDetails(hits) {
  const classes = await jlcClasses().catch(() => new Map());
  const out = [];
  for (const h of hits) {
    const row = (await jlcShard(h.shard)).get(h.lcsc);
    if (!row) continue;
    const cls = (row.attributes ?? []).map((i) => classes.get(i)).find(Boolean) ?? null;
    out.push({
      source: 'JLCPCB/LCSC (jlcparts)', lcsc: row.lcsc, mpn: row.mfr, description: row.description, stock: row.stock ?? 0,
      priceBreaks: (row.price ?? []).map((p) => ({ qty: p.qFrom, price: p.price })), currency: 'USD', assemblyClass: cls,
      datasheet: row.datasheet ?? null, url: row.url ?? `https://lcsc.com/product-detail/${row.lcsc}.html`, lifecycle: null,
    });
  }
  return out;
}

/** Keyword search across all in-stock JLCPCB parts; every word must match. */
export async function search(words, { limit = 15, minStock = 0, basic = false } = {}) {
  const terms = String(words).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) throw new Error('search needs at least one word');
  const rows = await jlcIndex();
  // Each word must start a token ("10k" matches "10kω" but not "510kω").
  const hits = rows.filter((r) => { const toks = r.text.split(/[\s,、()[\]]+/); return terms.every((t) => toks.some((k) => k.startsWith(t) || k.startsWith(`±${t}`))); }).slice(0, 400);
  let parts = await jlcDetails(hits);
  parts = parts.filter((p) => p.stock >= minStock && (!basic || /basic|preferred/i.test(p.assemblyClass ?? '')));
  // Prefer parts JLC keeps loaded (Basic/Preferred: no feeder setup fee), then deeper stock.
  const rank = (p) => (/basic/i.test(p.assemblyClass ?? '') ? 2 : /preferred/i.test(p.assemblyClass ?? '') ? 1 : 0);
  return { asOf: manifest.created, parts: parts.sort((a, b) => rank(b) - rank(a) || b.stock - a.stock).slice(0, limit) };
}

async function mouser(mpn) {
  const key = process.env.MOUSER_API_KEY;
  if (!key) return null;
  const r = await fetch(`${MOUSER()}/search/partnumber?apiKey=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: mpn, partSearchOptions: 'Exact' } }),
  });
  if (!r.ok) throw new Error(`Mouser HTTP ${r.status}`);
  const j = await r.json();
  const p = (j.SearchResults?.Parts ?? []).find((x) => String(x.ManufacturerPartNumber).toUpperCase() === mpn.toUpperCase()) ?? j.SearchResults?.Parts?.[0];
  if (!p) return null;
  const num = (s) => Number(String(s ?? '').replace(/[^\d.]/g, '')) || 0;
  return {
    source: 'Mouser', mpn: p.ManufacturerPartNumber, manufacturer: p.Manufacturer, description: p.Description,
    stock: num(p.AvailabilityInStock ?? p.Availability), lifecycle: p.LifecycleStatus || 'Active', leadTime: p.LeadTime ?? null,
    priceBreaks: (p.PriceBreaks ?? []).map((b) => ({ qty: b.Quantity, price: num(b.Price) })), currency: p.PriceBreaks?.[0]?.Currency ?? 'USD',
    datasheet: p.DataSheetUrl || null, url: p.ProductDetailUrl || null,
  };
}

/** Exact lookup by manufacturer part number or LCSC id, across all configured sources. */
export async function lookup(id) {
  const rows = await jlcIndex();
  const q = String(id).trim().toLowerCase();
  const hits = /^c\d+$/.test(q) ? rows.filter((r) => r.lcsc.toLowerCase() === q) : rows.filter((r) => r.text.split(' ')[1] === q);
  const jlc = await jlcDetails(hits.slice(0, 5));
  let m = null; let mouserError = null;
  if (!/^c\d+$/.test(q)) try { m = await mouser(String(id)); } catch (e) { mouserError = e.message; }
  return { asOf: manifest.created, results: [...jlc, ...(m ? [m] : [])], mouserError, coverage: coverage() };
}

/** Lifecycle words mapped to bom.mjs vocabulary. */
const lifecycleOf = (s) => { const t = String(s ?? '').toLowerCase(); return !t ? null : /obsolete|discontinued/.test(t) ? 'obsolete' : /eol|end of life|last time buy/.test(t) ? 'eol' : /nrnd|not recommended/.test(t) ? 'nrnd' : /active|new product/.test(t) ? 'active' : 'unknown'; };

export async function enrich(bomFile, { out = '.hw' } = {}) {
  const bom = JSON.parse(fs.readFileSync(bomFile, 'utf8'));
  const report = [];
  for (const line of bom) {
    const id = line.lcsc ?? line.mpn;
    if (!id || line.dnp) { report.push({ ref: line.ref, status: line.dnp ? 'dnp' : 'no MPN/LCSC: add one' }); continue; }
    const { results, asOf } = await lookup(id);
    const jlc = results.find((r) => r.source.startsWith('JLC')); const mo = results.find((r) => r.source === 'Mouser');
    const best = jlc ?? mo;
    if (!best) { report.push({ ref: line.ref, id, status: `unknown: not in the free snapshot (${coverage().parts} parts, LCSC ≥ ${coverage().minLcsc})${process.env.MOUSER_API_KEY ? ' or Mouser' : '; set MOUSER_API_KEY'}; verify at a distributor` }); continue; }
    if (jlc) { line.lcsc = jlc.lcsc; line.assemblyClass = jlc.assemblyClass; line.mpn ??= jlc.mpn; }
    if (mo) line.manufacturer ??= mo.manufacturer;
    line.stock = best.stock;
    line.price = Object.fromEntries(best.priceBreaks.map((b) => [String(b.qty), b.price]));
    line.supplier = best.source;
    line.datasheet ??= best.datasheet ?? undefined;
    const lc = lifecycleOf(mo?.lifecycle);
    if (lc) line.lifecycle = lc;
    line.dataAsOf = mo ? new Date().toISOString().slice(0, 10) : String(asOf).slice(0, 10);
    report.push({ ref: line.ref, id, status: 'ok', stock: best.stock, assemblyClass: jlc?.assemblyClass ?? null, lifecycle: line.lifecycle ?? 'unknown (set MOUSER_API_KEY or check the manufacturer)' });
  }
  fs.writeFileSync(bomFile, JSON.stringify(bom, null, 2));
  const md = `# BOM enrichment\n\n_Sources: jlcparts snapshot ${String(manifest?.created ?? '').slice(0, 10)}${process.env.MOUSER_API_KEY ? ', Mouser API (today)' : ' (no MOUSER_API_KEY: lifecycle not checked)'}. Confirm stock and price before ordering._\n\n| Ref | Part | Status | Stock | JLC class | Lifecycle |\n|---|---|---|---|---|---|\n${report.map((r) => `| ${r.ref ?? ''} | ${r.id ?? ''} | ${r.status} | ${r.stock ?? ''} | ${r.assemblyClass ?? ''} | ${r.lifecycle ?? ''} |`).join('\n')}\n\nExtended JLCPCB parts add a per-part feeder setup fee to assembly; prefer Basic/Preferred where the specification allows.\n`;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'BOM_ENRICHMENT.md'), md);
  return report;
}

const fmtPrice = (b) => b.map((x) => `${x.qty}+: $${x.price}`).slice(0, 4).join(', ');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const has = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return false; args.splice(i, 1); return true; };
  const json = has('json'); const basic = has('basic');
  const limit = Number(flag('limit', 15)); const minStock = Number(flag('min-stock', 0)); const out = flag('out', '.hw');
  const [cmd, ...rest] = args;
  try {
    if (cmd === 'search' && rest.length) {
      const r = await search(rest.join(' '), { limit, minStock, basic });
      if (json) console.log(JSON.stringify(r, null, 2));
      else { const c = coverage(); console.log(`${r.parts.length} part(s) · JLCPCB/LCSC snapshot ${String(r.asOf).slice(0, 10)} · covers ${c.parts} parts with LCSC ids ≥ ${c.minLcsc} (newer parts; older classics may be missing)`); for (const p of r.parts) console.log(`${p.lcsc.padEnd(10)} ${String(p.mpn).padEnd(28)} stock ${String(p.stock).padEnd(8)} ${String(p.assemblyClass ?? '').padEnd(9)} ${fmtPrice(p.priceBreaks)}\n           ${p.description.slice(0, 110)}`); }
    } else if (cmd === 'lookup' && rest[0]) {
      const r = await lookup(rest[0]);
      if (json) console.log(JSON.stringify(r, null, 2));
      else { if (!r.results.length) console.log(`Unknown: not in the free JLCPCB snapshot (${r.coverage.parts} parts, LCSC ids ≥ ${r.coverage.minLcsc}; older parts are not included)${process.env.MOUSER_API_KEY ? ' or Mouser' : '. Set MOUSER_API_KEY (free Mouser API account) for full coverage and lifecycle'}. This does not mean the part is unavailable.`); for (const p of r.results) console.log(`${p.source}: ${p.mpn} · stock ${p.stock} · ${p.lifecycle ?? 'lifecycle n/a'}${p.assemblyClass ? ` · JLC ${p.assemblyClass}` : ''} · ${fmtPrice(p.priceBreaks)}\n  ${p.url ?? ''}`); if (r.mouserError) console.log(`note: ${r.mouserError}`); }
    } else if (cmd === 'enrich') {
      const r = await enrich(rest[0] ?? '.hw/bom.json', { out });
      if (json) console.log(JSON.stringify(r, null, 2)); else { for (const x of r) console.log(`${String(x.ref ?? '').padEnd(6)} ${x.status}${x.stock !== undefined ? ` · stock ${x.stock}` : ''}${x.assemblyClass ? ` · ${x.assemblyClass}` : ''}`); console.log(`→ ${path.join(out, 'BOM_ENRICHMENT.md')}; run bom.mjs to recost.`); }
    } else { console.error('usage: parts.mjs search "<words>" [--limit 15 --min-stock N --basic] | lookup <MPN|LCSC> | enrich [.hw/bom.json]'); process.exit(2); }
  } catch (e) { console.error(`✖ ${e.message}`); process.exit(1); }
}
