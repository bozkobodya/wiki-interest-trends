// Checks agent-written text (a chat answer or PDF notes) against a run: numbers anywhere in the text,
// and per sentence/table row the claims about the language editions it names (p-values, confidence
// words, growth/decline words, months-up fractions), plus country names used instead of languages.
// No dependencies, so `check` works before pdfkit is installed.

const ok = (run) => run.series.filter((s) => !s.missing);
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
const L = '\\p{L}';
const NOT_AFTER = `(?<![${L}])`, NOT_BEFORE = `(?![${L}])`;

// language code → [English name, Ukrainian stem]; used to find which series a sentence talks about
const LANGS = {
  uk: ['Ukrainian', 'україн(?:ськ|омовн)'], pl: ['Polish', 'польськ'], cs: ['Czech', 'чеськ'], sk: ['Slovak', 'словацьк'],
  de: ['German', 'німецьк'], es: ['Spanish', 'іспанськ'], tr: ['Turkish', 'турецьк'], vi: ['Vietnamese', "в['ʼ’]?єтнамськ"],
  pt: ['Portuguese', 'португальськ'], fr: ['French', 'французьк'], it: ['Italian', 'італійськ'], ro: ['Romanian', 'румунськ'],
  ja: ['Japanese', 'японськ'], ko: ['Korean', 'корейськ'], id: ['Indonesian', 'індонезійськ'], en: ['English', 'англійськ'],
  ru: ['Russian', 'російськ'], nl: ['Dutch', 'нідерландськ'], sv: ['Swedish', 'шведськ'], hu: ['Hungarian', 'угорськ'],
  ar: ['Arabic', 'арабськ'], zh: ['Chinese', 'китайськ'], hi: ['Hindi', 'гінді'],
};
// two-letter codes that are also common English words: only recognised as `(it)`, `it.wikipedia`, etc.
const WORDY = new Set(['it', 'id', 'is', 'no', 'be', 'am', 'as', 'an', 'or', 'to', 'he', 'me', 'my', 'so', 'us', 'we', 'do', 'go', 'in', 'of', 'on', 'by', 'at', 'if', 'hi']);

// names match in any case; bare codes only in lowercase ("UK" is a country, "uk" the edition)
const langRes = (code) => {
  const [en, uk] = LANGS[code] || [];
  const names = [en && `${NOT_AFTER}${en}${NOT_BEFORE}`, uk && `${NOT_AFTER}${uk}`].filter(Boolean);
  const codeRe = WORDY.has(code) ? `\\(${code}\\)|${NOT_AFTER}${code}\\.wiki` : `${NOT_AFTER}${code}(?![\\p{L}\\d])`;
  return [names.length && new RegExp(names.join('|'), 'iu'), new RegExp(codeRe, 'u')].filter(Boolean);
};
const mentionedLangs = (seg, codes) => new Set(codes.filter((c) => langRes(c).some((re) => re.test(seg))));

const COUNTRIES = new RegExp([
  'Україн(?:а|и|і|у|ою)', 'Польщ(?:а|і|у|ею)', 'Німеччин(?:а|и|і|у|ою)', 'Іспані(?:я|ї|ю|єю)', 'Туреччин(?:а|и|і|у|ою)',
  "В['ʼ’]?єтнам(?:у|і|ом)?", 'Чехі(?:я|ї|ю|єю)', 'Словаччин(?:а|и|і|у|ою)', 'Португалі(?:я|ї|ю|єю)', 'Бразилі(?:я|ї|ю|єю)',
  'Франці(?:я|ї|ю|єю)', 'Італі(?:я|ї|ю|єю)', 'Румуні(?:я|ї|ю|єю)', 'Японі(?:я|ї|ю|єю)', 'Коре(?:я|ї|ю|єю)',
  'Індонезі(?:я|ї|ю|єю)', 'Мексик(?:а|и|і|у|ою)', 'Росі(?:я|ї|ю|єю)', 'Угорщин(?:а|и|і|у|ою)', 'Швеці(?:я|ї|ю|єю)',
  'Germany', 'Poland', 'Ukraine', 'Spain', 'Turkey', 'Türkiye', 'Vietnam', 'Viet Nam', 'Czechia', 'Czech Republic',
  'Slovakia', 'Portugal', 'Brazil', 'France', 'Italy', 'Romania', 'Japan', 'Korea', 'Indonesia', 'Mexico', 'Russia',
  'Hungary', 'Sweden',
].map((c) => `${NOT_AFTER}${c}${NOT_BEFORE}`).join('|'), 'gu');

