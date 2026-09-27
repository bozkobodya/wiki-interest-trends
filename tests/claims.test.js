// Claim checker tests, built from real mistakes Haiku 4.5 made in evals (see evals/results.md).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkClaims } from '../scripts/lib/claims.js';

const S = (lang, o) => ({
  topic: 'English language', lang, missing: false, total_views: 0, monthly_raw: [], monthly_clean: [], top_spikes: [],
  growth_raw: o.g, growth_clean: o.g, growth_share: o.gs, project_growth: null, trend_per_year: null, long_run_cagr: null,
  spike_share: 0, redirect_share: 0, month_pairs: 12, direction: o.g > 0.05 ? 'up' : o.g < -0.05 ? 'down' : 'flat',
  direction_share: o.gs > 0.05 ? 'up' : o.gs < -0.05 ? 'down' : 'flat', ...o,
});
const RUN = { series: [
  S('de', { g: -0.07, gs: 0.0, avg_monthly_views: 25184, p_value: 0.149, months_up: 3, confidence: 'medium' }),
  S('vi', { g: -0.23, gs: 0.02, avg_monthly_views: 14408, p_value: 0.002, months_up: 0, confidence: 'medium' }),
  S('uk', { g: -0.35, gs: -0.14, avg_monthly_views: 8625, p_value: 0.002, months_up: 0, confidence: 'high' }),
] };
const ONE = { series: [S('uk', { topic: 'Astronomy', g: -0.6, gs: -0.45, avg_monthly_views: 1637, p_value: 0.0001, months_up: 1, month_pairs: 36, confidence: 'high' })] };
const has = (text, run, re) => checkClaims(text, run).some((w) => re.test(w));

test('correct statements pass', () => {
  for (const t of [
    'Німецька (de): −7%, частка +0%, середня довіра, p=0.149.',
    '| Українська (uk) | 8,625 | -35% | -14% | HIGH |',
    'Українська, німецька та вʼєтнамська версії падають.',
    'uk: declining (-35%, high confidence), p < 0.05, 0/12 months up.',
    'The es edition covers Spain and Latin America, not one country.',
    'Інтерес до астрономії не зростає, а падає: -60%, висока впевненість.',
    'Українська (uk): тренд послідовний (p = 0,002).', // decimal comma is not a view count
  ]) assert.deepEqual(checkClaims(t, t.includes('астроном') ? ONE : RUN), [], t);
});

test('wrong confidence for a named language is flagged', () => {
  assert.ok(has('Німецька: слабка достовірність (p=0.15).', RUN, /confidence/)); // round 1: tool said medium
  assert.ok(has('| Вʼєтнамська (vi) | 14,408 | -23% | +2% | HIGH |', RUN, /confidence/));
  assert.ok(has('uk, de and vi all have high confidence.', RUN, /confidence/));
});

test('wrong p-value claims are flagged', () => {
  assert.ok(has('For de the trend is consistent (p<0.05).', RUN, /p-value|p /)); // round 2
  assert.ok(has('Німецька: p=0.02.', RUN, /p-value|p /));
  assert.deepEqual(checkClaims('Німецька: p=0.15.', RUN), []); // 0.149 rounded
});

test('growth or decline words that contradict the data are flagged', () => {
  assert.ok(has('Вʼєтнамська (vi): відносний інтерес зростає.', RUN, /direction|grow/));
  assert.ok(has('Interest in uk is growing.', RUN, /direction|grow/));
  assert.ok(has('Інтерес до астрономії зростає.', ONE, /direction|grow/)); // single series: implicit subject
  assert.ok(has('Вʼєтнамська (vi): сигналізує про растучий попит.', RUN, /direction/)); // round 4 misspelling
  assert.ok(has('**1. Вʼєтнамська (vi)** — першочергово\n- Сигналізує про зростаючий попит', RUN, /direction/)); // heading context
});

test('countries used instead of language editions are flagged', () => {
  assert.ok(has('| Німеччина | 25,184 | −7% | 0% | MEDIUM |', RUN, /country/)); // round 1
  assert.ok(has('Priority 1: Vietnam (14K/month).', RUN, /country/));
  assert.deepEqual(checkClaims('іспанське видання охоплює Іспанію та Латинську Америку', RUN), []);
});

test('outside numbers such as population are flagged', () => {
  assert.ok(has('Вʼєтнамська (vi): активне населення (95+ млн людей).', RUN, /outside/)); // round 4
});

test('months-up fractions are checked', () => {
  assert.ok(has('Українська (uk): 5/12 months up.', RUN, /months/));
});
