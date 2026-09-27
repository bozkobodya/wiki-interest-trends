---
name: wiki-interest-trends
description: Measures and compares public interest in topics across Wikipedia language editions using Wikimedia page-view data, then produces charts, trust-graded findings and a shareable one-page PDF report. Use when a user asks whether interest in a topic is growing, compares topics or languages/markets (e.g. "interest in intermittent fasting in Polish vs Czech Wikipedia", "should we add an astronomy course", "which language audiences to research next"), or wants data-backed prioritisation of B2C product topics or localisation languages.
license: MIT (see LICENSE)
compatibility: Node.js 22.13+ and npm, internet access to wikimedia.org, wikipedia.org and wikidata.org. First run installs locked npm dependencies (pdfkit, svg-to-pdfkit, DejaVu fonts) into the skill directory.
metadata:
  version: "1.0"
---

# Wikipedia interest trends

All data work is done by one Node.js CLI: `scripts/wt.js`, relative to this skill's directory. Always run
it with `node` and its **absolute path**, e.g. `node "/path/to/wiki-interest-trends/scripts/wt.js" ...`
(works on macOS, Linux and Windows; the examples below shorten this to `wt`). The first run installs its
npm dependencies automatically (~30 s). Do NOT write your own code to call the APIs or compute statistics.

## Workflow (follow in order)

**1. Turn the request into parameters.**
- `--topic`: English Wikipedia article title (e.g. `"Intermittent fasting"`, `Astronomy`). A topic in
  another language → add `--source-lang uk` etc. Several articles summed into one topic:
  `--topic "Label=Title A+Title B"`. Several topics → repeat `--topic`.
- `--langs`: Wikipedia language codes, comma separated: `uk,pl,cs,de,es,tr,vi,pt,fr,it,ro,ja,ko,id...`
  (codes, not countries: Brazil → `pt`, Czechia → `cs`, Ukraine → `uk`).
- Period: `--months 24` for "last two years". Default 24. Use `--months 36` or more when the user asks
  "can we trust it", because longer windows separate trend from seasonality better.
- If the user doesn't name languages, pick 4-8 plausible ones and **say which ones you picked and why**.

**2. Check the article mapping when unsure** (a vague topic, or a non-English one):
```bash
wt resolve --topic "Astronomy" --langs uk,pl
wt search "вивчення англійської" --lang uk     # find titles in one language
```
A concept like "learning English" rarely has its own article. Pick the closest real article (e.g.
`English language`, `English as a second or foreign language`) and state the proxy in the answer.

Run all commands from the user's working directory (not from the skill directory): results go to
`./wikitrend_runs/<slug>/` there, and the output prints absolute paths.

**3. Run the analysis** (the network fetch is cached, so re-runs and follow-ups are fast):
```bash
wt analyze --topic "Intermittent fasting" --langs pl,cs --months 24
```
It prints a Markdown summary: a table, verdicts, evidence/cautions, whole-wiki traffic, and file paths
(SVG charts `trend.svg`, `trend_share.svg`, `growth.svg`, `volume.svg`, plus `run.json` and `monthly.csv`).
Read the summary. Do not open run.json unless you need monthly numbers.

If the output says **"No article linked in: xx"**: run `wt search "<topic in that language>" --lang xx`.
- A real article on the **same** concept (just not linked in Wikidata) → re-run with `--title-override xx="Exact Title"`.
- Only broader/different articles (e.g. "therapeutic fasting" for "intermittent fasting") → do **not** use
  them as the answer for that language. Report "no article in xx" as the finding (low local coverage =
  possible content gap). Optionally show the broader article as clearly separate context; the tool marks
  such overrides as `(proxy)` with a caution.

**4. Interpret using these rules** (details: [references/interpreting.md](references/interpreting.md)):
- Base the answer on **growth cleaned**. Use **growth share** (normalised by the whole language edition)
  to tell a topic trend apart from a Wikipedia-wide change. If views fall but the share is flat, say
  "interest is stable relative to Wikipedia overall; all of Wikipedia is losing views".
