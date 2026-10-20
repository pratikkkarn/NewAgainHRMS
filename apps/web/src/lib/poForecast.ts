import { PurchaseOrder } from '../types/domain';

// Projected run-out date, as defined in the HRMS Architecture doc (section 7):
//   run-out = today + remaining balance ÷ average monthly invoiced amount (last 3 invoiced months).
//   With fewer than 2 months of invoices, assume the PO value is spent evenly
//   from start date to end date.

export type ForecastMethod = 'recent-invoices' | 'even-spend' | 'exhausted' | 'none';

export interface BalancePoint {
  month: string; // YYYY-MM
  label: string; // e.g. "Oct 26"
  balance: number;
  projected: boolean;
}

export interface RunOutForecast {
  method: ForecastMethod;
  monthlyBurn: number;
  runOutDate: string | null; // YYYY-MM-DD
  daysToRunOut: number | null;
  runsOutBeforeExpiry: boolean;
  series: BalancePoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.44;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(-2)}`;
};

const nextMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

const toIsoDate = (d: Date) => d.toISOString().split('T')[0];

function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  return Math.max(1, months);
}

// Net invoiced per billing month: invoices add, credit notes subtract. Cancelled ones are ignored.
export function netInvoicedByMonth(po: PurchaseOrder): Map<string, number> {
  const totals = new Map<string, number>();
  po.invoices
    .filter((inv) => inv.status === 'Issued' || inv.status === 'Paid')
    .forEach((inv) => {
      const key = monthKey(new Date(inv.billingPeriodStart || inv.invoiceDate));
      const amount = Math.abs(inv.amountExclGst) * (inv.isCreditNote ? -1 : 1);
      totals.set(key, (totals.get(key) || 0) + amount);
    });
  return totals;
}

export function forecastRunOut(po: PurchaseOrder, today: Date = new Date()): RunOutForecast {
  const remaining = po.remainingBalanceExclGst;
  const byMonth = netInvoicedByMonth(po);
  const invoicedMonths = [...byMonth.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));

  let method: ForecastMethod;
  let monthlyBurn: number;
  if (remaining <= 0) {
    method = 'exhausted';
    monthlyBurn = 0;
  } else if (invoicedMonths.length >= 2) {
    const recent = invoicedMonths.slice(-3);
    monthlyBurn = recent.reduce((sum, [, amount]) => sum + amount, 0) / recent.length;
    method = 'recent-invoices';
  } else {
    monthlyBurn = po.amountExclGst / monthsBetween(po.startDate, po.expiryDate);
    method = monthlyBurn > 0 ? 'even-spend' : 'none';
  }

  let runOutDate: string | null = null;
  let daysToRunOut: number | null = null;
  if (method === 'exhausted') {
    runOutDate = toIsoDate(today);
    daysToRunOut = 0;
  } else if (monthlyBurn > 0) {
    daysToRunOut = Math.round((remaining / monthlyBurn) * AVG_DAYS_PER_MONTH);
    runOutDate = toIsoDate(new Date(today.getTime() + daysToRunOut * DAY_MS));
  }

  const runsOutBeforeExpiry = runOutDate !== null && runOutDate < po.expiryDate;

  // Actual balance month by month from the PO start, then projected months until run-out or expiry.
  const series: BalancePoint[] = [];
  const currentKey = monthKey(today);
  let key = monthKey(new Date(po.startDate));
  let balance = po.amountExclGst;
  let guard = 0;
  while (key <= currentKey && guard++ < 120) {
    balance -= byMonth.get(key) || 0;
    series.push({ month: key, label: monthLabel(key), balance: Math.max(0, balance), projected: false });
    key = nextMonth(key);
  }
  const stopKey = runOutDate && runOutDate < po.expiryDate ? runOutDate.slice(0, 7) : po.expiryDate.slice(0, 7);
  let projected = remaining;
  guard = 0;
  while (monthlyBurn > 0 && projected > 0 && key <= stopKey && guard++ < 36) {
    projected = Math.max(0, projected - monthlyBurn);
    series.push({ month: key, label: monthLabel(key), balance: Math.round(projected), projected: true });
    key = nextMonth(key);
  }

  return { method, monthlyBurn: Math.round(monthlyBurn), runOutDate, daysToRunOut, runsOutBeforeExpiry, series };
}

// Days between two YYYY-MM-DD dates (b − a). Positive when b is later.
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

// Gap between a renewed PO's expiry and its successor's start, in days (0 when they touch or overlap).
export function renewalGapDays(previous: PurchaseOrder, next: PurchaseOrder): number {
  return Math.max(0, daysBetween(previous.expiryDate, next.startDate) - 1);
}
