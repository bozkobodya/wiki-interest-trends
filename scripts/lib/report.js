// One-page A4 PDF report (pdfkit, vector charts). Agent-written notes are verified with claims.js.
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import * as C from './charts.js';
import { checkClaims } from './claims.js';
import { CONF_WORD, t } from './i18n.js';
import { today } from './dates.js';

export { checkClaims };

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONT_DIR = join(SKILL_DIR, 'node_modules', 'dejavu-fonts-ttf', 'ttf');
export const MAX_NOTES_CHARS = 1100;
export const MAX_TABLE_ROWS = 8;

const ok = (run) => run.series.filter((s) => !s.missing);
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
const num = (v) => v.toLocaleString('en');

// ---------------------------------------------------------------------------
// Findings (deterministic text, localised)
// ---------------------------------------------------------------------------
export function findings(run, ui = 'en') {
  const S = ok(run);
  if (!S.length) return [];
  const multi = new Set(S.map((s) => s.topic)).size > 1;
  const lab = (s) => (multi ? C.seriesLabel(s, true) : `${s.topic} (${s.lang})`);
  const cw = CONF_WORD[ui] || CONF_WORD.en;
  const out = [];
  const byG = S.filter((s) => s.growth_clean !== null).sort((a, b) => b.growth_clean - a.growth_clean);
  if (S.length === 1) {
    const s = S[0];
    out.push(t('f_one', ui, { s: lab(s), g: pct(s.growth_clean), gs: pct(s.growth_share), v: num(s.avg_monthly_views), c: cw[s.confidence] }));
  } else if (byG.length) {
    const f = byG[0], w = byG.at(-1);
    out.push(t('f_fastest', ui, { s: lab(f), g: pct(f.growth_clean), c: cw[f.confidence] }));
    out.push(t('f_slowest', ui, { s: lab(w), g: pct(w.growth_clean), c: cw[w.confidence] }));
    const byV = [...S].sort((a, b) => b.avg_monthly_views - a.avg_monthly_views);
    out.push(t('f_largest', ui, { s: lab(byV[0]), v: num(byV[0].avg_monthly_views), s2: lab(byV.at(-1)), v2: num(byV.at(-1).avg_monthly_views) }));
  }
  out.push(t('f_consistent', ui, { k: S.filter((s) => s.p_value < 0.05).length, n: S.length }));
  const wiki = new Map();
  for (const s of S) if (!wiki.has(s.lang)) wiki.set(s.lang, s.project_growth);
  out.push(t('f_wiki', ui, { parts: [...wiki].map(([l, g]) => `${l} ${pct(g)}`).join(', ') }));
  const spiky = S.filter((s) => s.cautions.some((c) => c.includes('spike')));
  if (spiky.length) out.push(t('f_spikes', ui, { parts: spiky.map(lab).join(', ') }));
  const missing = run.series.filter((s) => s.missing);
  if (missing.length) out.push(t('f_missing', ui, { parts: missing.map((s) => `${s.topic}/${s.lang}`).join(', ') }));
  return out;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
const bullets = (text) =>
  text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/^[-•*] /.test(l) ? `•  ${l.slice(2)}` : l));

