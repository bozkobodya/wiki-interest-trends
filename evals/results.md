# Evaluation results (Claude Haiku 4.5)

Each run: a fresh Haiku 4.5 agent received only the skill path and the user prompt (no hints). The
transcript and final answer were graded against the checklist in `cases.md`.

## Round 1 (2026-09-27)

| Case | Tools/params | Numbers correct | Interpretation | Problems found |
|---|---|---|---|---|
| 2 Astronomy uk | ✅ `--months 36`, extra languages for context, PDF, `check` | ✅ | ✅ declining, cites p and months-up | Wrote "−60% over 36 months" (it is last 12 vs previous 12); "можна довіряти повністю" (overclaiming) |
| 3 English, 6 langs + PDF | ✅ resolve → analyze → report (fixed overflow warning itself) | ⚠️ invented "500+ million people" | ❌ **ranked the fastest-declining audiences (uk, es) as top priorities**, equating "high confidence" with "attractive"; claimed p=0.000 for all | no `check` on the chat answer |
| 1 Fasting pl/cs | ✅ found that pl has no article, searched 4 times | ✅ | ⚠️ used "Głodówka lecznicza" (therapeutic fasting) as the Polish value and compared it like-for-like with Czech (disclosed, but misleading) | – |

Fixes made after round 1:
- Code: the summary now has a **Suggested priority** section (tiers by relative-interest growth, then
  audience size, with the rule spelled out: "confidence ≠ attractiveness").
- Code: the table header says growth columns *always* compare the last 12 months with the previous 12.
- Code: an override for a language with no Wikidata-linked article is marked `(proxy)`, gets a PROXY
  caution, and its confidence is capped.
- SKILL.md: explicit rules for the growth window, prioritisation, proxies, no outside facts (label
  hypotheses as such), no "fully reliable", and **always** run `check` on the chat answer.

## Round 2 (after the fixes above)

| Case | Result |
|---|---|
| 1 Fasting pl/cs + follow-up (add sk, uk; 3 years) | ✅ pl and sk reported as "no article" (no proxy); follow-up re-run with `--months 36`; states growth = last 12 vs previous 12; mentions the whole-wiki decline; `check` run on both answers |
| 3 English, 6 langs + PDF | ✅ priorities now follow relative interest (de, vi first; uk "avoid for now"); outside causes labelled as hypotheses; `check` run. ⚠️ needed 3 `report` attempts to fit the page; added a "Country" column; one wrong p-value claim ("p<0.05 for de") that `check` cannot catch |

Fixes made after round 2:
- The overflow warning now says how many characters to cut.
- Run directories are resolved to absolute paths (`WIKITREND_RUNS` overrides the base).
- SKILL.md: run from the user's cwd; never map a language edition to a single country.

## Round 3 (2026-09-27): all six cases after the cross-platform entry point and code fixes

Changes before this round: the CLI is run as `node scripts/wt.js` (no bash, no executable bit needed,
works on Windows); confidence is capped at **low** for a rise/fall with p ≥ 0.2 or months with zero
views, and at **medium** when the change depends on spikes; `analyze` stops with an error when no
article exists in any requested language; `search` ranks title and exact-phrase matches first and says
when no title matched.

First pass (fresh Haiku 4.5 agent per case, only the skill path and the prompt):

