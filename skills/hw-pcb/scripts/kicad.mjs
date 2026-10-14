#!/usr/bin/env node
// Hardware Engineering — KiCad integration (KiCad 6–9 files; zero dependencies).
//
//   node kicad.mjs bom   <top.kicad_sch> [--out .hw]          schematic → .hw/bom.json (for bom.mjs / parts.mjs enrich)
//   node kicad.mjs check <project dir | .kicad_sch | .kicad_pcb> [--out .hw]   ERC + DRC (+ schematic parity) via kicad-cli
//   node kicad.mjs fab   <board.kicad_pcb> [--out .hw/fab]   Gerbers, drill, pick-and-place via kicad-cli
//
// `bom` parses the schematic files directly (no KiCad install needed). `check` and `fab` need kicad-cli (KiCad ≥ 7);
// set KICAD_CLI if it is not on PATH. Exit 1 when ERC/DRC report errors.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// ---------- S-expression parser ----------
export function parseSexpr(text) {
  let i = 0;
  const n = text.length;
  const skip = () => { while (i < n && /\s/.test(text[i])) i++; };
  function value() {
    skip();
    if (text[i] === '(') {
      i++; const list = [];
      for (;;) { skip(); if (i >= n) throw new Error('unbalanced parentheses'); if (text[i] === ')') { i++; return list; } list.push(value()); }
    }
    if (text[i] === '"') {
      i++; let s = '';
      while (i < n && text[i] !== '"') { if (text[i] === '\\') { i++; s += text[i] === 'n' ? '\n' : text[i]; } else s += text[i]; i++; }
      i++; return { str: s };
    }
    const start = i;
    while (i < n && !/[\s()]/.test(text[i])) i++;
    return text.slice(start, i);
  }
  return value();
}
const atom = (x) => (typeof x === 'string' ? x : x?.str);
const head = (l) => (Array.isArray(l) ? atom(l[0]) : null);
const kids = (l, name) => (Array.isArray(l) ? l.filter((c) => head(c) === name) : []);
const prop = (l, name) => { const p = kids(l, 'property').find((c) => atom(c[1]) === name); return p ? atom(p[2]) : undefined; };
const flag = (l, name) => { const c = kids(l, name)[0]; return c ? atom(c[1]) : undefined; };

const FIELD = {
  mpn: ['MPN', 'Manufacturer Part Number', 'Mfr. Part #', 'MFR_PN', 'Part Number', 'PN'],
  manufacturer: ['Manufacturer', 'MFR', 'Mfr'],
  lcsc: ['LCSC', 'LCSC Part', 'LCSC Part #', 'JLCPCB Part #', 'JLC'],
};
const pick = (sym, names) => names.map((nm) => prop(sym, nm)).find((v) => v && v !== '~');