- Trust = the `confidence` column plus its reasons and cautions. Quote at least one reason or caution.
  - `p < 0.05` and months-up near all or none: consistent trend.
  - `p > 0.2`: no reliable trend. Don't call it growth or decline.
  - Spike caution: growth came from one-off events (news, bots). Say so.
  - Avg views under 1,000/month: small audience, noisy percentages.
- Compare languages by growth and share, not raw views: editions differ hugely in size.
  Raw views = audience size.
- **Growth columns always mean last 12 months vs the previous 12**, even when `--months 36`. Never write
  "−60% over 3 years".
- **"Which audiences/topics next?"**: start from the `Suggested priority` section (tier A = rising relative
  interest, B = stable, C = falling). High confidence in a *decline* is a warning, not a reason to pick
  it. If the user gave their own criteria, apply those instead and state the rule.
- Page views measure curiosity, not willingness to pay. Present results as a signal for further
  validation. Never say "fully reliable" or "can be trusted completely"; give the grade and why.
- **Don't add facts that are not in the output** (population, market size, causes such as "war" or
  "Duolingo"). If you offer an explanation, label it a hypothesis to check.

**5. Answer the user** in their language with this structure (keep it short, but include all 5 parts,
also when you build a PDF):
1. Direct answer (1–2 sentences), with the key numbers.
2. A small table or bullets per language/topic: growth, normalised growth, average views/month, confidence.
   Name rows by **language** (e.g. `німецька (de)`), never by country. Copy each confidence word as the
   tool gives it; don't re-grade.
3. How far to trust it: the reasons and cautions from the output.
4. Recommendation / next step to validate (e.g. search-volume data, app-store keywords, a landing-page test).
5. Assumptions: articles used (proxies), period, language ≠ country (never label a language edition
   with a single country: `es` is Spain + Latin America, `pt` is Brazil + Portugal).
**Before sending, re-read the draft** and fix it if it: names a country instead of a language; states a
cause as fact (only as "hypothesis to check"); says anything about languages or topics you did not
analyse (suggest analysing them instead); says "over N years" for a growth number (it is last 12 vs
previous 12 months); ranks priorities differently from `Suggested priority` without stating your rule.
Copy numbers exactly from the tool output. **Always** verify the exact final text (same language, same wording) before sending it:
`wt check <run_dir> --text "<your draft>"`. It flags numbers, p-values, months-up, confidence words and
growing/falling words that don't match the data, and countries used instead of languages. Fix every
flagged statement (or remove it) and check again until it prints OK.

**6. PDF report**: whenever the user asks for a report (звіт, "short report", summary to share) or a
PDF, build it **in addition to** the chat answer:
```bash
wt report <run_dir> --ui-lang uk --title "..." --notes "- point one
- point two
- next step"
```
- `--ui-lang uk` for Ukrainian users, `en` otherwise. Write `--notes` in the same language.
- Notes: at most 1,100 characters, 3–5 bullets. Include the interpretation, the recommendation and the
  next validation step. The PDF already contains the computed findings, charts, table and method, so
  don't repeat the table.
- If the command prints **WARNINGS**, fix the notes (a wrong number, too long, or overflow) and re-run.
  "Checks passed" means the numbers are verified and everything fits on one A4 page. Give the user the PDF path.

## Follow-up requests

- New languages, period or topic: re-run `analyze` with the changed flags. Cached days are reused,
  so this is cheap. Say what changed compared with the previous answer.
- "Rank by audience size / by share": `--rank-by avg_monthly_views` or `avg_share_per_million` or `growth_share`.
- "Include bots / all traffic": `--agent all-agents` (default `user` = humans only).
- Custom periods: `--start 2022-01 --end 2025-12`.
- Custom criteria (e.g. "big and growing"): apply them yourself to the table columns and state the rule.

## Limits to mention when relevant
Data starts July 2015. The unit is a language edition, not a country. Many users read English
Wikipedia instead of their local one. For topics with several articles, include the main ones
(`Label=A+B`). See [references/methodology.md](references/methodology.md) for how the metrics are computed.
