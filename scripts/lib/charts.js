// Dependency-free SVG charts. The same SVG is written to disk and embedded (as vectors) in the PDF.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from './i18n.js';

// Validated categorical order; colour follows the entity (input order), never its rank.
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const INK = '#0b0b0b', INK2 = '#52514e', GRID = '#e4e3df', SURFACE = '#fcfcfb';
const CONF_OPACITY = { high: 1, medium: 0.65, low: 0.35 };
const FONT = 'DejaVu Sans';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = (v) => +v.toFixed(1);
export const textWidth = (s, size) => String(s).length * size * 0.56; // rough, good enough for layout

function text(x, y, s, { size = 9, fill = INK2, anchor = 'start', weight = 'normal' } = {}) {
  // y is the visual middle of the line; shift to baseline (svg-to-pdfkit ignores dominant-baseline)
  return `<text x="${f1(x)}" y="${f1(y + size * 0.35)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}
const line = (x1, y1, x2, y2, stroke = GRID, w = 1, dash = '') =>
  `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${SURFACE}"/>${body}</svg>`;

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const ticks = [];
  const top = Math.ceil(hi / step - 1e-9) * step;
  for (let v = Math.floor(lo / step + 1e-9) * step; v <= top + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

export const seriesKey = (s) => `${s.topic}|${s.lang}`;
export const seriesLabel = (s, multiTopic) => (multiTopic ? `${s.topic} · ${s.lang}` : s.lang);
export function colours(series) {
  return Object.fromEntries(series.map((s, i) => [seriesKey(s), PALETTE[i] ?? '#8a8984']));
}

function rolling(x, w = 3) {
  return x.map((_, i) => (i < w - 1 ? null : x.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w));
}

export function indexSeries(s, key = 'monthly_clean') {
  const x = s[key];
  const n = x.length >= 24 ? 12 : Math.max(1, x.length >> 1);
  const base = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  return x.map((v) => (base > 0 ? (v / base) * 100 : null));
}

/** Line chart of indexed values (first year = 100), one line per series. */
export function trendSvg(series, { ui = 'en', key = 'monthly_clean', titleKey = 'trend_title', multi = false, w = 800, h = 340 } = {}) {
  const cols = colours(series);
  const months = series[0].months;
  const lines = series.map((s) => ({ s, y: rolling(indexSeries(s, key)) }));
  const vals = lines.flatMap((l) => l.y.filter((v) => v !== null));
  const ticks = niceTicks(Math.min(...vals, 100), Math.max(...vals, 100));
  const lo = ticks[0], hi = ticks.at(-1);
  const endLabels = series.length <= 4;
  const labelW = endLabels ? Math.max(...series.map((s) => textWidth(seriesLabel(s, multi), 8))) + 10 : 10;
  const L = 48, R = w - labelW, T = 52, B = h - 26;
  const X = (i) => L + (i / Math.max(1, months.length - 1)) * (R - L);
  const Y = (v) => B - ((v - lo) / (hi - lo || 1)) * (B - T);
  let body = text(8, 12, t(titleKey, ui), { size: 12, fill: INK, weight: 'bold' });
  // legend (always present for >= 2 series)
  if (series.length > 1) {
    let lx = 8;
    for (const s of series) {
      const lab = seriesLabel(s, multi);
      body += `<rect x="${lx}" y="27" width="12" height="3" rx="1.5" fill="${cols[seriesKey(s)]}"/>` + text(lx + 16, 28.5, lab, { size: 8 });
      lx += 26 + textWidth(lab, 8);
    }
  }
  for (const v of ticks) body += line(L, Y(v), R, Y(v), GRID, 0.8) + text(L - 5, Y(v), v, { size: 8, anchor: 'end' });
  body += line(L, Y(100), R, Y(100), INK2, 0.8, '2 3');
  const step = Math.max(1, Math.round(months.length / 8));
  months.forEach((m, i) => { if (i % step === 0) body += text(X(i), B + 14, m, { size: 7.5, anchor: 'middle' }); });
  body += text(L, T - 10, t('index_label', ui), { size: 7.5 });
  const ends = [];
  for (const { s, y } of lines) {
    const pts = y.map((v, i) => (v === null ? null : `${f1(X(i))},${f1(Y(v))}`)).filter(Boolean);
    body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${cols[seriesKey(s)]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = y.findLastIndex((v) => v !== null);
    if (last >= 0) ends.push({ s, y: Y(y[last]) });
  }
  if (endLabels) {
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 11); // avoid collisions
    for (const e of ends) body += text(R + 5, e.y, seriesLabel(e.s, multi), { size: 8, fill: INK2 });
  }
  return svg(w, h, body);
}

/** Horizontal bars: cleaned growth per series; ◆ marks normalised growth; opacity = confidence. */
export function growthSvg(series, { ui = 'en', multi = false, w = 800, short = false } = {}) {
  const cols = colours(series);
  const order = [...series].sort((a, b) => (b.growth_clean ?? -9) - (a.growth_clean ?? -9));
  const rowH = 24, T = 30, h = T + order.length * rowH + 34;
  const labW = Math.max(...order.map((s) => textWidth(seriesLabel(s, multi), 8))) + 14;
  const all = order.flatMap((s) => [s.growth_clean ?? 0, s.growth_share ?? 0]).map((v) => v * 100);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
  const lo = ticks[0], hi = ticks.at(-1);
  const L = labW, R = w - Math.min(170, w * 0.36);
  const X = (v) => L + ((v - lo) / (hi - lo || 1)) * (R - L);
  let body = text(8, 12, t(short ? 'growth_title_short' : 'growth_title', ui), { size: 12, fill: INK, weight: 'bold' });
  const B = T + order.length * rowH;
  for (const v of ticks) body += line(X(v), T, X(v), B, GRID, 0.8) + text(X(v), B + 10, `${v}%`, { size: 7.5, anchor: 'middle' });
  order.forEach((s, i) => {
    const cy = T + i * rowH + rowH / 2;
    const g = (s.growth_clean ?? 0) * 100;
    const x0 = X(Math.min(0, g)), x1 = X(Math.max(0, g));
    body += `<rect x="${f1(x0)}" y="${f1(cy - 8)}" width="${f1(Math.max(1, x1 - x0))}" height="16" rx="3" fill="${cols[seriesKey(s)]}" fill-opacity="${CONF_OPACITY[s.confidence]}"/>`;
    body += text(L - 6, cy, seriesLabel(s, multi), { size: 8, anchor: 'end', fill: INK });
    let right = Math.max(g, 0);
    if (s.growth_share !== null) {
      const sx = X(s.growth_share * 100);
      body += `<path d="M${f1(sx)} ${f1(cy - 5)} L${f1(sx + 5)} ${f1(cy)} L${f1(sx)} ${f1(cy + 5)} L${f1(sx - 5)} ${f1(cy)} Z" fill="${INK}" stroke="${SURFACE}" stroke-width="1"/>`;
      right = Math.max(right, s.growth_share * 100);
    }
    body += text(X(right) + 8, cy, `${g >= 0 ? '+' : ''}${Math.round(g)}% · ${t('conf_' + s.confidence, ui)}`, { size: 7.5 });
  });
  body += line(X(0), T, X(0), B, INK2, 1);
  body += text(L, B + 25, t('growth_xlabel', ui), { size: 7.5 });
  return svg(w, h, body);
}

/** Horizontal bars: average monthly views (audience size). */
export function volumeSvg(series, { ui = 'en', multi = false, w = 800, short = false } = {}) {
  const cols = colours(series);
  const order = [...series].sort((a, b) => b.avg_monthly_views - a.avg_monthly_views);
  const rowH = 24, T = 30, h = T + order.length * rowH + 34;
  const labW = Math.max(...order.map((s) => textWidth(seriesLabel(s, multi), 8))) + 14;
  const max = Math.max(1, ...order.map((s) => s.avg_monthly_views));
  const ticks = niceTicks(0, max, 3);
  const L = labW, R = w - 60;
  const X = (v) => L + (v / ticks.at(-1)) * (R - L);
  let body = text(8, 12, t(short ? 'volume_title_short' : 'volume_title', ui), { size: 12, fill: INK, weight: 'bold' });
  const B = T + order.length * rowH;
  for (const v of ticks) body += line(X(v), T, X(v), B, GRID, 0.8) + text(X(v), B + 10, v.toLocaleString('en'), { size: 7.5, anchor: 'middle' });
  order.forEach((s, i) => {
    const cy = T + i * rowH + rowH / 2;
    const v = s.avg_monthly_views;
    body += `<rect x="${f1(L)}" y="${f1(cy - 8)}" width="${f1(Math.max(1, X(v) - L))}" height="16" rx="3" fill="${cols[seriesKey(s)]}"/>`;
    body += text(L - 6, cy, seriesLabel(s, multi), { size: 8, anchor: 'end', fill: INK });
    body += text(X(v) + 5, cy, v.toLocaleString('en'), { size: 7.5 });
  });
  return svg(w, h, body);
}

export function makeCharts(run, out, ui = 'en') {
  const series = run.series.filter((s) => !s.missing);
  if (!series.length) return [];
  const multi = new Set(series.map((s) => s.topic)).size > 1;
  const files = {
    'trend.svg': trendSvg(series, { ui, multi }),
    'trend_share.svg': trendSvg(series, { ui, multi, key: 'monthly_share_per_million', titleKey: 'share_title' }),
    'growth.svg': growthSvg(series, { ui, multi }),
    'volume.svg': volumeSvg(series, { ui, multi }),
  };
  return Object.entries(files).map(([name, content]) => {
    writeFileSync(join(out, name), content);
    return join(out, name);
  });
}