| Case | Tools/params | Numbers | Interpretation | Problems found |
|---|---|---|---|---|
| 1 Fasting pl/cs | ✅ analyze → search pl → check | ✅ | ✅ pl "no article" (no proxy), cs −44%, low-volume caution | minor wording only |
| 2 Astronomy uk | ✅ `--months 36`, extra langs for context, check | ✅ | ✅ declining, not growing | ❌ "uk Wikipedia lost 25% **over 3 years**" (it is last 12 vs previous 12); "you can trust this trend" |
| 3 English, 6 langs | ✅ resolve → analyze → check | ✅ | ⚠️ picked de, vi first (matches tiers) but put es in its own tier 2 | ❌ **no PDF** although a report was asked for; ❌ languages labelled as countries; ❌ "users migrate to apps" stated as fact; re-graded de as "weak" |
| 4 Follow-up: 36 mo + pt | ✅ re-ran with `--months 36` and `pt`, cache reused, check | ✅ | ✅ says what changed | same country labels / own tiers as case 3 |
| 5 Titan (spike trap) | ✅ resolve → analyze `--start 2023-01 --end 2024-12` → check | ✅ | ✅ "no growth, low confidence, p=1.00, article may be new" | used `Titan (submersible)` rather than the implosion article (valid choice). Before the confidence cap the tool said "probably declining, medium" here |
| 6 «Щедрик» uk/pl | ✅ resolve (Wikidata) → search pl → analyze → check | ✅ | ✅ uk −53% medium, pl "no article" | Christmas-effect hypothesis labelled as such (seasonality is already controlled) |

Fixes after the first pass:
- Code: the whole-wiki traffic heading now reads "last 12 mo vs previous 12 mo (NOT the whole period)".
- SKILL.md: a report/звіт request always builds the PDF in addition to the chat answer; rows are named by
  language; confidence words are copied, not re-graded; a "before sending" re-read list (no countries,
  no causes as fact, no claims about unanalysed languages, no "over N years", priorities follow
  `Suggested priority` unless a rule is stated); all 5 answer parts are required also with a PDF.

Re-runs with the updated SKILL.md:

| Case | Result |
|---|---|
| 2 Astronomy uk | ✅ "last 12 vs previous 12" stated correctly; whole-wiki −25% no longer framed as 3 years; no "fully reliable"; PDF built. ⚠️ suggests Yandex as a data source (outside fact) |
| 3 English, 6 langs (2nd try) | ✅ PDF (checks passed), languages not countries, tiers followed, check OK. ❌ dropped table and assumptions; suggested ja/ko/id as "growing" languages (copied from SKILL.md's code list) → added the two rules above |
| 3 English, 6 langs (3rd try) | ✅ all 5 parts, table by language with the tool's confidence words, proxy article stated, de → vi → tr priority = tier B, PDF "Checks passed", check OK. ⚠️ still adds country facts in the rationale ("high mobile penetration", "young population") and calls vi +2% "slightly growing" (tool: stable) |

## Claim checker extended (after round 3)

`check` (and the PDF notes check) now verifies per sentence / table row the language editions it names:
p-values (`p=`, `p<`), months-up fractions, confidence words (en/uk, table cells), growing/falling
words (negation-aware, ±5% = stable), and flags country names used instead of a language edition.
Tested on the real Haiku answers above:

| Answer | Result |
|---|---|
| Round-3 case 3, first pass (country table) | ❌ flags all 6 countries |
| Round-3 case 3, 3rd try | ❌ flags "зростає"/"збільшується" for vi +2% and tr +1% share (tool: stable) |
| Case 1, re-run case 2, case 6 | ✅ OK (after fixing a false positive: decimal comma in `p = 0,002`) |

Round 4 (fresh Haiku 4.5, case 3, with the extended checker): all 5 parts, languages not countries,
tiers followed, PDF built. But Haiku ran `check` on a different English draft, not on the Ukrainian
answer it sent, and built the PDF with `--ui-lang en`. Its real answer contained "95+ млн людей"
(population) and "растучий попит" for vi (+2% share = stable). Fixes: `check` now flags "N млн /
million / billion" numbers that aren't view counts, recognises misspelled growth words, and applies
a bold heading line's language to the bullets under it; SKILL.md says to check the exact final text
(same language, same wording). Re-checking the real round-4 answer now flags all three statements;
the clean answers (case 1, re-run case 2, case 6) still pass.

Known gaps: `check` cannot catch outside facts phrased generically ("the country has high mobile
penetration", "young population"); that stays a SKILL.md rule. A wrong confidence word on a line that
names a country instead of a language is only caught after the country is replaced (next check).