const CONF_LEVEL = { висок: 'high', середн: 'medium', низьк: 'low', слабк: 'low', high: 'high', medium: 'medium', low: 'low' };
const CONF_NOUN = '(?:довір|впевнен|надійн|достовірн)';
const CONF_ADJ = '(висок|середн|низьк|слабк)';
const CONF_RES = [
  new RegExp(`${NOT_AFTER}(high|medium|low)(?:\\s+|-)confidence`, 'giu'),
  new RegExp(`confidence(?:\\s+is|:)?\\s+(high|medium|low)${NOT_BEFORE}`, 'giu'),
  new RegExp(`${NOT_AFTER}(HIGH|MEDIUM|LOW)${NOT_BEFORE}`, 'gu'),
  new RegExp(`${NOT_AFTER}${CONF_ADJ}\\p{L}*\\s+(?:\\p{L}+\\s+)?${CONF_NOUN}`, 'giu'),
  new RegExp(`${CONF_NOUN}\\p{L}*\\s*[:—–-]?\\s*${CONF_ADJ}`, 'giu'),
  new RegExp(`\\|\\s*${CONF_ADJ}\\p{L}*\\s*(?=\\|)`, 'giu'),
];

const UP = new RegExp(`${NOT_AFTER}(?:grow|grows|growing|grew|rising|rises|rose|increas(?:e|es|ing|ed)|` +
  'зростає|зростають|зростаюч\\p{L}*|р[ао]стуч\\p{L}*|растущ\\p{L}*|росте|ростуть|зріс|зросл[аои]|збільшу(?:ється|ються)|збільшил\\p{L}*)' + NOT_BEFORE, 'giu');
const DOWN = new RegExp(`${NOT_AFTER}(?:declin(?:e|es|ing|ed)|falls?|falling|fell|drop(?:s|ping|ped)?|decreas(?:e|es|ing|ed)|` +
  'shrink(?:s|ing)?|падає|падають|знижу(?:ється|ються)|скорочу(?:ється|ються)|зменшу(?:ється|ються)|впа(?:в|ла|ло|ли)|знизил\\p{L}*)' +
  NOT_BEFORE, 'giu');
const NEGATED = /(?:^|[^\p{L}])(?:не|ні|not|no|never|n't)\s+(?:\p{L}+\s+)?$/iu;

const P_RE = /(?<![\p{L}])p\s*(<=|>=|=|<|≤|>|≥|≈|~)\s*(\d(?:[.,]\d+)?)/giu;
const FRAC_RE = /(?<![\d/.,])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/g;

/** Split into sentences / table rows; headings pass the languages they name on to the lines below. */
function segments(text) {
  const out = [];
  let context = null;
  for (const line of text.split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    const heading = /^#|^\*\*|:$/.test(t); // '## vi', '**1. vi** — first', 'vi:'
    for (const s of t.startsWith('|') ? [t] : t.split(/(?<=[.!?;])\s+/)) out.push({ text: s, heading, context });
    if (heading) context = t;
  }
  return out;
}

function numberWarnings(text, run) {
  const PCT_KEYS = ['growth_raw', 'growth_clean', 'growth_share', 'project_growth', 'trend_per_year', 'long_run_cagr',
    'spike_share', 'redirect_share'];
  const pcts = new Set(), counts = [];
  for (const s of ok(run)) {
    for (const k of PCT_KEYS) if (s[k] !== null && s[k] !== undefined) pcts.add(Math.abs(Math.round(s[k] * 100)));
    counts.push(s.avg_monthly_views, s.total_views, ...s.monthly_raw, ...s.monthly_clean, ...s.top_spikes.map((x) => x.views));
    if (s.month_pairs) pcts.add(Math.round((100 * s.months_up) / s.month_pairs));
  }
  const w = [];
  for (const m of text.matchAll(/([+\-−]?\d+(?:[.,]\d+)?)\s?%/g)) {
    const v = Math.abs(parseFloat(m[1].replace('−', '-').replace(',', '.')));
    if (![...pcts].some((p) => Math.abs(v - p) <= 1.5)) w.push(`'${m[0]}' does not match any computed percentage`);
  }
  for (const m of text.matchAll(/(?<![\d.,])([1-9]\d{0,2}(?:[ ,  ]\d{3})+|\d{4,})(?![\d%]|[.,]\d)/g)) {
    const v = Number(m[1].replace(/[ ,  ]/g, ''));
    if (v >= 1990 && v <= 2100) continue; // years
    if (!counts.some((c) => Math.abs(v - c) <= Math.max(0.06 * c, 5)))
      w.push(`'${m[0]}' does not match any computed view count (±6%)`);
  }
  // "95+ млн", "1.2 million": only fine if it is a view count from the run
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*\+?\s*(млн|млрд|mln|million|billion|bn)(?![\p{L}])/giu)) {
    const v = parseFloat(m[1].replace(',', '.')) * (/млрд|billion|bn/i.test(m[2]) ? 1e9 : 1e6);
    if (!counts.some((c) => Math.abs(v - c) <= 0.06 * c))
      w.push(`'${m[0]}' is not in the run data (population, market size and other outside facts are not allowed)`);
  }
  return w;
}

