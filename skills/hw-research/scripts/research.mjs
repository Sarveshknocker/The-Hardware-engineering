#!/usr/bin/env node
// Hardware Engineering — design research collector (zero dependencies, Node >= 18).
// Finds open hardware designs, reference firmware, EE Q&A, research and background for a hardware project.
//
// Usage:
//   node research.mjs "<query>" [--sources github,electronics,hn,arxiv,openalex,wikipedia,stackoverflow,reddit,huggingface,news]
//                     [--limit 8] [--out .hw] [--tag <label>]
//   node research.mjs --queries-file queries.txt ...   (one query per line)
//
// Optional env: GITHUB_TOKEN (higher GitHub rate limit), OPENALEX_MAILTO (polite pool).
// Datasheets, application notes, reference designs, errata, distributor stock/prices (DigiKey, Mouser, LCSC, Octopart),
// standards and forums without free APIs are covered by the AI tool's own web search — see skills/hw-research/SKILL.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'hardware-engineering-kit/0.1 (+https://github.com/Sarveshknocker/The-Hardware-engineering)';
const TIMEOUT_MS = 15000;

const strip = (s = '') => String(s).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const clip = (s, n = 280) => { const t = strip(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const iso = (d) => { const t = d ? new Date(d) : null; return t && !isNaN(t) ? t.toISOString().slice(0, 10) : null; };
const enc = encodeURIComponent;

async function getJSON(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function getText(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Each source: (query, limit, fetchImpl) => Promise<Item[]>
// Item: { source, kind, title, url, summary, date, metrics: {...} }
export const SOURCES = {
  github: {
    label: 'GitHub repositories', kind: 'code',
    async run(q, limit, f) {
      const h = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
      const j = await getJSON(f, `https://api.github.com/search/repositories?q=${enc(q)}&sort=stars&order=desc&per_page=${limit}`, h);
      return (j.items ?? []).map((r) => ({
        title: r.full_name, url: r.html_url, summary: clip(r.description ?? ''), date: iso(r.pushed_at),
        metrics: { stars: r.stargazers_count, forks: r.forks_count, openIssues: r.open_issues_count },
        extra: { language: r.language, topics: (r.topics ?? []).slice(0, 8), license: r.license?.spdx_id ?? null, archived: !!r.archived },
      }));
    },
  },
  hn: {
    label: 'Hacker News', kind: 'discussion',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://hn.algolia.com/api/v1/search?query=${enc(q)}&tags=story&hitsPerPage=${limit}`);
      return (j.hits ?? []).map((h) => ({
        title: strip(h.title ?? h.story_title ?? ''), url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        summary: h.url ? `Link: ${h.url}` : clip(h.story_text ?? ''), date: iso(h.created_at),
        metrics: { points: h.points ?? 0, comments: h.num_comments ?? 0 }, extra: { externalUrl: h.url ?? null },
      }));
    },
  },
  reddit: {
    label: 'Reddit', kind: 'discussion',
    // Anonymous API access is blocked by Reddit. Create a free "script" app at https://www.reddit.com/prefs/apps
    // and set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET; otherwise the AI covers Reddit with web search (site:reddit.com).
    async run(q, limit, f) {
      const path_ = `/search.json?q=${enc(q)}&sort=relevance&t=all&limit=${limit}&raw_json=1`;
      let j;
      if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
        const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
        const tr = await f('https://www.reddit.com/api/v1/access_token', {
          method: 'POST', headers: { Authorization: `Basic ${basic}`, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials', signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!tr.ok) throw new Error(`Reddit auth HTTP ${tr.status}`);
        const { access_token } = await tr.json();
        j = await getJSON(f, `https://oauth.reddit.com${path_}`, { Authorization: `Bearer ${access_token}` });
      } else {
        try { j = await getJSON(f, `https://www.reddit.com${path_}`); }
        catch (e) { throw new Error(`${e.message} — Reddit blocks anonymous API access; set REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET or use web search site:reddit.com`); }
      }
      return (j.data?.children ?? []).map(({ data: d }) => ({
        title: strip(d.title), url: `https://www.reddit.com${d.permalink}`, summary: clip(d.selftext ?? ''), date: iso(d.created_utc * 1000),
        metrics: { score: d.score ?? 0, comments: d.num_comments ?? 0 }, extra: { subreddit: d.subreddit_name_prefixed ?? `r/${d.subreddit}` },
      }));
    },
  },
  arxiv: {
    label: 'arXiv papers', kind: 'research',
    async run(q, limit, f) {
      const terms = q.trim().split(/\s+/).map((w) => `all:${w}`).join('+AND+');
      const xml = await getText(f, `https://export.arxiv.org/api/query?search_query=${terms}&start=0&max_results=${limit}&sortBy=relevance`);
      return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
        const tag = (t) => (new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(e)?.[1] ?? '');
        return { title: clip(tag('title'), 200), url: strip(tag('id')), summary: clip(tag('summary')), date: iso(tag('published')), metrics: {}, extra: { category: /<category term="([^"]+)"/.exec(e)?.[1] ?? null } };
      });
    },
  },
  openalex: {
    label: 'OpenAlex (peer-reviewed & preprints)', kind: 'research',
    async run(q, limit, f) {
      const mail = process.env.OPENALEX_MAILTO ? `&mailto=${enc(process.env.OPENALEX_MAILTO)}` : '';
      const j = await getJSON(f, `https://api.openalex.org/works?search=${enc(q)}&per-page=${limit}&sort=relevance_score:desc${mail}`);
      return (j.results ?? []).map((w) => ({
        title: clip(w.display_name ?? w.title ?? '', 200), url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
        summary: w.primary_location?.source?.display_name ? `Published in ${w.primary_location.source.display_name}` : '', date: w.publication_date ?? (w.publication_year ? `${w.publication_year}` : null),
        metrics: { citations: w.cited_by_count ?? 0 }, extra: { openAccess: !!w.open_access?.is_oa, type: w.type ?? null },
      }));
    },
  },
  stackoverflow: {
    label: 'Stack Overflow', kind: 'discussion',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&q=${enc(q)}&site=stackoverflow&pagesize=${limit}`);
      return (j.items ?? []).map((i) => ({
        title: strip(i.title), url: i.link, summary: (i.tags ?? []).join(', '), date: iso(i.creation_date * 1000),
        metrics: { score: i.score ?? 0, answers: i.answer_count ?? 0, views: i.view_count ?? 0 }, extra: { answered: !!i.is_answered },
      }));
    },
  },
  electronics: {
    label: 'Electrical Engineering Stack Exchange', kind: 'discussion',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&q=${enc(q)}&site=electronics&pagesize=${limit}`);
      return (j.items ?? []).map((i) => ({
        title: strip(i.title), url: i.link, summary: (i.tags ?? []).join(', '), date: iso(i.creation_date * 1000),
        metrics: { score: i.score ?? 0, answers: i.answer_count ?? 0, views: i.view_count ?? 0 }, extra: { answered: !!i.is_answered, topics: i.tags ?? [] },
      }));
    },
  },
  huggingface: {
    label: 'Hugging Face models', kind: 'code',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://huggingface.co/api/models?search=${enc(q)}&sort=downloads&direction=-1&limit=${limit}`);
      return (Array.isArray(j) ? j : []).map((m) => ({
        title: m.id ?? m.modelId, url: `https://huggingface.co/${m.id ?? m.modelId}`, summary: m.pipeline_tag ? `Task: ${m.pipeline_tag}` : '', date: iso(m.lastModified ?? m.createdAt),
        metrics: { downloads: m.downloads ?? 0, likes: m.likes ?? 0 }, extra: { task: m.pipeline_tag ?? null },
      }));
    },
  },
  'hf-datasets': {
    label: 'Hugging Face datasets', kind: 'data',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://huggingface.co/api/datasets?search=${enc(q)}&sort=downloads&direction=-1&limit=${limit}`);
      return (Array.isArray(j) ? j : []).map((d) => ({
        title: d.id, url: `https://huggingface.co/datasets/${d.id}`, summary: clip(d.description ?? ''), date: iso(d.lastModified ?? d.createdAt),
        metrics: { downloads: d.downloads ?? 0, likes: d.likes ?? 0 }, extra: {},
      }));
    },
  },
  npm: {
    label: 'npm packages', kind: 'code',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://registry.npmjs.org/-/v1/search?text=${enc(q)}&size=${limit}`);
      return (j.objects ?? []).map(({ package: p, score }) => ({
        title: p.name, url: p.links?.npm ?? `https://www.npmjs.com/package/${p.name}`, summary: clip(p.description ?? ''), date: iso(p.date),
        metrics: { quality: Math.round((score?.final ?? 0) * 100) }, extra: { version: p.version, repo: p.links?.repository ?? null },
      }));
    },
  },
  wikipedia: {
    label: 'Wikipedia', kind: 'reference',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&format=json&srlimit=${limit}&origin=*`);
      return (j.query?.search ?? []).map((s) => ({
        title: s.title, url: `https://en.wikipedia.org/wiki/${enc(s.title.replace(/ /g, '_'))}`, summary: clip(s.snippet), date: iso(s.timestamp), metrics: { words: s.wordcount ?? 0 }, extra: {},
      }));
    },
  },
  news: {
    label: 'Global news (GDELT)', kind: 'news',
    async run(q, limit, f) {
      const j = await getJSON(f, `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc(q)}&mode=artlist&format=json&maxrecords=${limit}&sort=hybridrel`);
      return (j.articles ?? []).map((a) => ({
        title: strip(a.title), url: a.url, summary: a.domain ? `Source: ${a.domain}` : '', date: iso(a.seendate?.replace(/^(\d{4})(\d{2})(\d{2})T.*/, '$1-$2-$3')), metrics: {}, extra: { domain: a.domain ?? null, language: a.language ?? null },
      }));
    },
  },
};

