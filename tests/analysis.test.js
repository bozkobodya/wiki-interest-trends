// Offline tests with synthetic data: `npm test` (node --test) from the skill directory.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as A from '../scripts/lib/analysis.js';
import { dayOfYear, days, monthRange } from '../scripts/lib/dates.js';
import { checkClaims } from '../scripts/lib/report.js';
import { Store } from '../scripts/lib/store.js';

const START = '2023-09-01', END = '2025-08-31';
const DAYS = days(START, END);
const MONTHS = monthRange(START, END);

// deterministic PRNG so tests never flake
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
function make({ growth = 0, base = 300, season = 0.2, noise = 0.05, seed = 1 } = {}) {
  const r = rng(seed);
  return DAYS.map((d, i) => {
    const trend = base * (1 + growth) ** (i / 365);
    const s = 1 + season * Math.cos((2 * Math.PI * dayOfYear(d)) / 365);
    return trend * s * (1 + noise * (r() * 2 - 1));
  });
}
const zeros = () => DAYS.map(() => 0);
const flatTotal = () => DAYS.map(() => 1e6);
const run = (main, total = flatTotal()) => A.analyseSeries(main, zeros(), total, DAYS, MONTHS);

test('steady growth is detected with high confidence', () => {
  const r = run(make({ growth: 0.3 }));
  assert.ok(r.growth_clean > 0.2 && r.growth_clean < 0.4, `growth ${r.growth_clean}`);
  assert.equal(r.direction, 'up');
  assert.ok(r.p_value < 0.05);
  assert.equal(r.months_up, 12);
  assert.equal(r.confidence, 'high');
});

test('noisy flat series is not reported as a reliable trend', () => {
  const r = run(make({ noise: 0.3, seed: 7 }));
  assert.ok(r.direction === 'flat' || r.p_value > 0.05, JSON.stringify([r.growth_clean, r.p_value]));
});

test('a single viral day does not create growth', () => {
  const x = make({ noise: 0.02 });
  x[x.length - 40] = 200000;
  const r = run(x);
  assert.ok(r.growth_raw > 0.5, 'raw data looks like a boom');
  assert.ok(Math.abs(r.growth_clean) < 0.1, 'cleaned data does not');
  assert.ok(r.n_spike_days >= 1);
  assert.ok(r.cautions.some((c) => c.includes('spike')));
  assert.notEqual(r.confidence, 'high');
});

test('platform-wide decline is separated from topic decline', () => {
  const total = DAYS.map((_, i) => 1e6 * 0.8 ** (i / 365));
  const r = run(make({ growth: -0.2 }), total);
  assert.equal(r.direction, 'down');
  assert.equal(r.direction_share, 'flat');
  assert.notEqual(r.confidence, 'high');
  assert.match(r.verdict, /share/);
});

test('a change without a consistent trend is never graded above low', () => {
  // big enough, direction holds after normalisation, 24 months: only p fails
  const r = { avg_monthly_views: 50000, p_value: 0.6, growth_raw: -0.1, growth_clean: -0.1, spike_share: 0,
    direction: 'down', direction_share: 'down', rename_months: [], zero_months: 0 };
  assert.equal(A.confidence(r, 24).confidence, 'low');
  assert.match(A.verdict({ ...r, ...A.confidence(r, 24) }), /no reliable trend/);
  // a flat result with high p is what stability looks like: not capped
  assert.notEqual(A.confidence({ ...r, direction: 'flat', direction_share: 'flat', growth_clean: 0.01 }, 24).confidence, 'low');
});

test('spike-driven change is capped at medium, a new article at low', () => {
  const base = { avg_monthly_views: 50000, p_value: 0.001, growth_raw: 0.6, growth_clean: 0.3, spike_share: 0,
    direction: 'up', direction_share: 'up', rename_months: [], zero_months: 0 };
  assert.equal(A.confidence(base, 24).confidence, 'medium'); // raw vs cleaned differ by > 15 points
  assert.equal(A.confidence({ ...base, growth_raw: 0.3, spike_share: 0.4 }, 24).confidence, 'medium');
  assert.equal(A.confidence({ ...base, growth_raw: 0.3, zero_months: 5 }, 24).confidence, 'low');
});

test('tiny volume caps confidence at low', () => {
  assert.equal(run(make({ growth: 0.5, base: 3 })).confidence, 'low');
});

test('seasonal Mann-Kendall counts same-month pairs', () => {
  const x = [...Array(24)].map((_, i) => (10 + 10 * (i % 12)) * (i >= 12 ? 1.5 : 1));
  const { p, up, pairs } = A.seasonalMannKendall(x);
  assert.deepEqual([up, pairs], [12, 12]);
  assert.ok(p < 0.01);
});

test('claim checker accepts real numbers and flags invented ones', () => {
  const r = run(make({ growth: 0.3 }));
  const fake = { series: [{ ...r, missing: false }] };
  const g = Math.round(r.growth_clean * 100);
  assert.deepEqual(checkClaims(`Interest grew ${g}% to ${r.avg_monthly_views.toLocaleString('en')} views a month`, fake), []);
  assert.equal(checkClaims('Interest grew 95% in 2025', fake).length, 1); // year ignored, 95% flagged
});

test('cache returns only missing ranges', () => {
  const s = new Store(join(mkdtempSync(join(tmpdir(), 'wt-')), 'c.sqlite'));
  const k = ['uk.wikipedia', 'X', 'user'];
  assert.deepEqual(s.missingRanges(...k, '2024-01-01', '2024-12-31'), [['2024-01-01', '2024-12-31']]);
  s.saveDaily(...k, '2024-03-01', '2024-06-30', { '2024-03-05': 5 });
  assert.deepEqual(s.missingRanges(...k, '2024-01-01', '2024-12-31'), [
    ['2024-01-01', '2024-02-29'],
    ['2024-07-01', '2024-12-31'],
  ]);
  assert.deepEqual(s.loadDaily(...k, '2024-01-01', '2024-12-31'), { '2024-03-05': 5 });
});

test('short and long periods work', () => {
  for (const [start, end] of [['2025-03-01', '2025-08-31'], ['2024-09-01', '2025-08-31'], ['2022-09-01', '2025-08-31']]) {
    const d = days(start, end), m = monthRange(start, end);
    const r = A.analyseSeries(d.map(() => 100), d.map(() => 0), d.map(() => 1e6), d, m);
    assert.equal(r.direction, 'flat');
  }
});
