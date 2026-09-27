#!/usr/bin/env node
// CLI for the wiki-interest-trends skill. Run `node scripts/wt.js --help`.
// Cross-platform entry point: installs locked npm dependencies on first use (npm ci), then runs.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Hide node:sqlite's ExperimentalWarning (replaces `node --disable-warning=ExperimentalWarning`).
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.error(`${w.name}: ${w.message}`); });

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(SKILL_DIR, 'node_modules', 'pdfkit'))) {
  console.error('wt: installing dependencies (one time)...');
  // Through the shell so Windows finds npm.cmd; the command is fixed, nothing user-supplied.
  const r = spawnSync('npm ci --omit=dev --no-audit --no-fund --loglevel=error',
    { cwd: SKILL_DIR, stdio: ['ignore', 2, 2], shell: true });
  if (r.status !== 0) {
    console.error(`ERROR: npm ci failed in ${SKILL_DIR}. Check that Node.js 22.13+ and npm are installed and online.`);
    process.exit(2);
  }
}

// Loaded after the install above, because report.js imports pdfkit.
const api = await import('./lib/api.js');
const { makeCharts } = await import('./lib/charts.js');
const { resolveTopic, runAnalysis } = await import('./lib/pipeline.js');
const { buildPdf, checkClaims } = await import('./lib/report.js');
const { Store } = await import('./lib/store.js');
const { render } = await import('./lib/summary.js');

const HELP = `wt — Wikipedia interest trends: fetch, analyse, chart, report.

Commands:
  search <query> [--lang en] [--limit 6]           find article titles in one language edition
  resolve --topic T [--topic T2] --langs pl,cs [--source-lang en]
                                                   which article represents the topic in each language
  analyze --topic T [--topic ...] --langs pl,cs    fetch data, compute metrics, draw charts, print summary
      [--source-lang en] [--months 24 | --start YYYY-MM [--end YYYY-MM]]
      [--title-override [TOPIC::]LANG=TITLE ...] [--agent user|all-agents|automated|spider]
      [--max-redirects 40] [--rank-by growth_clean|growth_share|avg_monthly_views|avg_share_per_million|trend_per_year]
      [--ui-lang en|uk] [--out DIR] [--no-charts]
      Topic forms: English title ("Intermittent fasting"), Wikidata id (Q12345),
      or several articles summed: "Label=Title A+Title B".
  report <run_dir> [--notes TEXT | --notes-file F] [--title T] [--ui-lang en|uk] [--out file.pdf]
                                                   one-page PDF; prints WARNINGS if a check fails
  check <run_dir> (--text TEXT | --file F)         verify numbers in a draft answer against the run
  cache [--clear]                                  cache location and size
`;

const OPTIONS = {
  lang: { type: 'string', default: 'en' },
  limit: { type: 'string', default: '6' },
  topic: { type: 'string', multiple: true },
  langs: { type: 'string' },
  'source-lang': { type: 'string', default: 'en' },
  months: { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  'title-override': { type: 'string', multiple: true },
  agent: { type: 'string', default: 'user' },
  'max-redirects': { type: 'string', default: '40' },
  'rank-by': { type: 'string', default: 'growth_clean' },
  'ui-lang': { type: 'string', default: 'en' },
  out: { type: 'string' },
  'no-charts': { type: 'boolean', default: false },
  notes: { type: 'string' },
  'notes-file': { type: 'string' },
  title: { type: 'string' },
  text: { type: 'string' },
  file: { type: 'string' },
  clear: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h' },
};

const langList = (s) => (s || '').split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const fail = (msg) => { console.error(`ERROR: ${msg}`); process.exit(2); };
const need = (v, flag) => v || fail(`${flag} is required. See: node scripts/wt.js --help`);
const loadRun = (dir) => JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));

