// Date helpers on ISO strings ('YYYY-MM-DD'), always in UTC.
export const toISO = (d) => d.toISOString().slice(0, 10);
export const parseISO = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
export const today = () => toISO(new Date());

export function days(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthRange(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}

/** Last day of month 'YYYY-MM'. */
export function monthEnd(ym) {
  const [y, m] = ym.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m, 0)));
}

export function dayOfYear(s) {
  const d = parseISO(s);
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}