export async function buildPdf(run, outPdf, { title, notes, ui = 'en' } = {}) {
  const S = ok(run);
  if (!S.length) throw new Error('Nothing to report: no series with data.');
  const p = run.params;
  const multi = new Set(S.map((s) => s.topic)).size > 1;
  const warnings = [];
  const rows = [...S].sort((a, b) => (b.growth_clean ?? -9) - (a.growth_clean ?? -9)).slice(0, MAX_TABLE_ROWS);
  if (S.length > MAX_TABLE_ROWS) warnings.push(`table and charts truncated to ${MAX_TABLE_ROWS} of ${S.length} series; split the report`);
  const plotted = S.slice(0, MAX_TABLE_ROWS);
  if (notes && notes.length > MAX_NOTES_CHARS) {
    warnings.push(`notes truncated to ${MAX_NOTES_CHARS} characters; shorten them`);
    notes = notes.slice(0, MAX_NOTES_CHARS).replace(/\s+\S*$/, '') + '…';
  }
  if (notes) warnings.push(...checkClaims(notes, run));

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: title || 'Wikipedia interest report', Creator: 'wiki-interest-trends' } });
  doc.registerFont('R', join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont('B', join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
  mkdirSync(dirname(outPdf), { recursive: true });
  const stream = createWriteStream(outPdf);
  doc.pipe(stream);

  const PW = 595.28, PH = 841.89, L = 40, W = PW - 2 * L;
  const fontCallback = (_family, bold) => (bold ? 'B' : 'R');
  const embed = (svg, x, y, w) => {
    const [, sw, sh] = svg.match(/width="([\d.]+)" height="([\d.]+)"/).map(Number);
    const h = (sh / sw) * w;
    // drop the intrinsic size so the viewBox is scaled into the w x h box
    const scalable = svg.replace(/^<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, '<svg$1');
    SVGtoPDF(doc, scalable, x, y, { width: w, height: h, fontCallback, assumePt: true });
    return h;
  };
  doc.rect(0, 0, PW, PH).fill(C.SURFACE);

  const topics = [...new Set(S.map((s) => s.topic))].join(', ');
  doc.fillColor(C.INK).font('B').fontSize(16).text(title || t('report_title', ui, { topics }), L, 34, { width: W });
  doc.fillColor(C.INK2).font('R').fontSize(7.5)
    .text(t('subtitle', ui, { langs: p.langs.join(', '), start: p.start.slice(0, 7), end: p.end.slice(0, 7), date: today() }), L, doc.y + 3, { width: W });

  doc.fillColor(C.INK).font('B').fontSize(10).text(t('key_findings', ui), L, doc.y + 10);
  doc.font('R').fontSize(8).text(findings(run, ui).map((f) => `•  ${f}`).join('\n'), L, doc.y + 3, { width: W, lineGap: 1.5 });

  let y = doc.y + 10;
  y += embed(C.trendSvg(plotted, { ui, multi, w: 580, h: 205 }), L, y, W) + 8;
  const half = (W - 16) / 2;
  const h1 = embed(C.growthSvg(plotted, { ui, multi, w: 300, short: true }), L, y, half);
  const h2 = embed(C.volumeSvg(plotted, { ui, multi, w: 300, short: true }), L + half + 16, y, half);
  y += Math.max(h1, h2) + 10;

  // table
  const cols = ['table_series', 'table_article', 'table_avg', 'table_growth', 'table_share', 'table_up', 'table_p', 'table_conf'].map((k) => t(k, ui));
  const widths = [0.12, 0.23, 0.1, 0.08, 0.14, 0.12, 0.07, 0.14].map((f) => f * W);
  const cw = CONF_WORD[ui] || CONF_WORD.en;
  const cells = rows.map((s) => [
    C.seriesLabel(s, multi), s.articles.join('; '), num(s.avg_monthly_views), pct(s.growth_clean), pct(s.growth_share),
    s.month_pairs ? `${s.months_up}/${s.month_pairs}` : '–', s.p_value.toFixed(3), cw[s.confidence],
  ]);
  const rh = 14;
  [cols, ...cells].forEach((row, r) => {
    let x = L;
    if (r === 0) doc.rect(L, y, W, rh).fill('#f0efec');
    row.forEach((c, i) => {
      doc.fillColor(r === 0 ? C.INK2 : C.INK).font(r === 0 ? 'B' : 'R').fontSize(7)
        .text(String(c), x + 3, y + 4, { width: widths[i] - 6, height: rh, lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.moveTo(L, y + rh).lineTo(L + W, y + rh).lineWidth(0.5).strokeColor(C.GRID).stroke();
    y += rh;
  });
  y += 12;

  // agent-written interpretation
  if (notes) {
    doc.fillColor(C.INK).font('B').fontSize(10).text(t('analyst_note', ui), L, y);
    doc.font('R').fontSize(8).text(bullets(notes).join('\n'), L, doc.y + 3, { width: W, lineGap: 1.5 });
    y = doc.y + 8;
  }

  // method & limitations pinned to the bottom
  const glabel = ui === 'uk'
    ? S[0].growth_label.replace(/last (\d+) mo vs previous (\d+) mo/, 'останні $1 міс. vs попередні $2 міс.')
    : S[0].growth_label;
  const mtext = t('method_text', ui, { maxred: p.max_redirects ?? 40, glabel });
  doc.font('R').fontSize(6.3);
  const mh = doc.heightOfString(mtext, { width: W, lineGap: 1 });
  const my = PH - 26 - mh - 12;
  if (y > my - 4) {
    const cut = Math.ceil((y - (my - 4)) / 11.5) * 110; // ~11.5pt per line, ~110 chars per line
    warnings.push(`content overflows the page: shorten --notes by at least ~${cut} characters ` +
      `(now ${notes ? notes.length : 0}) or analyse fewer series`);
  }
  doc.fillColor(C.INK2).font('B').fontSize(8).text(t('method', ui), L, my);
  doc.font('R').fontSize(6.3).text(mtext, L, my + 12, { width: W, lineGap: 1 });

  doc.end();
  await new Promise((res, rej) => { stream.on('finish', res); stream.on('error', rej); });
  return { pdf: outPdf, pages: 1, warnings };
}
