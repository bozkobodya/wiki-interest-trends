# Development and roadmap

## Layout

```
wiki-interest-trends/
├── SKILL.md                 agent instructions (kept short for small models)
├── references/              loaded on demand: interpreting.md, methodology.md
├── scripts/wt.js            CLI entry (`node scripts/wt.js`): installs locked deps via `npm ci` on first
│                            run, then search | resolve | analyze | report | check | cache
├── scripts/wt               optional bash shortcut for `node scripts/wt.js`
├── scripts/lib/
│   ├── api.js               Wikimedia/MediaWiki/Wikidata clients, retries, concurrency pool
│   ├── store.js             SQLite cache (node:sqlite): daily views + fetched ranges, JSON kv with TTL
│   ├── pipeline.js          topic resolution → fetch → analysis → run directory
│   ├── analysis.js          pure statistics (spikes, growth, seasonal Mann-Kendall, confidence)
│   ├── summary.js           Markdown summary for the agent
│   ├── charts.js            dependency-free SVG charts (same SVG embedded in the PDF)
│   ├── report.js            one-page PDF (pdfkit + svg-to-pdfkit)
│   ├── claims.js            claim checker for `check` and PDF notes (numbers, p, confidence, direction, countries)
│   └── i18n.js              en/uk UI strings
├── tests/                   `npm test`: offline unit tests on synthetic data
└── evals/                   end-to-end cases for a cheap model, and their results
```

Design principles:
- **The code does the thinking that must be correct; the model does the language.** Statistics,
  confidence grading, deterministic findings and number checking live in code. A small model only has
  to choose parameters and phrase the answer.
- **Few, predictable commands** with a compact Markdown output: a small model reads ~2–4k tokens per run
  instead of raw JSON.
- **Guardrails over trust**: `report` and `check` flag any number in the model's text that isn't in the
  data, and report layout overflow.
- **Cache by day ranges**, so follow-ups (a longer period, extra languages) only download what's missing.

## How it was verified

1. Unit tests on synthetic series with known answers (growth, flat noise, viral spike, platform-wide
   decline, low volume, cache gaps).
2. The statistics were first implemented in Python/numpy, then ported to JavaScript. Both versions
   produced identical tables on the same real queries (e.g. English language in 6 editions: identical
   growth, p-values and grades).
3. Real API runs for the brief's examples; the PDFs were rendered to images and inspected (this caught
   chart scaling and axis-range bugs).
4. End-to-end runs with Claude Haiku 4.5 given only the skill and the user prompt (`evals/cases.md`,
   `evals/results.md`). The transcripts were read to find where the instructions confused the model, and
   SKILL.md was adjusted.

## Iterative roadmap

### Next iteration: better questions from the same data
- **Topic clusters**: automatically suggest related articles (Wikidata "subclass of"/"part of", category
  members, most-linked pages) and let the user approve a cluster, instead of a single proxy article.
- **Breakdowns**: `access=mobile-web|desktop|mobile-app` split. Desktop-only spikes are a strong bot
  signal, and mobile share indicates the audience type.
- **Seasonality profile**: the monthly pattern (e.g. September school peak), useful for launch timing.
- **Custom scoring**: `--score "growth_share>0 & avg_monthly_views>=1000"` so users can save their own
  criteria in a project file and re-apply them.
- **Report templates**: comparison, single-topic deep dive, and a multi-page appendix with per-language charts.

### Scaling up: many topics × many languages, long history
- **Monthly granularity for screening**: fetch monthly data (one request per article per decade) to
  screen hundreds of topics or languages, then fetch daily data only for the shortlist (spike cleaning
  needs daily data).
- **Bulk dumps instead of the API**: for thousands of articles, use the Wikimedia pageview dumps
  (hourly/daily files) loaded into DuckDB/Parquet; the API client stays for ad-hoc queries.
- **Rate-limit aware scheduler**: token bucket per host, resumable job queue in SQLite, progress output.
  The cache already makes interrupted runs resumable.
- **Shared cache**: `WIKITREND_CACHE` can point to a shared volume, and the SQLite schema maps
  directly to Postgres for a team service.
- **Run registry**: index run directories so an agent can say "compared with last month's report…" and
  diff two runs.

### Stronger evidence
- **Other sources behind the same interface**: Google Trends, app-store keyword ranks, Reddit/YouTube
  activity, used to triangulate Wikipedia signals. The confidence grade would then include cross-source
  agreement.
- **Change-point detection** (e.g. PELT) to date when a trend started, and simple forecasts with
  intervals (ETS) where the history is long enough.
- **Autocorrelation-corrected trend tests** (Hamed–Rao) for long daily series.
- **Language → market mapping** (speaker counts, internet users, app-store market size) to turn
  "interest per language edition" into an estimated reachable audience.

### Keeping it reliable
- Run `evals/cases.md` on a cheap model on every SKILL.md/CLI change. Track pass rates per checklist item.
- Add recorded API fixtures, so end-to-end tests run offline in CI.
- Grow `i18n.js` as users request more report languages. Add CJK fonts, since DejaVu has no CJK glyphs.
