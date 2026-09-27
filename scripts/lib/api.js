// Clients for the Wikimedia Analytics (page views), MediaWiki and Wikidata APIs.
// All network calls go through getJson(): retries on 429/5xx and a descriptive User-Agent,
// as required by the Wikimedia User-Agent policy.
import { addDays, today } from './dates.js';

const AQS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews';
export const USER_AGENT =
  process.env.WIKITREND_USER_AGENT ||
  'wiki-interest-trends-skill/1.0 (Agent Skill for Wikipedia interest research; https://agentskills.io) node-fetch';
export const FIRST_DAY = '2015-07-01'; // page-view API has no data before this day
const WORKERS = Number(process.env.WIKITREND_WORKERS || 6);
export const TOTAL = '__PROJECT_TOTAL__';

export class NotFound extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJson(url, retries = 4) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error(`Network error for ${url}: ${e.message}`);
    }
    if (res.ok) return res.json();
    if (res.status === 404) throw new NotFound(url);
    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
      await sleep(1000 * (Number(res.headers.get('retry-after')) || 2 ** attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
}

export function wikiApi(lang, params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return getJson(`https://${lang}.wikipedia.org/w/api.php?${qs}`);
}

/** Daily data is usually published within ~24h; keep a safety margin. */
export const lastAvailableDay = () => addDays(today(), -2);

/** Run async fn over items with limited concurrency, preserving order. */
export async function pool(items, fn, workers = WORKERS) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Page views
// ---------------------------------------------------------------------------
const stamp = (d) => d.replaceAll('-', '') + '00';

async function fetchDailyRaw(project, article, agent, start, end) {
  const url =
    article === null
      ? `${AQS}/aggregate/${project}/all-access/${agent}/daily/${stamp(start)}/${stamp(end)}`
      : `${AQS}/per-article/${project}/all-access/${agent}/${encodeURIComponent(article.replaceAll(' ', '_'))}/daily/${stamp(start)}/${stamp(end)}`;
  try {
    const { items = [] } = await getJson(url);
    return Object.fromEntries(
      items.map((i) => [`${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, i.views]),
    );
  } catch (e) {
    if (e instanceof NotFound) return {}; // no views recorded (or page did not exist) in this range
    throw e;
  }
}

/**
 * Daily views for many [project, article] pairs (article=null: whole project).
 * Uses the cache and downloads only missing ranges, in parallel.
 * Returns Map key `${project}|${article ?? TOTAL}` -> {day: views}.
 */
export async function dailyViews(store, requests, agent, start, end) {
  if (start < FIRST_DAY) start = FIRST_DAY;
  const last = lastAvailableDay();
  if (end > last) end = last;
  const jobs = [];
  for (const [project, article] of requests) {
    const key = article ?? TOTAL;
    for (const [gs, ge] of store.missingRanges(project, key, agent, start, end)) jobs.push({ project, article, key, gs, ge });
  }
  if (jobs.length) process.stderr.write(`fetching ${jobs.length} series from Wikimedia...\n`);
  const results = await pool(jobs, (j) => fetchDailyRaw(j.project, j.article, agent, j.gs, j.ge));
  jobs.forEach((j, k) => store.saveDaily(j.project, j.key, agent, j.gs, j.ge, results[k]));
  const out = new Map();
  for (const [project, article] of requests) {
    const key = article ?? TOTAL;
    out.set(`${project}|${key}`, store.loadDaily(project, key, agent, start, end));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Title resolution
// ---------------------------------------------------------------------------
/**
 * Article search ranked by how the query matched: every word in the title ('title'), the exact phrase
 * in the text ('phrase'), then any words in the text ('text'). Plain full-text search alone ranks
 * long unrelated articles first (e.g. pl "post przerywany" → "Charlie Kirk").
 */
export async function search(store, query, lang, limit = 8) {
  const key = `search2|${lang}|${query}|${limit}`;
  const cached = store.kvGet(key, 7);
  if (cached) return cached;
  const words = query.replace(/"/g, '').split(/\s+/).filter(Boolean);
  const kinds = [
    ['title', words.map((w) => `intitle:${w}`).join(' ')],
    ['phrase', `"${words.join(' ')}"`],
    ['text', words.join(' ')],
  ];
  const results = await Promise.all(kinds.map(([, q]) =>
    wikiApi(lang, { action: 'query', list: 'search', srsearch: q, srlimit: limit, srnamespace: 0, srprop: 'snippet|wordcount' })));
  const seen = new Set(), res = [];
  kinds.forEach(([match], i) => {
    for (const r of results[i].query?.search || []) {
      if (seen.has(r.title)) continue;
      seen.add(r.title);
      res.push({ title: r.title, match, words: r.wordcount, snippet: (r.snippet || '').replace(/<[^>]+>/g, '').slice(0, 140) });
    }
  });
  store.kvPut(key, res.slice(0, limit));
  return res.slice(0, limit);
}

/** Follow redirects/normalisation; returns {title, qid} or {missing: true, title}. */
export async function canonical(store, title, lang) {
  const key = `canon|${lang}|${title}`;
  const cached = store.kvGet(key);
  if (cached) return cached;
  const data = await wikiApi(lang, { action: 'query', titles: title, redirects: 1, prop: 'pageprops', ppprop: 'wikibase_item' });
  const page = data.query?.pages?.[0];
  const res =
    !page || page.missing || page.invalid
      ? { missing: true, title }
      : { title: page.title, qid: page.pageprops?.wikibase_item ?? null };
  store.kvPut(key, res);
  return res;
}

const NON_WIKIPEDIA = new Set(['commons', 'species', 'meta', 'wikidata', 'mediawiki', 'sources', 'incubator']);

/** {lang: title} for a Wikidata item (Wikipedias only). */
export async function sitelinks(store, qid) {
  const key = `sitelinks|${qid}`;
  const cached = store.kvGet(key);
  if (cached) return cached;
  const qs = new URLSearchParams({ action: 'wbgetentities', ids: qid, props: 'sitelinks', format: 'json' });
  const ent = (await getJson(`https://www.wikidata.org/w/api.php?${qs}`)).entities?.[qid] || {};
  const res = {};
  for (const [site, link] of Object.entries(ent.sitelinks || {})) {
    if (!site.endsWith('wiki')) continue;
    const code = site.slice(0, -4);
    if (NON_WIKIPEDIA.has(code)) continue;
    res[code.replaceAll('_', '-')] = link.title;
  }
  store.kvPut(key, res);
  return res;
}

/** Main-namespace titles that redirect to `title`. */
export async function redirects(store, title, lang) {
  const key = `redirects|${lang}|${title}`;
  const cached = store.kvGet(key, 14);
  if (cached) return cached;
  const out = [];
  let cont = {};
  for (let i = 0; i < 10; i++) {
    const data = await wikiApi(lang, { action: 'query', titles: title, prop: 'redirects', rdnamespace: 0, rdlimit: 'max', ...cont });
    for (const p of data.query?.pages || []) out.push(...(p.redirects || []).map((r) => r.title));
    if (!data.continue) break;
    cont = data.continue;
  }
  store.kvPut(key, out);
  return out;
}