const COMMANDS = {
  async search(o, [query]) {
    const res = await api.search(new Store(), need(query, '<query>'), o.lang, Number(o.limit));
    if (!res.length) console.log(`No results in ${o.lang}.wikipedia for '${query}'. Try other wording or --lang en.`);
    for (const r of res) console.log(`- ${r.title}  [${r.match} match, ${r.words} words] — ${r.snippet}`);
    if (res.length && !res.some((r) => r.match === 'title'))
      console.log(`Note: no ${o.lang} article title contains these words; the results only mention them in their text. ` +
        `If none is an article about this topic, report "no article in ${o.lang}" (do not use an unrelated one).`);
  },

  async resolve(o) {
    const store = new Store();
    const langs = langList(need(o.langs, '--langs'));
    for (const spec of need(o.topic, '--topic')) {
      const r = await resolveTopic(store, spec, o['source-lang'], langs);
      console.log(`## ${r.label}  (Wikidata: ${r.qids.join(', ') || 'none'})`);
      for (const lang of langs) {
        const ts = r.titles[lang] || [];
        if (!ts.length) { console.log(`- ${lang}: — no article`); continue; }
        let n = 0;
        for (const x of ts) n += (await api.redirects(store, x, lang)).length;
        console.log(`- ${lang}: ${ts.join(' + ')}  [${n} redirects]`);
      }
      for (const n of r.notes) console.log(`  note: ${n}`);
    }
  },

  async analyze(o) {
    const { run, out } = await runAnalysis({
      topics: need(o.topic, '--topic'), langs: langList(need(o.langs, '--langs')), sourceLang: o['source-lang'],
      months: o.months ? Number(o.months) : undefined, start: o.start, end: o.end, overrides: o['title-override'] || [],
      agent: o.agent, maxRedirects: Number(o['max-redirects']), outDir: o.out,
    });
    if (!o['no-charts']) makeCharts(run, out, o['ui-lang']);
    const text = render(run, out, o['rank-by']);
    writeFileSync(join(out, 'summary.md'), text);
    console.log(text);
    console.log(`\nNext: \`node ${join(SKILL_DIR, 'scripts', 'wt.js')} report ${out} --ui-lang ${o['ui-lang']} --notes "..."\` to build the one-page PDF.`);
  },

  async report(o, [runDir]) {
    const run = loadRun(need(runDir, '<run_dir>'));
    const notes = o['notes-file'] ? readFileSync(o['notes-file'], 'utf8') : o.notes;
    const res = await buildPdf(run, o.out || join(runDir, 'report.pdf'), { title: o.title, notes, ui: o['ui-lang'] });
    console.log(`PDF: ${res.pdf} (1 page, A4)`);
    if (res.warnings.length) {
      console.log('WARNINGS (fix and re-run before sharing):');
      for (const w of res.warnings) console.log(`- ${w}`);
    } else console.log('Checks passed: numbers in notes match computed values; content fits on one page.');
  },

  async check(o, [runDir]) {
    const run = loadRun(need(runDir, '<run_dir>'));
    const text = o.file ? readFileSync(o.file, 'utf8') : need(o.text, '--text or --file');
    const w = checkClaims(text, run);
    if (w.length) { console.log('Fix these statements, then check again:\n' + w.map((x) => `- ${x}`).join('\n')); process.exit(1); }
    console.log('OK: numbers, p-values, confidence and growth/decline words match the run data; no countries used for language editions.');
  },

  async cache(o) {
    const s = new Store();
    if (o.clear) { s.clear(); console.log('cache cleared'); }
    console.log(JSON.stringify(s.stats(), null, 1));
  },
};

async function main() {
  // Glue string options to their value so values may start with '-' (e.g. notes bullets "- point").
  const argv = [];
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const name = raw[i].startsWith('--') && !raw[i].includes('=') ? raw[i].slice(2) : null;
    if (name && OPTIONS[name]?.type === 'string' && i + 1 < raw.length) argv.push(`${raw[i]}=${raw[++i]}`);
    else argv.push(raw[i]);
  }
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  const [cmd, ...rest] = positionals;
  if (values.help || !cmd) { console.log(HELP); return; }
  if (!COMMANDS[cmd]) fail(`unknown command '${cmd}'. See: node scripts/wt.js --help`);
  if (!['en', 'uk'].includes(values['ui-lang'])) fail('--ui-lang must be en or uk');
  await COMMANDS[cmd](values, rest);
}

main().catch((e) => {
  if (e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') fail(`${e.message}. See: node scripts/wt.js --help`);
  console.error(`ERROR: ${e.message}`);
  if (/HTTP|Network/.test(e.message)) console.error('The Wikimedia API may be rate limiting or unreachable; wait a minute and retry (cached data is kept).');
  process.exit(2);
});
