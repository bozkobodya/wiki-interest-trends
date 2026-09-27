// Statistics that decide whether interest in a topic is really changing.
// Pure functions (no network), unit-tested with synthetic data in tests/.
//
// * spike cleaning on DAILY data: days far above the rolling median (news, bots, Main Page features)
//   are replaced by that median, so one event cannot fake a trend;
// * growth = last 12 months vs previous 12 (removes seasonality);
// * consistency = seasonal Mann-Kendall test (each calendar month vs the same month in other years);
// * normalisation by the whole language edition's traffic (Wikipedia-wide traffic itself changes);
// * an explicit rule-based confidence grade with human-readable reasons.
// Rationale: references/methodology.md

export const SPIKE_FACTOR = 4; // anomalous day: > SPIKE_FACTOR x rolling median ...
export const SPIKE_MIN_EXCESS = 50; // ... and above it by at least this many views
export const LOW_VOLUME = 1000; // avg monthly views below which % changes are noisy
export const TINY_VOLUME = 150;
export const FLAT_BAND = 0.05; // |growth| < 5% = flat

const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
const round = (v, nd = 4) => (v === null || v === undefined || Number.isNaN(v) ? null : +v.toFixed(nd));

export const toArray = (daily, dayList) => dayList.map((d) => daily[d] || 0);

export function monthlySum(values, dayList, months) {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = new Array(months.length).fill(0);
  values.forEach((v, i) => (out[idx.get(dayList[i].slice(0, 7))] += v));
  return out;
}

// ---------------------------------------------------------------------------
// Spikes
// ---------------------------------------------------------------------------
export function rollingMedian(x, window = 29) {
  const half = window >> 1;
  const n = x.length;
  return x.map((_, i) => {
    const win = [];
    for (let k = i - half; k <= i + half; k++) win.push(x[Math.min(n - 1, Math.max(0, k))]); // edge padding
    return median(win);
  });
}

/** Replace anomalous days with the rolling median. Returns {clean, spikes}. */
export function cleanSpikes(x, dayList) {
  if (x.length < 15) return { clean: [...x], spikes: [] };
  const med = rollingMedian(x);
  const spikes = [];
  const clean = x.map((v, i) => {
    if (v > SPIKE_FACTOR * Math.max(med[i], 1) && v - med[i] > SPIKE_MIN_EXCESS) {
      spikes.push({ day: dayList[i], views: v, typical: Math.round(med[i]), x: round(v / Math.max(med[i], 1), 1) });
      return med[i];
    }
    return v;
  });
  spikes.sort((a, b) => b.views - b.typical - (a.views - a.typical));
  return { clean, spikes };
}

// ---------------------------------------------------------------------------
// Trend statistics
// ---------------------------------------------------------------------------
// Two-sided normal tail via erfc (Numerical Recipes approximation, |error| < 1.2e-7).
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const pTwoSided = (z) => erfc(Math.abs(z) / Math.SQRT2);

/** Plain Mann-Kendall: {s, p}. */
export function mannKendall(x) {
  const n = x.length;
  if (n < 4) return { s: 0, p: 1 };
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += sign(x[j] - x[i]);
  const v = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = s ? (s - sign(s)) / Math.sqrt(v) : 0;
  return { s, p: pTwoSided(z) };
}

/**
 * Seasonal Mann-Kendall (Hirsch & Slack, no autocorrelation correction).
 * Returns {s, p, up, pairs}: up/pairs count same-calendar-month comparisons that went up.
 */
export function seasonalMannKendall(x, period = 12) {
  let s = 0, v = 0, up = 0, pairs = 0;
  for (let k = 0; k < period; k++) {
    const xs = x.filter((_, i) => i % period === k);
    const n = xs.length;
    if (n < 2) continue;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 1; j < n; j++) {
        const d = sign(xs[j] - xs[i]);
        s += d;
        pairs++;
        if (d > 0) up++;
      }
    v += (n * (n - 1) * (2 * n + 5)) / 18;
  }
  if (!v) return { s: 0, p: 1, up: 0, pairs: 0 };
  const z = s ? (s - sign(s)) / Math.sqrt(v) : 0;
  return { s, p: pTwoSided(z), up, pairs };
}

/**
 * Robust annualised growth (Sen slope of log values), e.g. 0.12 = +12%/year.
 * With >= 2 years: seasonal Sen slope (same-month differences); else plain Sen slope x 12.
 */
