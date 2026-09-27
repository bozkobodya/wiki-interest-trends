// Resolve topics -> fetch data -> analyse -> write a run directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as A from './analysis.js';
import * as api from './api.js';
import { addDays, days, monthEnd, monthRange } from './dates.js';
import { Store } from './store.js';

const QID = /^Q\d+$/;

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------
export function lastCompleteMonthEnd() {
  const last = api.lastAvailableDay();
  if (addDays(last, 1).slice(0, 7) !== last.slice(0, 7)) return last; // `last` is itself a month end
  return addDays(`${last.slice(0, 7)}-01`, -1);
}

export function parsePeriod({ months, start, end }) {
  let endD = lastCompleteMonthEnd();
  if (end) {
    const e = monthEnd(end.slice(0, 7));
    if (e < endD) endD = e;
  }
  let startD;
  if (start) startD = `${start.slice(0, 7)}-01`;
  else {
    const n = months || 24;
    let [y, m] = endD.split('-').map(Number);
    m = m - n + 1;
    while (m <= 0) { y--; m += 12; }
    startD = `${y}-${String(m).padStart(2, '0')}-01`;
  }
  if (startD < api.FIRST_DAY) startD = api.FIRST_DAY;
  if (startD > endD) throw new Error(`Empty period: ${startD} .. ${endD}`);
  return [startD, endD];
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------
/** 'Label=Title A+Title B' | 'Title' | 'Q123' */
export function parseTopic(spec) {
  let label = null;
  const eq = spec.indexOf('=');
  if (eq >= 0) { label = spec.slice(0, eq).trim(); spec = spec.slice(eq + 1); }
  return { label, titles: spec.split('+').map((t) => t.trim()).filter(Boolean) };
}

/** '[Topic::]lang=Title' -> Map key `${topic ?? ''}|${lang}` */
export function parseOverrides(items = []) {
  const out = new Map();
  for (let it of items) {
    let topic = '';
    if (it.includes('::')) [topic, it] = it.split('::', 2);
    const eq = it.indexOf('=');
    out.set(`${topic}|${it.slice(0, eq).trim()}`, it.slice(eq + 1).trim());
  }
  return out;
}

export async function resolveTopic(store, spec, sourceLang, langs) {
  let { label, titles } = parseTopic(spec);
  const perLang = Object.fromEntries(langs.map((l) => [l, []]));
  const notes = [], qids = [];
  for (const t of titles) {
    let qid;
    if (QID.test(t)) qid = t;
    else {
      let found = null, c = null;
      for (const lang of [sourceLang, ...langs.filter((x) => x !== sourceLang)]) {
        c = await api.canonical(store, t, lang);
        if (!c.missing) { found = lang; break; }
      }
      if (!found) {
        const sugg = (await api.search(store, t, sourceLang, 5)).map((r) => r.title);
        notes.push(`'${t}' not found in ${sourceLang}.wikipedia (or target languages). Search suggestions in ${sourceLang}: ${JSON.stringify(sugg)}`);
        continue;
      }
      if (found !== sourceLang) notes.push(`'${t}' was found in ${found}.wikipedia, not ${sourceLang}`);
      qid = c.qid;
      if (!qid) {
        notes.push(`'${c.title}' has no Wikidata item; only ${found} is covered`);
        if (perLang[found]) perLang[found].push(c.title);
        continue;
      }
    }
    qids.push(qid);
    const links = await api.sitelinks(store, qid);
    for (const lang of langs) if (links[lang] && !perLang[lang].includes(links[lang])) perLang[lang].push(links[lang]);
    label ??= links.en || links[sourceLang] || t;
  }
  const missing = langs.filter((l) => !perLang[l].length);
  if (missing.length)
    notes.push(`No article linked in: ${missing.join(', ')} (use --title-override lang=Title after \`search\`, or treat absence as a signal of low coverage)`);
  return { label: label || spec, spec, qids, titles: perLang, notes };
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------
export const slugify = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'run';

export async function runAnalysis({
  topics, langs, sourceLang = 'en', months, start, end, overrides = [], agent = 'user', maxRedirects = 40, outDir, store,
}) {
  store ??= new Store();
  const [startD, endD] = parsePeriod({ months, start, end });
  const monthList = monthRange(startD, endD);
  const dayList = days(startD, endD);
  const ovr = parseOverrides(overrides);

  const resolved = [];
  for (const t of topics) resolved.push(await resolveTopic(store, t, sourceLang, langs));
  for (const r of resolved)
    for (const lang of langs) {
      const o = ovr.get(`${r.label}|${lang}`) || ovr.get(`${r.spec}|${lang}`) || (topics.length === 1 ? ovr.get(`|${lang}`) : null);
      if (o) {
        // no article linked to the same Wikidata concept => the override is a stand-in for another concept
        if (!r.titles[lang].length) (r.proxies ??= []).push(lang);
        r.titles[lang] = [o];
        r.notes.push(`${lang}: title overridden to '${o}'`);
      }
    }

  if (!resolved.some((r) => langs.some((l) => r.titles[l]?.length)))
    throw new Error(`no article found for ${resolved.map((r) => `'${r.label}'`).join(', ')} in any of: ${langs.join(', ')}. ` +
      'Check the English title (`search <query> --lang en`), or use --source-lang / --title-override. Nothing was analysed.');

  // redirects of every article (their views belong to the topic too)
  const redirectMap = new Map(), redirectTotal = new Map();
  const pairs = resolved.flatMap((r) => Object.entries(r.titles).flatMap(([lang, ts]) => ts.map((t) => [lang, t])));
  const reds = await api.pool(pairs, ([lang, t]) => (maxRedirects > 0 ? api.redirects(store, t, lang) : []));
  pairs.forEach(([lang, t], i) => {
    redirectTotal.set(`${lang}|${t}`, reds[i].length);
    redirectMap.set(`${lang}|${t}`, reds[i].slice(0, maxRedirects));
  });

  const reqs = new Map(langs.map((l) => [`${l}.wikipedia|`, [`${l}.wikipedia`, null]]));
  for (const [lang, t] of pairs) {
    const project = `${lang}.wikipedia`;
    for (const a of [t, ...redirectMap.get(`${lang}|${t}`)]) reqs.set(`${project}|${a}`, [project, a]);
  }
  const data = await api.dailyViews(store, [...reqs.values()], agent, startD, endD);
  const arr = (project, article) => A.toArray(data.get(`${project}|${article ?? api.TOTAL}`) || {}, dayList);

  const series = [];
  for (const r of resolved)
    for (const lang of langs) {
      const titles = r.titles[lang] || [];
      const project = `${lang}.wikipedia`;
      if (!titles.length) { series.push({ topic: r.label, lang, articles: [], missing: true }); continue; }
      const main = new Array(dayList.length).fill(0), red = new Array(dayList.length).fill(0);
      let used = 0, total = 0;
      for (const t of titles) {
        arr(project, t).forEach((v, i) => (main[i] += v));
        for (const x of redirectMap.get(`${lang}|${t}`)) arr(project, x).forEach((v, i) => (red[i] += v));
        used += redirectMap.get(`${lang}|${t}`).length;
        total += redirectTotal.get(`${lang}|${t}`);
      }
      const res = A.analyseSeries(main, red, arr(project, null), dayList, monthList);
      if (total > used) res.cautions.push(`only ${used} of ${total} redirects counted`);
      const proxy = (r.proxies || []).includes(lang);
      if (proxy) {
        res.cautions.unshift(`PROXY: '${titles[0]}' is not the same concept as '${r.label}' (not linked in Wikidata); ` +
          'do not compare it like-for-like with other languages');
        if (res.confidence === 'high') res.confidence = 'medium';
      }
      series.push({ topic: r.label, lang, articles: proxy ? titles.map((x) => `${x} (proxy)`) : titles, proxy, missing: false, redirects_used: used, redirects_total: total, ...res });
    }

  const run = {
    created: new Date().toISOString().slice(0, 19),
    params: { topics, langs, source_lang: sourceLang, agent, start: startD, end: endD, max_redirects: maxRedirects, overrides },
    resolution: resolved,
    series,
  };
  const out = resolve(outDir ||
    join(process.env.WIKITREND_RUNS || 'wikitrend_runs', slugify(`${resolved.map((r) => r.label).join('_')}_${langs.join('-')}_${startD.slice(0, 7)}-${endD.slice(0, 7)}`)));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'run.json'), JSON.stringify(run, null, 1));
  writeCsv(run, join(out, 'monthly.csv'));
  return { run, out };
}

export function writeCsv(run, path) {
  const lines = ['topic,lang,month,views_raw,views_clean,share_per_million,project_total'];
  for (const s of run.series) {
    if (s.missing) continue;
    s.months.forEach((m, i) =>
      lines.push(`"${s.topic.replaceAll('"', '""')}",${s.lang},${m},${s.monthly_raw[i]},${s.monthly_clean[i]},${s.monthly_share_per_million[i]},${s.project_monthly_total[i]}`));
  }
  writeFileSync(path, lines.join('\n') + '\n');
}