// Defaults: open designs & firmware (GitHub), EE Q&A, maker/engineer discussion (HN), research (arXiv, OpenAlex), background (Wikipedia).
// Opt-in: stackoverflow (firmware/software), reddit (needs REDDIT_CLIENT_ID/SECRET), huggingface (edge-AI models), news, npm.
export const DEFAULT_SOURCES = ['github', 'electronics', 'hn', 'arxiv', 'openalex', 'wikipedia'];

const STOP = new Set('a an the and or but for nor of to in on at by with from into onto over under about as is are was were be been being this that these those it its i we you they my our your their me us them how what why when where which who whom can could should would will shall may might must do does did done have has had not no yes very more most less least just also than then so such any some each every all both either neither own same other another using use used via per vs versus without within between among across after before during new best better good way ways help helps make makes build building create app platform system solution solutions tool tools idea problem problems want need needs small large big simple'.split(' '));

/** Content keywords in original order (deduplicated). */
export function keywords(q) {
  const seen = new Set();
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ').split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w) && !seen.has(w) && seen.add(w));
}

/** Query ladder: full query → all keywords → first 3 → first 2. Many APIs need every term to match, so shorter is broader. */
export function queryLadder(q) {
  const k = keywords(q);
  return [...new Set([q.trim(), k.join(' '), k.slice(0, 3).join(' '), k.slice(0, 2).join(' ')].filter((x) => x && x.split(' ').length >= 1))];
}

