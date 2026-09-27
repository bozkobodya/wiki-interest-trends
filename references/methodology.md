# Methodology

How `wt.js analyze` turns page views into metrics, and why. Code: `scripts/lib/analysis.js`.

## Data

- **Wikimedia Analytics API**, `per-article/{lang}.wikipedia/all-access/{agent}/{title}/daily`, plus
  `aggregate/{lang}.wikipedia/all-access/{agent}/daily` for the whole edition (normalisation).
  Default `agent=user`: humans as classified by Wikimedia (spiders and "automated" traffic are excluded).
  Data is available from 2015-07-01.
- **Title resolution**: MediaWiki API (follows redirects, gets the Wikidata id), then Wikidata sitelinks
  map the concept to its article in every requested language. This avoids translating titles by hand.
- **Redirects**: page views are counted per exact title. If an article was renamed, its history is
  split between the old title (now a redirect) and the new one. The tool adds the views of up to 40
  redirects per article and flags months where redirects dominate.
- **Period**: whole months only, ending with the last complete month whose data is published.

## Cleaning spikes

For each day, the 29-day rolling median is the "typical" level. A day counts as a **spike** when
views > 4× typical and at least 50 views above it. It is replaced by the typical value. Spikes are real
events (news, a Google Doodle, a Main Page feature, a viral post, undetected bots), but they don't
indicate lasting demand. Both raw and cleaned growth are reported. A large gap between them is itself
flagged.

## Growth

- **Growth (cleaned)**: sum of the last 12 months / sum of the previous 12 − 1. Comparing full years
  cancels seasonality (school years, New Year resolutions, summer). With fewer than 24 months, the tool
  compares the last half of the window with the first half and warns that seasonality is not separated.
- **Growth (share)**: the same, computed on topic views per 1M views of the whole language edition.
  Wikipedia's human traffic changes for reasons unrelated to any topic: search engines and AI
  assistants answering directly, app usage, and Wikimedia's bot-detection updates reclassifying traffic.
  Normalisation separates "the topic changed" from "Wikipedia changed".
- **Trend/yr**: seasonal Sen slope of log monthly views: the median of same-month year-over-year log
  changes. It is robust to outliers and serves as a cross-check.

## Consistency test

The **seasonal Mann-Kendall test** compares each calendar month only with the same month in other years,
counting ups and downs. It gives a p-value for "there is no monotonic trend". "Months up 11/12" is the
plain-language version. Caveat: it assumes independent years, and short windows (2 years = 12 pairs)
have limited power, so a p just above 0.05 with 9/12 months up is "weak evidence", not "no change".

## Confidence grade

Points: volume ≥ 1,000/month (+1); p < 0.05 (+2) or p < 0.2 (+1); raw and cleaned growth agree (+1);
direction survives normalisation (+1); ≥ 24 months (+1). Score 5+ = high, 3–4 = medium, otherwise low.
Caps: volume < 150/month or < 12 months → low; volume < 1,000 → at most medium; direction changes
after normalisation → at most medium; change depends on spikes (raw vs cleaned growth differ by > 15
points, or > 20% of views on spike days) → at most medium; a rise or fall with p ≥ 0.2, or any month
with zero views (article new or renamed), → low. The reasons and cautions lists explain every grade.

## Known limitations

- Page views measure attention and curiosity, not purchase intent or willingness to pay.
- A language edition is not a country. English Wikipedia absorbs readers from everywhere.
- One article only approximates a topic. Related articles, and interest phrased differently, are missed
  unless added with `Label=A+B`.
- Bot classification is imperfect. Spike cleaning removes short bursts, but not a steady bot load.
- Results describe the past. No forecasting is done.