export function annualTrend(x, period = 12) {
  const lx = x.map((v) => Math.log(Math.max(v, 1)));
  const slopes = [];
  let perYear = 1;
  if (x.length >= 2 * period) {
    for (let k = 0; k < period; k++) {
      const xs = lx.filter((_, i) => i % period === k);
      for (let i = 0; i < xs.length - 1; i++) for (let j = i + 1; j < xs.length; j++) slopes.push((xs[j] - xs[i]) / (j - i));
    }
  } else {
    for (let i = 0; i < lx.length - 1; i++) for (let j = i + 1; j < lx.length; j++) slopes.push((lx[j] - lx[i]) / (j - i));
    perYear = period;
  }
  return slopes.length ? Math.exp(median(slopes) * perYear) - 1 : null;
}

/** Last 12 months vs previous 12 (or 2nd half vs 1st half when shorter). */
export function periodGrowth(x) {
  const n = x.length;
  let a, b, label;
  if (n >= 24) {
    [a, b, label] = [sum(x.slice(-24, -12)), sum(x.slice(-12)), 'last 12 mo vs previous 12 mo'];
  } else if (n >= 4) {
    const h = n >> 1;
    [a, b, label] = [sum(x.slice(n - 2 * h, n - h)), sum(x.slice(-h)), `last ${h} mo vs previous ${h} mo`];
  } else return { g: null, label: 'too short' };
  return { g: a > 0 ? b / a - 1 : null, label };
}

/** Yearly growth rate between the first and last 12 months (windows >= 36 months). */
export function longRunCagr(x) {
  if (x.length < 36 || sum(x.slice(0, 12)) <= 0) return null;
  const years = (x.length - 12) / 12;
  return (sum(x.slice(-12)) / sum(x.slice(0, 12))) ** (1 / years) - 1;
}

// ---------------------------------------------------------------------------
// Per-series analysis
// ---------------------------------------------------------------------------
export function direction(g) {
  if (g === null || g === undefined) return 'unknown';
  return g > FLAT_BAND ? 'up' : g < -FLAT_BAND ? 'down' : 'flat';
}

export function analyseSeries(dailyMain, dailyRedirects, dailyTotal, dayList, months) {
  const raw = dailyMain.map((v, i) => v + dailyRedirects[i]);
  const { clean, spikes } = cleanSpikes(raw, dayList);

  const rawM = monthlySum(raw, dayList, months);
  const cleanM = monthlySum(clean, dayList, months);
  const totalM = monthlySum(dailyTotal, dayList, months);
  const redirectM = monthlySum(dailyRedirects, dayList, months);
  const shareM = cleanM.map((v, i) => (totalM[i] > 0 ? (v / totalM[i]) * 1e6 : 0)); // per 1M project views

  const gRaw = periodGrowth(rawM);
  const gClean = periodGrowth(cleanM).g;
  const gShare = periodGrowth(shareM).g;
  const gTotal = periodGrowth(totalM).g;

  let test, p, pShare, up = null, pairs = null, upS = null, pairsS = null;
  if (months.length >= 24) {
    ({ p, up, pairs } = seasonalMannKendall(cleanM));
    ({ p: pShare, up: upS, pairs: pairsS } = seasonalMannKendall(shareM));
    test = 'seasonal Mann-Kendall';
  } else {
    p = mannKendall(cleanM).p;
    pShare = mannKendall(shareM).p;
    test = 'Mann-Kendall (no seasonal adjustment: < 24 months)';
  }

  const totalViews = sum(raw);
  const spikeViews = totalViews - sum(clean);
  const redirectTotal = sum(dailyRedirects);
  const r = {
    months,
    monthly_raw: rawM.map(Math.round),
    monthly_clean: cleanM.map(Math.round),
    monthly_share_per_million: shareM.map((v) => round(v, 3)),
    project_monthly_total: totalM.map(Math.round),
    total_views: Math.round(totalViews),
    avg_monthly_views: Math.round(mean(cleanM)),
    avg_share_per_million: round(mean(shareM), 3),
    growth_label: gRaw.label,
    growth_raw: round(gRaw.g),
    growth_clean: round(gClean),
    growth_share: round(gShare),
    project_growth: round(gTotal),
    trend_per_year: round(annualTrend(cleanM)),
    long_run_cagr: round(longRunCagr(cleanM)),
    trend_test: test,
    p_value: round(p),
    p_value_share: round(pShare),
    months_up: up,
    month_pairs: pairs,
    months_up_share: upS,
    month_pairs_share: pairsS,
    spike_share: totalViews ? round(spikeViews / totalViews, 3) : 0,
    top_spikes: spikes.slice(0, 5),
    n_spike_days: spikes.length,
    redirect_share: totalViews ? round(redirectTotal / totalViews, 3) : 0,
    // months where redirects carry most views usually mean the article was renamed
    rename_months: months.filter((_, i) => rawM[i] > 0 && redirectM[i] / rawM[i] > 0.5),
    zero_months: rawM.filter((v) => v === 0).length,
  };
  r.direction = direction(r.growth_clean);
  r.direction_share = direction(r.growth_share);
  Object.assign(r, confidence(r, months.length));
  r.verdict = verdict(r);
  return r;
}