/** Share of query keywords present in the item's text (stems: first 5 chars for words ≥ 6 chars). */
export function relevance(item, q) {
  const k = keywords(q);
  if (!k.length) return 1;
  const hay = [item.title, item.summary, ...(item.extra?.topics ?? []), item.extra?.task, item.extra?.subreddit].filter(Boolean).join(' ').toLowerCase();
  const hit = k.filter((w) => hay.includes(w.length >= 6 ? w.slice(0, 5) : w)).length;
  return Math.round((hit / k.length) * 100) / 100;
}

// Signal score 0–100: popularity on a log scale per source + freshness bonus. Comparable within a source, rough across sources.
export function signal(item, now = Date.now()) {
  const m = item.metrics ?? {};
  const raw = (m.stars ?? 0) + (m.points ?? 0) * 3 + (m.score ?? 0) * 2 + (m.comments ?? 0) + (m.citations ?? 0) * 5 + (m.downloads ?? 0) / 100 + (m.likes ?? 0) * 5 + (m.quality ?? 0);
  const pop = Math.min(70, Math.round(Math.log10(1 + raw) * 14));
  let fresh = 0;
  if (item.date) {
    const ageYears = (now - new Date(item.date).getTime()) / (365.25 * 864e5);
    fresh = ageYears < 1 ? 30 : ageYears < 2 ? 22 : ageYears < 4 ? 12 : 4;
  }
  return Math.max(0, Math.min(100, pop + fresh));
}

async function runSource(s, q, limit, fetchImpl) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await SOURCES[s].run(q, limit, fetchImpl); }
    catch (e) { lastErr = e; if (/HTTP 4\d\d|auth/.test(e.message)) break; } // don't retry client errors / rate limits
  }
  throw lastErr;
}

