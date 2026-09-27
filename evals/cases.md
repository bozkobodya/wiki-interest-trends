# Evaluation cases

End-to-end scenarios to run with a cheap model (e.g. Claude Haiku 4.5) after every change to
SKILL.md or the CLI. Give the agent only the skill and the prompt, then grade the transcript
against the checklist. Results of the last run are in `evals/results.md`.

## Checklist applied to every case

- [ ] Used `node scripts/wt.js` (no hand-written API or statistics code).
- [ ] Correct language codes and period.
- [ ] Every number in the answer appears in the tool output (`wt check` passes).
- [ ] Distinguishes topic change from Wikipedia-wide change (growth share).
- [ ] States confidence and at least one reason or caution.
- [ ] States assumptions and proxies (articles used, language ≠ country).
- [ ] Answers in the user's language; gives a next validation step.
- [ ] If a PDF was requested: `report` ran without WARNINGS and the path was given.

## Cases

1. **Two-language comparison** (from the brief)
   "Порівняй зростання інтересу до інтервального голодування в польськомовній та чеськомовній Wikipedia за останні два роки."
   Expected: `--topic "Intermittent fasting" --langs pl,cs --months 24`. Polish has **no linked
   article**: the agent must search pl, find no dedicated article, and report that instead of silently
   using a proxy. Czech: low volume, declining.

2. **Single-topic trust question** (from the brief)
   "Ми думаємо додати курс з астрономії до освітнього застосунку. Чи зростає інтерес до цієї теми в україномовній Wikipedia, і наскільки цьому зростанню можна довіряти?"
   Expected: `--topic Astronomy --langs uk`, ideally `--months 36`. The answer must say interest is
   **declining** even after normalisation, not "growing", and cite p or months-up.

3. **Multi-language prioritisation + PDF** (from the brief)
   "Ми створюємо застосунок для вивчення мов. Порівняй інтерес до вивчення англійської в uk, pl, tr, vi, es, de та підготуй короткий звіт: які аудиторії варто дослідити наступними й чому?"
   Expected: a proxy article (`English language`, possibly plus `English as a second or foreign language`),
   named as a proxy; separates tr/vi/de (decline = whole-wiki decline) from uk/es (losing share);
   PDF with `--ui-lang uk`, no warnings.

4. **Follow-up changing assumptions**
   After case 3: "А якщо рахувати за три роки і додати португальську?"
   Expected: re-run with `--months 36` and `pt` added (cache reused); explicitly states what changed.

5. **Spike trap**
   "Did interest in the Titan submersible grow in English Wikipedia?" (`Titan submersible implosion`,
   `--start 2023-01 --end 2024-12`). Expected: the agent flags spike-driven raw growth and doesn't
   present it as a durable trend.

6. **Non-English topic input**
   "Чи росте інтерес до «Щедрик» в українській і польській Вікіпедії?" Expected: `--source-lang uk`
   or `search`, correct resolution through Wikidata.
