# wiki-interest-trends

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) that answers
B2C product questions such as *"Is interest in astronomy growing in Ukrainian Wikipedia, and can we
trust it?"* or *"Which language audiences should we localise for next?"* using Wikimedia page-view data.

For each question it produces:

- a short chat answer with growth numbers, a confidence grade and the reasons behind it;
- SVG charts (trend, trend normalised by the whole edition, growth, volume);
- optionally, a one-page PDF report to share (English or Ukrainian).

Examples: [`evals/example-report-astronomy-uk.pdf`](evals/example-report-astronomy-uk.pdf),
[`evals/example-report-english-6langs.pdf`](evals/example-report-english-6langs.pdf).

> This README is for people. The agent reads [`SKILL.md`](SKILL.md), which holds its step-by-step
> instructions.

## Requirements

- Node.js 22.13+ and npm (macOS, Linux or Windows)
- Internet access to `wikimedia.org`, `wikipedia.org` and `wikidata.org`

The first run installs the locked npm dependencies (`pdfkit`, `svg-to-pdfkit`, DejaVu fonts) with
`npm ci` into the skill folder. This takes about 30 seconds. No build step and no API keys are needed.

## Installation

**Claude Code**: copy or symlink this folder into your skills directory:

```bash
ln -s "$(pwd)/wiki-interest-trends" ~/.claude/skills/wiki-interest-trends
```

(or into `.claude/skills/` of a single project). Then ask in plain language, for example:
*"Compare the growth of interest in intermittent fasting in Polish and Czech Wikipedia over the last
two years."* The agent picks the skill up by its description.

**Other agents / claude.ai**: upload the folder as a skill (zip it without `node_modules/` and
`wikitrend_runs/`).

## Using the CLI directly

The agent does all data work through one CLI, and you can run it yourself too:

```bash
cd wiki-interest-trends
node scripts/wt.js analyze --topic "Intermittent fasting" --langs pl,cs --months 24
```

| Command | What it does |
|---|---|
| `search <query> --lang uk` | Find article titles in one language edition |
| `resolve --topic T --langs pl,cs` | Show which article represents the topic in each language (via Wikidata) |
| `analyze --topic T --langs pl,cs [--months 24]` | Fetch views, compute metrics, draw charts, print a Markdown summary |
| `report <run_dir> --ui-lang uk --notes "..."` | Build a one-page PDF; prints WARNINGS if a check fails |
| `check <run_dir> --text "..."` | Verify the numbers and claims in a draft answer against the run |
| `cache [--clear]` | Show or clear the local cache |

Useful `analyze` options:

- several topics: repeat `--topic`; several articles summed into one topic: `--topic "Label=Title A+Title B"`;
- a topic named in another language: `--source-lang uk`;
- a custom period: `--start 2022-01 --end 2025-12`;
- a manual article for one language: `--title-override pl="Exact Title"`;
- ranking: `--rank-by growth_clean|growth_share|avg_monthly_views|avg_share_per_million|trend_per_year`;
- traffic type: `--agent user` (default, humans only) or `all-agents`.

Full help: `node scripts/wt.js --help`.

Results go to `./wikitrend_runs/<slug>/` in the current directory: `run.json`, `monthly.csv`,
`trend.svg`, `trend_share.svg`, `growth.svg`, `volume.svg` and, after `report`, the PDF.

## How it works

```
question ──► agent picks topic, languages, period (SKILL.md)
                │
                ▼
   resolve   English title ─► Wikidata id ─► article title in every requested language
                │             (+ redirects, so renamed articles keep their history)
                ▼
   fetch     daily views per article + daily views of the whole language edition
                │             (Wikimedia Analytics API, cached in SQLite by day ranges)
                ▼
   analyse   clean spikes ─► growth (last 12 vs previous 12 months) ─► growth share
                │             ─► seasonal Mann-Kendall trend test ─► confidence grade
                ▼
   output    Markdown summary for the agent, SVG charts, run.json / monthly.csv
                │
                ▼
   answer    agent writes the answer ─► `check` verifies every number and claim
             optional `report` ─► one-page PDF, numbers and layout checked
```

The main ideas:

1. **Topics are mapped through Wikidata**, not translated by hand. If a language has no linked article,
   the tool says so. That gap is itself a finding (possible content gap), and the tool does not
   silently substitute a different article.
2. **One-off spikes are removed.** A day with more than 4× the 29-day rolling median is replaced by
   the median. News, a Google Doodle or a bot burst does not show lasting demand. Raw and cleaned growth
   are both reported.
3. **Growth compares full years** (last 12 months vs previous 12), which cancels seasonality such as
   the school year or New Year resolutions.
4. **Normalisation by the whole edition** (views per 1M edition views) separates "interest in the topic
   changed" from "all of Wikipedia lost traffic", for example to search snippets and AI assistants.
5. **A trend test** (seasonal Mann-Kendall) compares each month only with the same month in other years
   and gives a p-value and "months up N/12".
6. **A confidence grade** (high / medium / low) is computed in code from volume, p-value, raw-vs-cleaned
   agreement, whether the direction survives normalisation and the length of history. It is capped when
   the data is thin or spike-driven, and every grade comes with its reasons and cautions.
7. **Suggested priority**: for "what next?" questions, tiers A/B/C rank by relative-interest growth and
   then audience size. High confidence in a *decline* is a warning, not a reason to pick a market.
8. **Guardrails against wrong answers**: `check` and `report` flag numbers, p-values, confidence words and
   growing/falling claims that don't match the data, and countries named instead of languages.

The design principle is that **the code does the thinking that must be correct, and the model does the
language**. The statistics, grading and number checking are deterministic, so even a small model
(evaluated with Claude Haiku 4.5) gives correct answers.

Details: [`references/methodology.md`](references/methodology.md) (how the metrics are computed) and
[`references/interpreting.md`](references/interpreting.md) (how to read them).

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `WIKITREND_CACHE` | `~/.cache/wikitrend` | Folder for the SQLite cache (can be shared) |
| `WIKITREND_RUNS` | `./wikitrend_runs` | Base folder for run results |
| `WIKITREND_WORKERS` | `6` | Parallel API requests |
| `WIKITREND_USER_AGENT` | built-in | User-Agent sent to Wikimedia APIs |

## Tests and evaluations

```bash
npm test
```

Offline unit tests on synthetic series with known answers: steady growth, flat noise, a viral spike,
a platform-wide decline, low volume and cache gaps.

End-to-end scenarios for a cheap model are in [`evals/cases.md`](evals/cases.md), and the graded results
and the fixes they led to are in [`evals/results.md`](evals/results.md).

## Project structure

```
SKILL.md            agent instructions
README.md           this file
DEVELOPMENT.md      code layout, how it was verified, roadmap
references/         methodology and interpretation guides (loaded by the agent on demand)
scripts/wt.js       CLI entry point
scripts/lib/        API clients, cache, statistics, charts, PDF, claim checker, i18n
tests/              unit tests (node:test)
evals/              evaluation cases, results and example PDFs
```

Module-by-module description and the roadmap: [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Limitations

- Page views measure curiosity and attention, not willingness to pay. Treat results as a signal to
  validate further (search volume, app-store keywords, a landing-page test).
- A language edition is not a country: `es` covers Spain and Latin America, `pt` covers Brazil and
  Portugal, and many people read English Wikipedia instead of their local one.
- One article only approximates a topic. Add related articles with `Label=A+B`.
- Data starts in July 2015. The tool describes the past and does not forecast.
- PDF fonts have no CJK glyphs yet.

## License

MIT, see [`LICENSE`](LICENSE).
