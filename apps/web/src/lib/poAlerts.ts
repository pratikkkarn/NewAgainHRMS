import { PurchaseOrder } from '../types/domain';
import { forecastRunOut } from './poForecast';
import { getDaysRemainingCalendar, formatDate } from './utils';

// PO alerts worked out from PO data and the admin's alert settings.
// In production the worker runs these rules daily at 09:00 IST and emails them;
// in the frontend they are computed live so the screens can be checked.

export type AlertType = 'expiry' | 'low_balance' | 'milestone' | 'exhausted' | 'expired';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertSettings {
  expiryDays: number; // warn this many days before the PO end date
  lowBalanceDays: number; // warn when the projected run-out is this close
  milestoneFirstDays: number; // first milestone reminder
  milestoneSecondDays: number; // second milestone reminder
  repeatWeekly: boolean; // expiry and low-balance alerts come back every week until resolved
  recipients: Record<AlertType, string[]>; // role ids
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  expiry: 'PO nearing expiry',
  low_balance: 'PO balance running low',
  milestone: 'Billing milestone due',
  exhausted: 'PO fully used',
  expired: 'PO expired',
};

// Defaults follow the notification table in the Architecture doc (section 10).
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  expiryDays: 60,
  lowBalanceDays: 60,
  milestoneFirstDays: 60,
  milestoneSecondDays: 7,
  repeatWeekly: true,
  recipients: {
    expiry: ['role-po-admin', 'role-project-manager', 'role-finance-manager', 'role-ceo', 'role-hr-head'],
    low_balance: ['role-po-admin', 'role-project-manager', 'role-finance-manager', 'role-ceo', 'role-hr-head'],
    milestone: ['role-po-admin', 'role-finance-manager', 'role-ceo', 'role-hr-head'],
    exhausted: ['role-po-admin', 'role-project-manager', 'role-ceo', 'role-hr-head'],
    expired: ['role-po-admin', 'role-project-manager', 'role-ceo', 'role-hr-head'],
  },
};

export function checkAlertSettings(s: AlertSettings): string | null {
  const days = [s.expiryDays, s.lowBalanceDays, s.milestoneFirstDays, s.milestoneSecondDays];
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) return 'Day values must be whole numbers from 1 to 365.';
  if (s.milestoneSecondDays >= s.milestoneFirstDays) return 'The second milestone reminder must come after the first.';
  const empty = (Object.keys(s.recipients) as AlertType[]).find((t) => s.recipients[t].length === 0);
  if (empty) return `"${ALERT_TYPE_LABELS[empty]}" needs at least one recipient role.`;
  return null;
}

export interface POAlert {
  id: string; // stable per occurrence, so "read" survives refreshes and weekly repeats come back unread
  type: AlertType;
  severity: AlertSeverity;
  poId: string;
  poNumber: string;
  projectName: string;
  title: string;
  message: string;
  date: string; // YYYY-MM-DD the alert relates to
  recipients: string[];
}

// ISO week key such as 2026-W42 (Monday-based), used to repeat alerts weekly.
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function buildPOAlerts(
  pos: PurchaseOrder[],
  settings: AlertSettings,
  today: Date = new Date()
): POAlert[] {
  const todayStr = isoDay(today);
  const week = settings.repeatWeekly ? `:${isoWeekKey(today)}` : '';
  const alerts: POAlert[] = [];

  pos
    .filter((po) => po.status !== 'Renewed' && po.status !== 'Closed')
    .forEach((po) => {
      const base = { poId: po.id, poNumber: po.poNumber, projectName: po.projectName || '' };
      const daysLeft = getDaysRemainingCalendar(po.expiryDate, today);

      if (daysLeft === null) return;

      if (po.remainingBalanceExclGst <= 0) {
        alerts.push({
          ...base,
          id: `exhausted:${po.id}`,
          type: 'exhausted',
          severity: 'critical',
          title: `${po.poNumber} is fully used`,
          message: `No balance left on ${po.poNumber} (${po.projectName}). Add a new PO to keep billing.`,
          date: todayStr,
          recipients: settings.recipients.exhausted,
        });
      } else if (daysLeft < 0) {
        alerts.push({
          ...base,
          id: `expired:${po.id}`,
          type: 'expired',
          severity: 'critical',
          title: `${po.poNumber} has expired`,
          message: `${po.poNumber} ended on ${formatDate(po.expiryDate)} with ${inr(po.remainingBalanceExclGst)} unbilled. Renew or close it.`,
          date: po.expiryDate,
          recipients: settings.recipients.expired,
        });
      } else if (daysLeft <= settings.expiryDays) {
        const isToday = daysLeft === 0;
        const title = isToday ? 'Purchase Order Expiring Today' : 'Purchase Order Expiring Soon';
        const projectDesc = po.projectName ? ` for ${po.projectName}` : '';
        const daysDesc = isToday ? 'expires today' : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
        const message = `${po.poNumber}${projectDesc} ${daysDesc}, on ${formatDate(po.expiryDate)}.`;

        alerts.push({
          ...base,
          id: `expiry:${po.id}${week}`,
          type: 'expiry',
          severity: daysLeft <= 14 ? 'critical' : 'warning',
          title,
          message,
          date: po.expiryDate,
          recipients: settings.recipients.expiry,
        });
      }
        const forecast = forecastRunOut(po, today);
        if (
          forecast.daysToRunOut !== null &&
          forecast.daysToRunOut <= settings.lowBalanceDays &&
          forecast.runsOutBeforeExpiry
        ) {
          alerts.push({
            ...base,
            id: `low_balance:${po.id}${week}`,
            type: 'low_balance',
            severity: forecast.daysToRunOut <= 14 ? 'critical' : 'warning',
            title: `${po.poNumber} balance runs out in about ${forecast.daysToRunOut} day(s)`,
            message: `Projected run-out ${forecast.runOutDate}, before the PO ends on ${po.expiryDate}. Remaining ${inr(po.remainingBalanceExclGst)}.`,
            date: forecast.runOutDate!,
            recipients: settings.recipients.low_balance,
          });
        }

      (po.billingMilestones || [])
        .filter((m) => m.status === 'Upcoming')
        .forEach((m) => {
          const due = getDaysRemainingCalendar(m.dueDate, today) ?? 999;
          if (due < 0 || due > settings.milestoneFirstDays) return;
          const second = due <= settings.milestoneSecondDays;
          alerts.push({
            ...base,
            id: `milestone:${m.id}:${second ? 'second' : 'first'}`,
            type: 'milestone',
            severity: second ? 'warning' : 'info',
            title: `Milestone "${m.title}" due in ${due} day(s)`,
            message: `${po.poNumber}: ${inr(m.amountExclGst)} to invoice by ${m.dueDate}.`,
            date: m.dueDate,
            recipients: settings.recipients.milestone,
          });
        });
    });

  const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.date < b.date ? -1 : 1));
}

// A user receives an alert when any of their roles is on its recipient list.
export function alertsForUser(alerts: POAlert[], roleIds: string[]): POAlert[] {
  return alerts.filter((a) => a.recipients.some((r) => roleIds.includes(r)));
}
