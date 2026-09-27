# Interpreting results and writing recommendations

Read this when the summary table is ambiguous, or before writing a recommendation or a PDF note.

## Reading one row

| Column | Meaning | How to use it |
|---|---|---|
| avg views/mo | average monthly views after spike cleaning | audience size in that language; <1,000 = small, noisy |
| growth raw | last 12 mo vs previous 12, as recorded | only to show what spikes did |
| growth cleaned | same, spike days replaced by the typical level | **main growth number** |
| growth share | growth of (topic views / all views of that edition) | topic-specific change, net of Wikipedia-wide trends |
| trend/yr | robust (Sen) yearly rate over the whole window | cross-check for growth cleaned; they should agree in sign |
| months up | same calendar month higher than a year earlier, e.g. 11/12 | consistency you can explain to non-statisticians |
| p | seasonal Mann-Kendall p-value | <0.05 consistent, 0.05–0.2 weak, >0.2 no trend |
| confidence | rule-based grade; reasons/cautions explain it | say why, using its reasons |

## Common patterns → what to say

| Pattern | Say |
|---|---|
| growth cleaned +, share +, p<0.05 | "Interest is growing, beyond Wikipedia's general trend." |
| growth cleaned −, share ≈ 0 | "Views fall at the same rate as the whole wiki, so relative interest is stable. The decline is platform-wide (AI answers, fewer human visits), not about the topic." |
| growth cleaned −, share − | "The topic is losing attention even relative to Wikipedia overall." |
| growth cleaned +, share − | "Views grow but more slowly than the wiki, so relative interest is falling." (rare) |
| raw ≫ cleaned | "The apparent growth comes from spike days (news, virality, bots); the underlying level barely moved." Name the spike date. |
| p > 0.2 | "There is no reliable trend; the changes are within normal fluctuation." Don't call it growth. |
| months-up 6/12 | "Mixed: half the months were up and half down." |
| low volume | "The audience is small (~N views/month), so percentages swing a lot." |
| missing article | "There is no article on this in <lang> Wikipedia. That signals low local coverage and an opportunity, but also that we cannot measure demand there." |

## Comparing languages (localisation questions)

- Use **share per million** and **growth share** for "where is the topic relatively more popular or
  rising". Use **avg views/mo** for "where is the audience big". Raw views across editions are not
  comparable: English Wikipedia has billions of views, Czech a few tens of millions.
- A simple, transparent prioritisation (state it if you use it): prefer languages where growth share is
  above 0 with medium/high confidence **and** volume is at least 1,000/month. Then order by volume.
  If the user has their own criteria, apply those instead and say how.
- Language ≠ market: Spanish covers Spain and Latin America, Portuguese covers Brazil and Portugal, and
  English is read globally. Many people in small-language countries read English Wikipedia.

## Proxies for fuzzy concepts

"Learning English", "healthy sleep" and "personal finance for teens" usually have no exact article. Options:
1. The closest concept article (`English language`, `Sleep hygiene`, `Personal finance`).
2. A sum of several related articles: `--topic "Sleep=Sleep hygiene+Insomnia"`.
3. Several topics side by side (repeat `--topic`), so the user sees which angle moves.
Always name the proxy in the answer and in the PDF notes.

## Recommendation template (≤ 5 bullets, for chat or `--notes`)

- **Answer**: the main conclusion with 1–2 numbers copied from the output.
- **Trust**: the confidence and the key reason or caution.
- **Priority / choice**: which topics or languages to explore next, and why (data-based criterion).
- **Next validation step**: e.g. Google Trends or keyword volumes, app-store search, competitor count,
  a landing-page or ads smoke test, user interviews in that language.
- **Assumption**: which articles were used as proxies, and the period.
