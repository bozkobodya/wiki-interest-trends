// UI strings for charts and the PDF report. Add a language by adding an object with the same keys.
export const STRINGS = {
  en: {
    trend_title: 'Interest over time (spikes removed, 3-month average)',
    share_title: "Share of the language edition's traffic (spikes removed, 3-month average)",
    index_label: 'index, first year = 100',
    growth_title: 'Growth: last 12 months vs previous 12',
    growth_title_short: 'Growth, last 12 vs previous 12 mo',
    growth_xlabel: '% change (bars: views; ◆: share of wiki traffic)',
    volume_title: 'Audience size: average monthly views',
    volume_title_short: 'Average monthly views',
    conf_high: 'high conf.', conf_medium: 'medium conf.', conf_low: 'low conf.',
    report_title: 'Wikipedia interest: {topics}',
    subtitle: '{langs} Wikipedia · {start} – {end} · human (agent=user) page views · generated {date}',
    key_findings: 'Key findings (computed)',
    analyst_note: 'Interpretation & recommendation',
    table_series: 'Series', table_article: 'Article', table_avg: 'Views/mo', table_growth: 'Growth',
    table_share: 'Growth, norm.', table_up: 'Months ↑ YoY', table_p: 'p', table_conf: 'Confidence',
    method: 'Method & limitations',
    method_text:
      'Source: Wikimedia Analytics API (per-article daily page views, agent=user) incl. up to {maxred} redirects per article. ' +
      'Days above 4x the 29-day rolling median were treated as spikes and replaced by it. Growth compares {glabel}; ' +
      "'norm.' divides by total views of the language edition. Consistency: seasonal Mann-Kendall test (each month vs the " +
      'same month a year before). Confidence combines volume, consistency, robustness to spikes, normalisation and period ' +
      'length. Page views measure curiosity, not willingness to pay; a language edition is not a country; many people read ' +
      'English Wikipedia instead of their own. Use as a signal for further research.',
    f_one: '{s}: {g} (last 12 months vs previous 12), {gs} after normalising by wiki traffic; ~{v} views/month; {c} confidence.',
    f_fastest: 'Best dynamics: {s} ({g}, {c} confidence).',
    f_slowest: 'Weakest: {s} ({g}, {c} confidence).',
    f_largest: 'Largest audience: {s} (~{v} views/month); smallest: {s2} (~{v2}).',
    f_consistent: '{k} of {n} series show a statistically consistent trend (p < 0.05).',
    f_wiki: 'Whole-wiki traffic changed {parts} over the same window; normalised growth corrects for this.',
    f_spikes: 'Spike-driven series: {parts} – raw growth differs from cleaned growth.',
    f_missing: 'No article on this topic in: {parts}.',
  },
  uk: {
    trend_title: 'Інтерес у часі (без сплесків, ковзне середнє за 3 міс.)',
    share_title: 'Частка від трафіку мовного розділу (без сплесків, ковзне середнє за 3 міс.)',
    index_label: 'індекс, перший рік = 100',
    growth_title: 'Зміна: останні 12 міс. vs попередні 12',
    growth_title_short: 'Зміна: останні 12 vs попередні 12 міс.',
    growth_xlabel: 'зміна, % (стовпці: перегляди; ◆: частка трафіку вікі)',
    volume_title: 'Розмір аудиторії: середні перегляди на місяць',
    volume_title_short: 'Середні перегляди на місяць',
    conf_high: 'висока довіра', conf_medium: 'середня довіра', conf_low: 'низька довіра',
    report_title: 'Інтерес у Wikipedia: {topics}',
    subtitle: 'Wikipedia: {langs} · {start} – {end} · перегляди людьми (agent=user) · створено {date}',
    key_findings: 'Ключові висновки (обчислені)',
    analyst_note: 'Інтерпретація та рекомендація',
    table_series: 'Ряд', table_article: 'Стаття', table_avg: 'Перегл./міс', table_growth: 'Зміна',
    table_share: 'Зміна, норм.', table_up: 'Міс. ↑ р/р', table_p: 'p', table_conf: 'Довіра',
    method: 'Методика та обмеження',
    method_text:
      'Джерело: Wikimedia Analytics API (щоденні перегляди статей, agent=user), включно з переглядами до {maxred} ' +
      'перенаправлень на статтю. Дні з переглядами понад 4× від 29-денної ковзної медіани вважаються сплесками й ' +
      'замінюються медіаною. Зміна: {glabel}; «норм.» — поділено на загальні перегляди мовного розділу. Послідовність: ' +
      'сезонний тест Манна-Кендалла (кожен місяць vs той самий місяць роком раніше). Рівень довіри враховує обсяг, ' +
      'послідовність, стійкість до сплесків, нормалізацію та довжину періоду. Перегляди показують цікавість, а не готовність ' +
      'платити; мовний розділ ≠ країна; частина аудиторії читає англійську Wikipedia. Це сигнал для подальшої перевірки, ' +
      'а не остаточний доказ.',
    f_one: '{s}: {g} (останні 12 міс. vs попередні 12), {gs} з поправкою на трафік вікі; ~{v} перегл./міс; довіра {c}.',
    f_fastest: 'Найкраща динаміка: {s} ({g}, довіра {c}).',
    f_slowest: 'Найслабше: {s} ({g}, довіра {c}).',
    f_largest: 'Найбільша аудиторія: {s} (~{v} перегл./міс); найменша: {s2} (~{v2}).',
    f_consistent: '{k} з {n} рядів мають статистично послідовний тренд (p < 0,05).',
    f_wiki: 'Загальний трафік вікі за той самий період змінився: {parts}; нормалізована зміна це враховує.',
    f_spikes: 'Залежать від сплесків: {parts} — «сира» зміна відрізняється від очищеної.',
    f_missing: 'Немає статті на цю тему в: {parts}.',
  },
};

export const CONF_WORD = {
  en: { high: 'high', medium: 'medium', low: 'low' },
  uk: { high: 'висока', medium: 'середня', low: 'низька' },
};

export const t = (key, ui = 'en', vars = {}) =>
  ((STRINGS[ui] || STRINGS.en)[key] ?? STRINGS.en[key]).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