/** Reads a schematic and all its sub-sheets; returns placed component instances. */
export function readSchematic(topFile) {
  const instances = []; const warnings = []; const seen = new Set();
  const visit = (file) => {
    const abs = path.resolve(file);
    if (seen.has(abs)) return; seen.add(abs);
    if (!fs.existsSync(abs)) { warnings.push(`missing sheet file ${path.basename(abs)}`); return; }
    const root = parseSexpr(fs.readFileSync(abs, 'utf8'));
    if (head(root) !== 'kicad_sch') throw new Error(`${abs} is not a KiCad 6+ schematic (.kicad_sch)`);
    for (const sym of kids(root, 'symbol')) {
      const libId = flag(sym, 'lib_id') ?? '';
      const fields = { value: prop(sym, 'Value') ?? '', footprint: prop(sym, 'Footprint') ?? '', description: prop(sym, 'Description') ?? prop(sym, 'Datasheet') ?? '',
        mpn: pick(sym, FIELD.mpn), manufacturer: pick(sym, FIELD.manufacturer), lcsc: pick(sym, FIELD.lcsc) };
      const inBom = flag(sym, 'in_bom') !== 'no'; const dnp = flag(sym, 'dnp') === 'yes';
      // KiCad 7+ keeps one reference per sheet instance; older files only have the Reference property.
      const refs = [];
      for (const inst of kids(sym, 'instances')) for (const proj of kids(inst, 'project')) for (const p of kids(proj, 'path')) refs.push({ ref: flag(p, 'reference'), unit: flag(p, 'unit') });
      if (!refs.length) refs.push({ ref: prop(sym, 'Reference'), unit: flag(sym, 'unit') });
      for (const r of refs) {
        if (!r.ref || libId.startsWith('power:') || r.ref.startsWith('#')) continue;
        instances.push({ ref: r.ref, libId, inBom, dnp, sheet: path.basename(abs), ...fields });
      }
    }
    for (const sh of kids(root, 'sheet')) {
      const sub = prop(sh, 'Sheetfile') ?? prop(sh, 'Sheet file');
      if (sub) visit(path.join(path.dirname(abs), sub));
    }
  };
  visit(topFile);
  // Multi-unit parts (e.g. a quad op-amp) appear once per unit: keep one entry per reference.
  const byRef = new Map(); for (const c of instances) if (!byRef.has(c.ref)) byRef.set(c.ref, c);
  const parts = [...byRef.values()];
  const unannotated = parts.filter((c) => /\?$/.test(c.ref)).map((c) => c.ref);
  if (unannotated.length) warnings.push(`${unannotated.length} unannotated reference(s) (${unannotated.slice(0, 5).join(', ')}): annotate the schematic first`);
  return { parts, warnings };
}

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** Groups identical parts into BOM lines compatible with bom.mjs. */
export function toBom(parts) {
  const groups = new Map();
  for (const c of parts.filter((p) => p.inBom)) {
    const key = [c.value, c.footprint, c.mpn ?? '', c.lcsc ?? '', c.dnp].join('|');
    const g = groups.get(key) ?? { refs: [], c }; g.refs.push(c.ref); groups.set(key, g);
  }
  return [...groups.values()].map(({ refs, c }) => ({
    ref: refs.sort(natural).join(','), qty: refs.length, value: c.value, footprint: c.footprint,
    ...(c.mpn ? { mpn: c.mpn } : {}), ...(c.manufacturer ? { manufacturer: c.manufacturer } : {}), ...(c.lcsc ? { lcsc: c.lcsc } : {}),
    description: [c.value, c.footprint.split(':').pop(), c.description].filter(Boolean).join(' · '), dnp: c.dnp, category: c.libId.split(':')[0] || undefined,
  })).sort((a, b) => natural(a.ref, b.ref));
}

