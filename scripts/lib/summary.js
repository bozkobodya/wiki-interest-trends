// Compact Markdown summary printed to stdout (this is what the agent reads).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
const num = (v) => v.toLocaleString('en');

export function ranked(series, key = 'growth_clean') {
  return series.filter((s) => !s.missing).sort((a, b) => (b[key] ?? -1e9) - (a[key] ?? -1e9));
}

/**
 * Default prioritisation (used unless the user gives own criteria):
 * tier by RELATIVE interest (growth share) where confidence allows, then by audience size.
 * Confidence says how sure we are, not how attractive a market is.
 */
export function priorityTiers(series) {
  const S = series.filter((s) => !s.missing);
  const tier = (s) => {
    const g = s.growth_share;
    if (g === null) return 3;
    if (s.confidence !== 'low' && g > 0.05) return 0; // rising relative interest
    if (s.confidence !== 'low' && g < -0.05) return 2; // falling relative interest
    return 1; // stable or uncertain
  };
  const names = ['A — rising relative interest', 'B — stable / uncertain relative interest', 'C — falling relative interest', 'D — no data'];
  return names
    .map((name, k) => ({ name, items: S.filter((s) => tier(s) === k).sort((a, b) => b.avg_monthly_views - a.avg_monthly_views) }))
    .filter((t) => t.items.length);
}

export function render(run, out, rankBy = 'growth_clean') {
  const p = run.params;
  const ok = ranked(run.series, rankBy);
  const n = ok[0]?.months.length ?? 0;
  const L = [
    `# Wikipedia interest: ${run.resolution.map((r) => r.label).join(', ')} | ${p.langs.join(', ')} | ${p.start.slice(0, 7)}..${p.end.slice(0, 7)} (${n} mo, agent=${p.agent})`,
    `growth columns ALWAYS compare ${ok[0]?.growth_label ?? ''} (not the whole window); cleaned = spike days removed; share = views per 1M views of that language edition; ` +
      `months-up = same calendar month higher than a year earlier; p = trend consistency test (<0.05 consistent). Sorted by ${rankBy}.`,
    '',
    '| topic | lang | article(s) | avg views/mo | growth raw | growth cleaned | growth share | trend/yr | months up | p | confidence |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const s of ok) {
    const mu = s.month_pairs ? `${s.months_up}/${s.month_pairs}` : '-';
    L.push(`| ${s.topic} | ${s.lang} | ${s.articles.join('; ').slice(0, 40)} | ${num(s.avg_monthly_views)} | ${pct(s.growth_raw)} | ` +
      `${pct(s.growth_clean)} | ${pct(s.growth_share)} | ${pct(s.trend_per_year)} | ${mu} | ${s.p_value.toFixed(3)} | ${s.confidence.toUpperCase()} |`);
  }
  const missing = run.series.filter((s) => s.missing);
  if (missing.length) L.push('', 'No article (not analysed): ' + missing.map((s) => `${s.topic}/${s.lang}`).join(', '));

  L.push('', '## Verdicts', ...ok.map((s) => `- ${s.topic} / ${s.lang}: ${s.verdict}`));
  L.push('', '## Evidence and cautions');
  for (const s of ok) {
    const bits = [];
    if (s.reasons.length) bits.push('+ ' + s.reasons.join('; '));
    if (s.cautions.length) bits.push('! ' + s.cautions.join('; '));
    if (s.top_spikes.length) {
      const sp = s.top_spikes[0];
      bits.push(`biggest spike ${sp.day} (${num(sp.views)} views, ${sp.x}x typical)`);
    }
    L.push(`- ${s.topic} / ${s.lang}: ${bits.join(' | ')}`);
  }
  if (ok.length > 1) {
    L.push('', '## Suggested priority (default rule; replace if the user has own criteria)',
      'Rule: tier by growth share (relative interest, confidence not low), then by audience size. ' +
      'Confidence = how sure the trend is, NOT how attractive the audience is. Falling relative interest is a warning, not an opportunity.');
    for (const tr of priorityTiers(ok))
      L.push(`- ${tr.name}: ` + tr.items.map((s) => `${s.topic}/${s.lang} (share ${pct(s.growth_share)}, ${num(s.avg_monthly_views)}/mo, ${s.confidence})`).join('; '));
  }
  L.push('', '## Whole-language-edition traffic: last 12 mo vs previous 12 mo (NOT the whole period)');
  const seen = new Set();
  for (const s of ok) if (!seen.has(s.lang)) { seen.add(s.lang); L.push(`- ${s.lang}.wikipedia: ${pct(s.project_growth)}`); }

  const notes = run.resolution.flatMap((r) => r.notes);
  if (notes.length) L.push('', '## Resolution notes', ...notes.map((x) => `- ${x}`));

  const charts = readdirSync(out).filter((f) => f.endsWith('.svg')).sort().map((f) => join(out, f));
  L.push('', '## Files', `- run dir: ${out}`, `- data: ${join(out, 'run.json')}, ${join(out, 'monthly.csv')}`);
  if (charts.length) L.push(`- charts: ${charts.join(', ')}`);
  return L.join('\n');
}
