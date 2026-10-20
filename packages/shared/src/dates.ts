/**
 * Business dates are plain `YYYY-MM-DD` strings compared in India time (Asia/Kolkata), so a PO ending
 * on 31 March is still active at 11 pm IST even though it is already 1 April in UTC.
 */

const IST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in India time. Pass a fixed `now` in tests. */
export function todayIst(now: Date = new Date()): string {
  return IST_DATE.format(now);
}

/** A plain date as a UTC midnight, so date maths never depends on the machine's time zone. */
const utc = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** Days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM` of a plain date. */
export const monthKey = (date: string): string => date.slice(0, 7);

export function nextMonthKey(key: string): string {
  const [year = 0, month = 1] = key.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Whole months from `start` to `end` counting both, at least 1 (e.g. Jan to Mar is 3). */
export function monthsBetween(start: string, end: string): number {
  const [sy = 0, sm = 1] = start.split('-').map(Number);
  const [ey = 0, em = 1] = end.split('-').map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

/** Indian financial year of a date, April to March: 2026-10-18 is "2026-27", 2027-02-01 is "2026-27". */
export function financialYear(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