const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** Rule-based grade of how much the growth/decline claim can be trusted. */
export function confidence(r, nMonths) {
  let score = 0;
  const reasons = [], cautions = [];
  const vol = r.avg_monthly_views;
  if (vol < TINY_VOLUME) cautions.push(`very low volume (${vol}/month): changes are mostly noise`);
  else if (vol < LOW_VOLUME) cautions.push(`low volume (${vol}/month): percentages are noisy`);
  else { score++; reasons.push(`enough volume (${vol.toLocaleString('en')}/month)`); }

  const p = r.p_value;
  if (p < 0.05) { score += 2; reasons.push(`trend is consistent across months (p=${p.toFixed(3)})`); }
  else if (p < 0.2) { score++; reasons.push(`trend is only weakly consistent (p=${p.toFixed(2)})`); }
  else cautions.push(`no statistically consistent trend (p=${p.toFixed(2)})`);

  let spiky = r.spike_share > 0.2;
  if (r.growth_raw !== null && r.growth_clean !== null) {
    if (direction(r.growth_raw) !== direction(r.growth_clean) || Math.abs(r.growth_raw - r.growth_clean) > 0.15) {
      spiky = true;
      cautions.push(`growth depends on spikes (raw ${pct(r.growth_raw)} vs cleaned ${pct(r.growth_clean)})`);
    } else if (!spiky) { score++; reasons.push('not driven by one-off spikes'); }
  }
  if (r.spike_share > 0.2) cautions.push(`${Math.round(r.spike_share * 100)}% of views came from anomalous spike days`);

  const d = r.direction, ds = r.direction_share;
  const disagree = d !== ds && d !== 'unknown' && ds !== 'unknown';
  if (d === ds && d !== 'unknown') { score++; reasons.push('direction holds after normalising by total Wikipedia traffic'); }
  else if (disagree)
    cautions.push(`direction changes after normalisation (topic ${d}, share ${ds}; whole wiki ${r.project_growth === null ? 'n/a' : pct(r.project_growth)})`);

  if (nMonths >= 24) score++;
  else cautions.push(`only ${nMonths} months: seasonality cannot be separated from trend`);
  if (r.rename_months.length)
    cautions.push(`redirects dominate in ${r.rename_months.length} month(s): article probably renamed (redirect views are included)`);
  if (r.zero_months) cautions.push(`${r.zero_months} month(s) with zero views (article may be new)`);

  let grade = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
  if (vol < TINY_VOLUME || nMonths < 12) grade = 'low';
  else if (vol < LOW_VOLUME && grade === 'high') grade = 'medium';
  if (disagree && grade === 'high') grade = 'medium'; // the raw change is (partly) platform-wide
  if (spiky && grade === 'high') grade = 'medium'; // one-off events, not a durable trend
  // A rise or fall that fails the trend test, or that starts from months with no article, is not evidence.
  if ((r.direction !== 'flat' && p >= 0.2) || r.zero_months) grade = 'low';
  return { confidence: grade, confidence_score: score, reasons, cautions };
}

/** Short phrase, e.g. 'growing (+18%, high confidence)'. */
export function verdict(r) {
  if (r.direction === 'unknown') return 'insufficient data';
  let word = { up: 'growing', down: 'declining', flat: 'stable' }[r.direction];
  if (r.direction !== 'flat' && r.p_value >= 0.2)
    word = r.confidence !== 'low' ? `probably ${word}` : `no reliable trend (nominally ${word})`;
  const ds = r.direction_share;
  if (ds !== 'unknown' && ds !== r.direction) {
    const rel = { up: 'gaining', down: 'losing', flat: 'keeping' }[ds];
    return `${word} in absolute views (${pct(r.growth_clean)}) but ${rel} share of the wiki's traffic (${pct(r.growth_share)}), ${r.confidence} confidence`;
  }
  return `${word} (${pct(r.growth_clean)}, ${r.confidence} confidence)`;
}