function pHolds(op, v, p, decimals) {
  if (op === '=' || op === '≈' || op === '~') return Math.abs(p - v) <= 0.5 * 10 ** -decimals + 1e-9;
  if (op === '<' || op === '≤' || op === '<=') return p <= v;
  return p >= v;
}

/** Warnings for statements in `text` that the run does not back up. Empty array = everything checks out. */
export function checkClaims(text, run) {
  const S = ok(run);
  const warnings = numberWarnings(text, run);
  const runCodes = [...new Set(S.map((s) => s.lang).filter(Boolean))];
  const topics = [...new Set(S.map((s) => s.topic).filter(Boolean))];
  const name = (s) => (topics.length > 1 ? `${s.topic}/${s.lang}` : s.lang);

  for (const seg of segments(text)) {
    let langs = mentionedLangs(seg.text, runCodes);
    if (!langs.size && seg.context && !seg.heading) langs = mentionedLangs(seg.context, runCodes);
    let about = S.filter((s) => langs.has(s.lang));
    const named = topics.filter((t) => seg.text.toLowerCase().includes(t.toLowerCase()));
    if (named.length && about.length) about = about.filter((s) => named.includes(s.topic));
    const implicit = !about.length && S.length === 1;
    if (implicit) about = S;

    // p-values
    for (const m of seg.text.matchAll(P_RE)) {
      const v = parseFloat(m[2].replace(',', '.')), dec = (m[2].split(/[.,]/)[1] || '').length;
      if (about.length) {
        for (const s of about)
          if (!pHolds(m[1], v, s.p_value, dec)) warnings.push(`'${m[0]}': ${name(s)} has p-value ${s.p_value.toFixed(3)}`);
      } else if (['=', '≈', '~'].includes(m[1]) && !S.some((s) => pHolds(m[1], v, s.p_value, dec)))
        warnings.push(`'${m[0]}' does not match any computed p-value`);
    }
    if (!about.length) {
      if (!mentionedLangs(seg.text, Object.keys(LANGS)).size)
        for (const m of seg.text.matchAll(COUNTRIES))
          warnings.push(`'${m[0]}' is a country: name the language edition instead (e.g. "німецька (de)"); a language edition is not a country`);
      continue;
    }

    // confidence words
    const levels = new Map();
    for (const re of CONF_RES)
      for (const m of seg.text.matchAll(re)) levels.set(CONF_LEVEL[m[1].toLowerCase()], m[0].trim());
    for (const [lvl, phrase] of levels) {
      const bad = levels.size === 1 ? about.filter((s) => s.confidence !== lvl) : about.some((s) => s.confidence === lvl) ? [] : about;
      for (const s of bad) warnings.push(`'${phrase}': the tool grades ${name(s)} confidence as ${s.confidence}`);
    }

    // growth / decline words
    for (const [re, dir, word] of [[UP, 'up', 'rising'], [DOWN, 'down', 'falling']])
      for (const m of seg.text.matchAll(re)) {
        if (NEGATED.test(seg.text.slice(0, m.index))) continue;
        if (about.some((s) => s.direction === dir || s.direction_share === dir)) continue;
        const d = about.map((s) => `${name(s)} ${pct(s.growth_clean)}, share ${pct(s.growth_share)}`).join('; ');
        warnings.push(`'${m[0]}': direction contradicts the data, ${d} is not ${word} (within ±5% = stable)`);
      }

    // months-up fractions
    const pairs = new Set(S.map((s) => s.month_pairs));
    for (const m of seg.text.matchAll(FRAC_RE)) {
      const [up, n] = [Number(m[1]), Number(m[2])];
      if (!pairs.has(n)) continue;
      for (const s of about)
        if (s.months_up !== up || s.month_pairs !== n) warnings.push(`'${m[0]}': ${name(s)} has ${s.months_up}/${s.month_pairs} months up`);
    }
  }
  return [...new Set(warnings)];
}