export async function research(query, { sources = DEFAULT_SOURCES, limit = 8, fetchImpl = globalThis.fetch, minRelevance = 0.34 } = {}) {
  const unknown = sources.filter((s) => !SOURCES[s]);
  if (unknown.length) throw new Error(`Unknown source(s): ${unknown.join(', ')}. Valid: ${Object.keys(SOURCES).join(', ')}`);
  const ladder = queryLadder(query);
  const results = await Promise.allSettled(sources.map(async (s) => {
    // Walk the ladder until a variant returns relevant results.
    for (const variant of ladder) {
      const raw = await runSource(s, variant, limit, fetchImpl);
      const relevant = raw.map((it) => ({ source: s, kind: SOURCES[s].kind, ...it, relevance: relevance(it, query), matchedQuery: variant }))
        .filter((it) => it.relevance >= minRelevance);
      if (relevant.length) return relevant;
    }
    return [];
  }));
  const items = [], errors = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? items.push(...r.value) : errors.push({ source: sources[i], error: String(r.reason?.message ?? r.reason) })));
  const seen = new Set();
  const deduped = items.filter((it) => it.url && !seen.has(it.url) && seen.add(it.url))
    .map((it) => ({ ...it, signal: Math.round(signal(it) * (0.5 + it.relevance / 2)) }));
  const empty = sources.filter((s) => !errors.some((e) => e.source === s) && !deduped.some((it) => it.source === s));
  return { query, ladder, generatedAt: new Date().toISOString(), sources, items: deduped, empty, errors };
}

export function toMarkdown(runs) {
  const out = [`# Hardware research log\n\n_Collected ${new Date().toISOString()} by the Hardware Engineering kit. Leads, not specifications: always confirm values in the manufacturer's current datasheet and errata._\n`];
  for (const run of runs) {
    out.push(`## Query: "${run.query}"\n`);
    if (run.errors.length) out.push(`> Unavailable sources: ${run.errors.map((e) => `${e.source} (${e.error})`).join('; ')} — cover them with web search.\n`);
    if (run.empty?.length) out.push(`> No relevant results: ${run.empty.join(', ')} (tried: ${run.ladder.map((v) => `"${v}"`).join(' → ')}). Try synonyms or domain terms.\n`);
    const bySource = {};
    for (const it of run.items) (bySource[it.source] ??= []).push(it);
    for (const [s, list] of Object.entries(bySource)) {
      out.push(`### ${SOURCES[s].label}\n| Signal | Item | Metrics | Date | Notes |\n|---|---|---|---|---|`);
      for (const it of list.sort((a, b) => b.signal - a.signal)) {
        const metrics = Object.entries(it.metrics ?? {}).filter(([, v]) => v).map(([k, v]) => `${k} ${Number(v).toLocaleString('en-US')}`).join(' · ');
        const notes = [it.extra?.language, it.extra?.license, it.extra?.subreddit, it.extra?.task, it.extra?.archived && '⚠️ archived', it.summary].filter(Boolean).join(' — ').replace(/\|/g, '/');
        out.push(`| ${it.signal} | [${it.title.replace(/[|[\]]/g, ' ')}](${it.url}) | ${metrics || '—'} | ${it.date ?? '—'} | ${clip(notes, 160)} |`);
      }
      out.push('');
    }
  }
  return out.join('\n');
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'query';

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const flagVals = new Set(['--sources', '--limit', '--out', '--tag', '--queries-file'].flatMap((f) => { const i = args.indexOf(f); return i >= 0 ? [i, i + 1] : []; }));
  const positional = args.filter((a, i) => !flagVals.has(i) && !a.startsWith('--'));
  const qfile = opt('--queries-file');
  const queries = qfile ? fs.readFileSync(qfile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : positional.length ? [positional.join(' ')] : [];
  if (!queries.length) {
    console.error(`Usage: node research.mjs "<query>" [--sources ${Object.keys(SOURCES).join(',')}] [--limit 8] [--out .hw] [--tag label]`);
    process.exit(2);
  }
  const sources = (opt('--sources') ?? DEFAULT_SOURCES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.max(1, Math.min(30, Number(opt('--limit', 8))));
  const outDir = path.resolve(opt('--out', '.hw'), 'research');
  const runs = [];
  for (const q of queries) {
    const run = await research(q, { sources, limit });
    runs.push(run);
    console.log(`✔ "${q}": ${run.items.length} items from ${sources.length - run.errors.length}/${sources.length} sources${run.errors.length ? ` (unavailable: ${run.errors.map((e) => e.source).join(', ')})` : ''}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const name = opt('--tag') ? slug(opt('--tag')) : slug(queries[0]);
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(runs, null, 2));
  fs.writeFileSync(path.join(outDir, `${name}.md`), toMarkdown(runs));
  console.log(`→ ${path.relative(process.cwd(), path.join(outDir, name))}.{md,json}`);
}