// ---------- kicad-cli ----------
export function findKicadCli() {
  const env = process.env.KICAD_CLI;
  if (env) return fs.existsSync(env) ? env : null;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['kicad-cli'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  const candidates = process.platform === 'win32'
    ? ['9.0', '8.0', '7.0'].map((v) => `C:\\Program Files\\KiCad\\${v}\\bin\\kicad-cli.exe`)
    : process.platform === 'darwin' ? ['/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'] : ['/usr/bin/kicad-cli', '/usr/local/bin/kicad-cli'];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/** Summarises kicad-cli ERC/DRC JSON reports into counts and the first violations. */
export function summariseReport(report, kind) {
  const all = [
    ...(report.sheets ?? []).flatMap((s) => (s.violations ?? []).map((v) => ({ ...v, sheet: s.path }))),
    ...(report.violations ?? []), ...(report.unconnected_items ?? []).map((v) => ({ ...v, type: v.type ?? 'unconnected_items' })),
    ...(report.schematic_parity ?? []).map((v) => ({ ...v, type: `parity: ${v.type ?? 'mismatch'}` })),
  ];
  const count = (sev) => all.filter((v) => (v.severity ?? 'error') === sev).length;
  const byType = {}; for (const v of all) byType[v.type ?? 'unknown'] = (byType[v.type ?? 'unknown'] ?? 0) + 1;
  return { kind, errors: count('error'), warnings: count('warning'), byType, examples: all.slice(0, 10).map((v) => `${v.severity ?? 'error'} ${v.type}: ${v.description ?? ''}${v.items?.[0]?.description ? ` (${v.items[0].description})` : ''}`) };
}

function runCli(cli, args) {
  const r = spawnSync(cli, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

export function check(target, { out = '.hw' } = {}) {
  const cli = findKicadCli();
  if (!cli) throw Object.assign(new Error('kicad-cli not found (install KiCad ≥ 7 or set KICAD_CLI). `bom` works without it.'), { code: 3 });
  const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).map((f) => path.join(target, f)) : [target];
  const sch = files.find((f) => f.endsWith('.kicad_sch') && fs.existsSync(f.replace(/\.kicad_sch$/, '.kicad_pro'))) ?? files.find((f) => f.endsWith('.kicad_sch'));
  const pcb = files.find((f) => f.endsWith('.kicad_pcb'));
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  if (sch) { const o = path.join(out, 'erc.json'); runCli(cli, ['sch', 'erc', '--format', 'json', '--severity-all', '--output', o, sch]); results.push(summariseReport(JSON.parse(fs.readFileSync(o, 'utf8')), 'ERC')); }
  if (pcb) { const o = path.join(out, 'drc.json'); runCli(cli, ['pcb', 'drc', '--format', 'json', '--severity-all', '--schematic-parity', '--output', o, pcb]); results.push(summariseReport(JSON.parse(fs.readFileSync(o, 'utf8')), 'DRC')); }
  if (!results.length) throw new Error('no .kicad_sch or .kicad_pcb found');
  fs.writeFileSync(path.join(out, 'KICAD_CHECKS.md'), checksMarkdown(results));
  return results;
}

export function checksMarkdown(results) {
  return `# KiCad checks\n\n${results.map((r) => `## ${r.kind}: ${r.errors} error(s), ${r.warnings} warning(s)\n${Object.entries(r.byType).map(([t, c]) => `- ${t}: ${c}`).join('\n') || '- clean'}\n${r.examples.length ? `\nFirst items:\n${r.examples.map((e) => `- ${e}`).join('\n')}\n` : ''}`).join('\n')}\nFix every error. Justify each remaining warning in PCB.md (for example, intentional no-connects marked with a no-connect flag).\n`;
}

export function fab(board, { out = '.hw/fab' } = {}) {
  const cli = findKicadCli();
  if (!cli) throw Object.assign(new Error('kicad-cli not found (install KiCad ≥ 7 or set KICAD_CLI).'), { code: 3 });
  const gerbers = path.join(out, 'gerbers');
  fs.mkdirSync(gerbers, { recursive: true });
  const steps = [
    ['gerbers', ['pcb', 'export', 'gerbers', '--output', gerbers + path.sep, board]],
    ['drill', ['pcb', 'export', 'drill', '--output', gerbers + path.sep, board]],
    ['pick-and-place', ['pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--side', 'both', '--output', path.join(out, 'positions.csv'), board]],
  ];
  return steps.map(([name, args]) => { const r = runCli(cli, args); return { step: name, ok: r.status === 0, message: (r.stderr || r.stdout || '').trim().split('\n').slice(-1)[0] }; });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flagArg = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const json = args.includes('--json'); if (json) args.splice(args.indexOf('--json'), 1);
  const [cmd, target] = args;
  try {
    if (cmd === 'bom' && target) {
      const out = flagArg('out', '.hw');
      const { parts, warnings } = readSchematic(target);
      const bom = toBom(parts);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'bom.json'), JSON.stringify(bom, null, 2));
      if (json) console.log(JSON.stringify({ bom, warnings }, null, 2));
      else {
        console.log(`${parts.length} placed parts → ${bom.length} BOM lines → ${path.join(out, 'bom.json')}`);
        const noMpn = bom.filter((l) => !l.mpn && !l.lcsc && !l.dnp).length;
        if (noMpn) console.log(`${noMpn} line(s) have no MPN/LCSC field: add one in the symbol properties so stock and price can be checked.`);
        for (const w of warnings) console.log(`warn: ${w}`);
        console.log('Next: parts.mjs enrich, then bom.mjs for cost and supply risk.');
      }
    } else if (cmd === 'check' && target) {
      const r = check(target, { out: flagArg('out', '.hw') });
      if (json) console.log(JSON.stringify(r, null, 2)); else for (const x of r) console.log(`${x.kind}: ${x.errors} error(s), ${x.warnings} warning(s)${x.examples[0] ? ` — e.g. ${x.examples[0]}` : ''}`);
      process.exit(r.some((x) => x.errors) ? 1 : 0);
    } else if (cmd === 'fab' && target) {
      const r = fab(target, { out: flagArg('out', '.hw/fab') });
      for (const s of r) console.log(`${s.ok ? '✔' : '✖'} ${s.step}${s.ok ? '' : `: ${s.message}`}`);
      process.exit(r.every((s) => s.ok) ? 0 : 1);
    } else { console.error('usage: kicad.mjs bom <top.kicad_sch> | check <dir|file> | fab <board.kicad_pcb> [--out dir]'); process.exit(2); }
  } catch (e) { console.error(`✖ ${e.message}`); process.exit(e.code === 3 ? 3 : 1); }
}
