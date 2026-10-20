import { addDays, daysBetween, monthKey, monthsBetween, nextMonthKey } from './dates.js';
import { fromPaise, type Money, toPaise } from './money.js';

/**
 * Purchase-order rules, ported from the frontend (`lib/poUtils.ts`, `lib/poForecast.ts`) with exact paise
 * arithmetic instead of floating point. The API runs these inside the transaction that changes an invoice;
 * the screens run the same code to explain the result before saving.
 */

export type LedgerType = 'INVOICE' | 'CREDIT_NOTE';
export type LedgerStatus = 'ISSUED' | 'PAID' | 'CANCELLED';

/** The parts of an invoice that matter to the PO balance. */
export interface LedgerEntry {
  type: LedgerType;
  status: LedgerStatus;
  amountExGst: Money;
  /** First day of the billed month, `YYYY-MM-DD`. */
  billingMonth: string;
}

/** Only issued and paid entries move the balance. Cancelled ones are void. */
export const isActive = (entry: Pick<LedgerEntry, 'status'>): boolean => entry.status !== 'CANCELLED';

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

/** "₹1,25,000" or "₹1,25,000.50", Indian digit grouping. */
export function rupees(paise: bigint): string {
  const amount = Number(paise) / 100;
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: paise % 100n === 0n ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export interface Balance {
  /** Active tax invoices, ex GST. */
  invoiced: bigint;
  /** Active credit notes, ex GST. */
  creditNotes: bigint;
  /** PO amount − invoiced + credit notes. Can be negative after an approved override. */
  remainingRaw: bigint;
  /** Never below zero, as shown on screens. */
  remaining: bigint;
}

/** Remaining balance = PO amount − issued invoices + credit notes. Cancelled entries are ignored. */
export function computeBalance(poAmountExGst: Money, ledger: readonly LedgerEntry[]): Balance {
  let invoiced = 0n;
  let creditNotes = 0n;
  for (const entry of ledger) {
    if (!isActive(entry)) continue;
    if (entry.type === 'CREDIT_NOTE') creditNotes += abs(toPaise(entry.amountExGst));
    else invoiced += abs(toPaise(entry.amountExGst));
  }
  const remainingRaw = toPaise(poAmountExGst) - invoiced + creditNotes;
  return { invoiced, creditNotes, remainingRaw, remaining: remainingRaw > 0n ? remainingRaw : 0n };
}

/** Stored PO statuses. "Expiring soon" and "running low" are warnings worked out daily, not statuses. */
export type PoStatusName = 'ACTIVE' | 'RENEWED' | 'EXHAUSTED' | 'EXPIRED' | 'CLOSED';

/**
 * Status after a change. Renewed and closed are decisions a person made, so they stick. Otherwise a PO with
 * nothing left is exhausted, one past its end date is expired, and anything else is active. A credit note
 * that frees up balance moves an exhausted PO back to active.
 */
export function derivePoStatus(current: PoStatusName, balance: Balance, endDate: string, today: string): PoStatusName {
  if (current === 'RENEWED' || current === 'CLOSED') return current;
  if (balance.remaining === 0n) return 'EXHAUSTED';
  if (endDate < today) return 'EXPIRED';
  return 'ACTIVE';
}

export const OVERRIDE_REASON_MIN = 10;

/**
 * An invoice larger than the remaining balance is blocked, unless the user may override (CEO / PO Admin)
 * and gives a written reason of at least 10 characters. Returns an error message, or null when it may be saved.
 */
export function checkInvoiceOverride(remaining: bigint, amountExGst: Money, canOverride: boolean, reason: string): string | null {
  const amount = toPaise(amountExGst);
  if (amount <= 0n) return 'Invoice amount must be greater than zero.';
  if (amount <= remaining) return null;
  const over = `Invoice amount (${rupees(amount)}) exceeds the remaining PO balance (${rupees(remaining)}).`;
  if (!canOverride) return `${over} Reduce the amount or add a credit note. Only the CEO or a PO Admin can override.`;
  if (reason.trim().length < OVERRIDE_REASON_MIN) return `${over} To override, give a reason of at least ${OVERRIDE_REASON_MIN} characters.`;
  return null;
}

/** A proposed PO value can't be zero or below what has already been invoiced. */
export function checkAmendment(invoiced: bigint, proposedExGst: Money): string | null {
  const proposed = toPaise(proposedExGst);
  if (proposed <= 0n) return 'The revised PO value must be greater than zero.';
  if (proposed < invoiced) {
    return `Cannot change the PO value to ${rupees(proposed)}. Active issued invoices total ${rupees(invoiced)}, which is more than the revised value.`;
  }
  return null;
}

/**
 * A credit note can't exceed what was invoiced and not yet credited. It is not blocked just because the
 * remaining balance is low or zero.
 */
export function checkCreditNote(balance: Balance, amountExGst: Money): string | null {
  const amount = toPaise(amountExGst);
  if (amount <= 0n) return 'Credit note amount must be greater than zero.';
  const eligible = balance.invoiced - balance.creditNotes;
  if (eligible <= 0n) return 'No active invoiced amount exists on this PO to issue a credit note against.';
  if (amount > eligible) return `Credit note amount (${rupees(amount)}) exceeds the net invoiced amount (${rupees(eligible)}).`;
  return null;
}

/** A billing milestone must have a name, fall inside the PO period and have a positive amount. */
export function checkMilestone(po: { startDate: string; endDate: string }, title: string, dueDate: string, amountExGst: Money | null): string | null {
  if (!title.trim()) return 'Give the milestone a name.';
  if (!dueDate) return 'Pick a due date.';
  if (dueDate < po.startDate || dueDate > po.endDate) return `The due date must fall within the PO period (${po.startDate} to ${po.endDate}).`;
  if (amountExGst !== null && toPaise(amountExGst) <= 0n) return 'The amount must be greater than zero.';
  return null;
}

/** Gap in days between a renewed PO's end and its successor's start (0 when they touch or overlap). */
export function renewalGapDays(previousEndDate: string, nextStartDate: string): number {
  return Math.max(0, daysBetween(previousEndDate, nextStartDate) - 1);
}

// ─── Forecast ──────────────────────────────────────────────────────────────

export type ForecastMethod = 'recent-invoices' | 'even-spend' | 'exhausted' | 'none';

export interface BalancePoint {
  /** `YYYY-MM`. */
  month: string;
  /** For chart axes, e.g. "Oct 26". */
  label: string;
  balance: Money;
  projected: boolean;
}

export interface RunOutForecast {
  method: ForecastMethod;
  monthlyBurn: Money;
  runOutDate: string | null;
  daysToRunOut: number | null;
  runsOutBeforeExpiry: boolean;
  series: BalancePoint[];
}

const AVG_DAYS_PER_MONTH = 30.44;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthLabel = (key: string): string => {
  const [year = 0, month = 1] = key.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${String(year).slice(-2)}`;
};

/** Net invoiced per billing month: invoices add, credit notes subtract, cancelled ones are ignored. */
export function netInvoicedByMonth(ledger: readonly LedgerEntry[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const entry of ledger) {
    if (!isActive(entry)) continue;
    const key = monthKey(entry.billingMonth);
    const amount = abs(toPaise(entry.amountExGst)) * (entry.type === 'CREDIT_NOTE' ? -1n : 1n);
    totals.set(key, (totals.get(key) ?? 0n) + amount);
  }
  return totals;
}

/**
 * Projected run-out date (Architecture doc, section 7): today + remaining ÷ average monthly invoiced amount
 * over the last 3 invoiced months. With fewer than 2 invoiced months, the PO value is assumed to be spent
 * evenly from its start date to its end date.
 */
export function forecastRunOut(
  po: { amountExGst: Money; startDate: string; endDate: string },
  ledger: readonly LedgerEntry[],
  today: string,
): RunOutForecast {
  const balance = computeBalance(po.amountExGst, ledger);
  const byMonth = netInvoicedByMonth(ledger);
  const invoicedMonths = [...byMonth.entries()].filter(([, amount]) => amount > 0n).sort(([a], [b]) => (a < b ? -1 : 1));

  let method: ForecastMethod;
  let burn: bigint;
  if (balance.remaining <= 0n) {
    method = 'exhausted';
    burn = 0n;
  } else if (invoicedMonths.length >= 2) {
    const recent = invoicedMonths.slice(-3);
    burn = recent.reduce((sum, [, amount]) => sum + amount, 0n) / BigInt(recent.length);
    method = 'recent-invoices';
  } else {
    burn = toPaise(po.amountExGst) / BigInt(monthsBetween(po.startDate, po.endDate));
    method = burn > 0n ? 'even-spend' : 'none';
  }

  let runOutDate: string | null = null;
  let daysToRunOut: number | null = null;
  if (method === 'exhausted') {
    runOutDate = today;
    daysToRunOut = 0;
  } else if (burn > 0n) {
    daysToRunOut = Math.round((Number(balance.remaining) / Number(burn)) * AVG_DAYS_PER_MONTH);
    runOutDate = addDays(today, daysToRunOut);
  }
  const runsOutBeforeExpiry = runOutDate !== null && runOutDate < po.endDate;

  // Actual balance month by month from the PO start to now, then projected months until run-out or expiry.
  const series: BalancePoint[] = [];
  const currentKey = monthKey(today);
  let key = monthKey(po.startDate);
  let running = toPaise(po.amountExGst);
  let guard = 0;
  while (key <= currentKey && guard++ < 120) {
    running -= byMonth.get(key) ?? 0n;
    series.push({ month: key, label: monthLabel(key), balance: fromPaise(running > 0n ? running : 0n), projected: false });
    key = nextMonthKey(key);
  }
  const stopKey = runOutDate && runOutDate < po.endDate ? monthKey(runOutDate) : monthKey(po.endDate);
  let projected = balance.remaining;
  guard = 0;
  while (burn > 0n && projected > 0n && key <= stopKey && guard++ < 36) {
    projected = projected > burn ? projected - burn : 0n;
    series.push({ month: key, label: monthLabel(key), balance: fromPaise(projected), projected: true });
    key = nextMonthKey(key);
  }

  return { method, monthlyBurn: fromPaise(burn), runOutDate, daysToRunOut, runsOutBeforeExpiry, series };
}

export interface PoWarnings {
  /** Active and ending within `expiryDays`. */
  expiringSoon: boolean;
  /** Active and projected to run out before it ends, within `lowBalanceDays`. */
  runningLow: boolean;
  daysToExpiry: number;
}

/** The two warning flags shown beside a PO's status. Thresholds come from the alert settings. */
export function poWarnings(
  po: { status: PoStatusName; endDate: string },
  forecast: Pick<RunOutForecast, 'daysToRunOut' | 'runsOutBeforeExpiry'>,
  settings: { expiryDays: number; lowBalanceDays: number },
  today: string,
): PoWarnings {
  const daysToExpiry = daysBetween(today, po.endDate);
  const active = po.status === 'ACTIVE';
  return {
    expiringSoon: active && daysToExpiry >= 0 && daysToExpiry <= settings.expiryDays,
    runningLow:
      active && forecast.runsOutBeforeExpiry && forecast.daysToRunOut !== null && forecast.daysToRunOut <= settings.lowBalanceDays,
    daysToExpiry,
  };
}
