import { describe, it, expect } from 'vitest';
import { PurchaseOrder, Invoice } from '../../types/domain';
import { forecastRunOut, renewalGapDays, daysBetween } from '../../lib/poForecast';
import {
  DEFAULT_ALERT_SETTINGS,
  alertsForUser,
  buildPOAlerts,
  checkAlertSettings,
  isoWeekKey,
} from '../../lib/poAlerts';
import {
  parseCsv,
  rowsToRecords,
  parseDate,
  parseAmount,
  PO_COLUMNS,
  EMPLOYEE_COLUMNS,
  templateCsv,
  validatePORows,
  validateEmployeeRows,
} from '../../lib/dataImport';
import {
  checkNewPassword,
  failedPasswordRules,
  hashPassword,
  isLocked,
  minutesUntil,
} from '../../lib/passwordDemo';
import { canOpenTab } from '../../lib/navAccess';
import { checkInvoiceOverride, checkMilestone, recalculatePOBalances } from '../../lib/poUtils';
import { PermissionKey } from '../../types/access';
import { INITIAL_PROJECTS, INITIAL_EMPLOYEES } from '../mockData';

const TODAY = new Date('2026-10-15T09:00:00');

function invoice(month: string, amount: number, extra: Partial<Invoice> = {}): Invoice {
  return {
    id: `inv-${month}-${amount}`,
    poId: 'po-t',
    invoiceNumber: `INV-${month}`,
    invoiceDate: `${month}-28`,
    billingPeriodStart: `${month}-01`,
    billingPeriodEnd: `${month}-28`,
    amountExclGst: amount,
    gstRate: 18,
    gstAmount: amount * 0.18,
    totalAmountInclGst: amount * 1.18,
    status: 'Issued',
    ...extra,
  };
}

function makePO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return recalculatePOBalances({
    id: 'po-t',
    poNumber: 'PO/TEST/001',
    projectId: 'proj-1',
    projectName: 'Test Project',
    poRequester: 'Tester',
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    amountExclGst: 1_200_000,
    gstRate: 18,
    amountInclGst: 1_416_000,
    invoicedExclGst: 0,
    creditNotesExclGst: 0,
    remainingBalanceExclGst: 1_200_000,
    billingAddress: 'Bengaluru',
    shippingAddress: 'Bengaluru',
    status: 'Active',
    invoices: [],
    assignedEmployees: [],
    activityLogs: [],
    ...overrides,
  });
}

describe('Run-out forecast', () => {
  it('spreads the PO value evenly when fewer than 2 months are invoiced', () => {
    const f = forecastRunOut(makePO({ invoices: [invoice('2026-09', 100_000)] }), TODAY);
    expect(f.method).toBe('even-spend');
    expect(f.monthlyBurn).toBe(100_000); // 12,00,000 over 12 months
  });

  it('averages the last 3 invoiced months once there are at least 2', () => {
    const po = makePO({
      invoices: [
        invoice('2026-06', 50_000),
        invoice('2026-07', 100_000),
        invoice('2026-08', 200_000),
        invoice('2026-09', 300_000),
      ],
    });
    const f = forecastRunOut(po, TODAY);
    expect(f.method).toBe('recent-invoices');
    expect(f.monthlyBurn).toBe(200_000); // (100k + 200k + 300k) / 3
    // 5,50,000 left at 2,00,000 a month ≈ 2.75 months ≈ 84 days → 7 Jan 2027, after the 31 Dec end date
    expect(f.daysToRunOut).toBe(84);
    expect(f.runOutDate).toBe('2027-01-07');
    expect(f.runsOutBeforeExpiry).toBe(false);
  });

  it('subtracts credit notes and ignores cancelled invoices', () => {
    const po = makePO({
      invoices: [
        invoice('2026-08', 300_000),
        invoice('2026-08', 100_000, { id: 'cn', isCreditNote: true }),
        invoice('2026-09', 200_000),
        invoice('2026-09', 900_000, { id: 'x', status: 'Cancelled' }),
      ],
    });
    expect(forecastRunOut(po, TODAY).monthlyBurn).toBe(200_000);
  });

  it('reports a fully used PO as exhausted today', () => {
    const po = makePO({ invoices: [invoice('2026-08', 600_000), invoice('2026-09', 600_000)] });
    const f = forecastRunOut(po, TODAY);
    expect(f.method).toBe('exhausted');
    expect(f.daysToRunOut).toBe(0);
  });

  it('builds a balance series that ends in projected months', () => {
    const f = forecastRunOut(makePO({ invoices: [invoice('2026-08', 100_000), invoice('2026-09', 100_000)] }), TODAY);
    expect(f.series[0].month).toBe('2026-01');
    expect(f.series.some((p) => p.projected)).toBe(true);
    expect(f.series.find((p) => p.month === '2026-10')?.projected).toBe(false);
  });

  it('measures gaps between a PO and its renewal', () => {
    const oldPo = makePO({ expiryDate: '2026-06-30' });
    expect(renewalGapDays(oldPo, makePO({ startDate: '2026-07-01' }))).toBe(0);
    expect(renewalGapDays(oldPo, makePO({ startDate: '2026-07-11' }))).toBe(10);
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
  });
});

describe('PO alerts', () => {
  it('raises an expiry alert inside the window and none outside it', () => {
    const soon = makePO({ id: 'a', expiryDate: '2026-11-30' }); // 46 days away
    const later = makePO({ id: 'b', poNumber: 'PO/B', expiryDate: '2027-06-30' });
    const types = buildPOAlerts([soon, later], DEFAULT_ALERT_SETTINGS, TODAY).map((a) => `${a.poId}:${a.type}`);
    expect(types).toContain('a:expiry');
    expect(types).not.toContain('b:expiry');
  });

  it('respects a custom threshold', () => {
    const po = makePO({ expiryDate: '2026-11-30' });
    const alerts = buildPOAlerts([po], { ...DEFAULT_ALERT_SETTINGS, expiryDays: 30 }, TODAY);
    expect(alerts.some((a) => a.type === 'expiry')).toBe(false);
  });

  it('flags a projected run-out before expiry, and skips renewed or closed POs', () => {
    const burning = makePO({
      invoices: [invoice('2026-07', 300_000), invoice('2026-08', 300_000), invoice('2026-09', 300_000)],
    });
    expect(buildPOAlerts([burning], DEFAULT_ALERT_SETTINGS, TODAY).some((a) => a.type === 'low_balance')).toBe(true);
    expect(buildPOAlerts([{ ...burning, status: 'Closed' }], DEFAULT_ALERT_SETTINGS, TODAY)).toHaveLength(0);
    expect(buildPOAlerts([{ ...burning, status: 'Renewed' }], DEFAULT_ALERT_SETTINGS, TODAY)).toHaveLength(0);
  });

  it('sends milestone reminders twice: first at 60 days, then at 7 days', () => {
    const ms = (dueDate: string) =>
      makePO({ billingMilestones: [{ id: 'm1', title: 'UAT', dueDate, amountExclGst: 100_000, status: 'Upcoming' }] });
    const first = buildPOAlerts([ms('2026-11-20')], DEFAULT_ALERT_SETTINGS, TODAY).find((a) => a.type === 'milestone');
    const second = buildPOAlerts([ms('2026-10-20')], DEFAULT_ALERT_SETTINGS, TODAY).find((a) => a.type === 'milestone');
    expect(first?.id).toBe('milestone:m1:first');
    expect(second?.id).toBe('milestone:m1:second');
    expect(buildPOAlerts([ms('2027-03-01')], DEFAULT_ALERT_SETTINGS, TODAY).some((a) => a.type === 'milestone')).toBe(false);
  });

  it('repeats weekly alerts under a new id each week', () => {
    const po = makePO({ expiryDate: '2026-11-30' });
    const week1 = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, TODAY)[0].id;
    const week2 = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, new Date('2026-10-22T09:00:00'))[0].id;
    expect(week1).not.toBe(week2);
    const once = buildPOAlerts([po], { ...DEFAULT_ALERT_SETTINGS, repeatWeekly: false }, TODAY)[0].id;
    expect(once).toBe('expiry:po-t');
    expect(isoWeekKey(new Date('2026-10-15T09:00:00'))).toBe('2026-W42');
  });

  it('routes alerts to the configured roles only', () => {
    const alerts = buildPOAlerts([makePO({ expiryDate: '2026-11-30' })], DEFAULT_ALERT_SETTINGS, TODAY);
    expect(alertsForUser(alerts, ['role-po-admin'])).toHaveLength(1);
    expect(alertsForUser(alerts, ['role-hr-executive'])).toHaveLength(0);
  });

  it('validates alert settings', () => {
    expect(checkAlertSettings(DEFAULT_ALERT_SETTINGS)).toBeNull();
    expect(checkAlertSettings({ ...DEFAULT_ALERT_SETTINGS, milestoneSecondDays: 90 })).toMatch(/after the first/);
    expect(
      checkAlertSettings({ ...DEFAULT_ALERT_SETTINGS, recipients: { ...DEFAULT_ALERT_SETTINGS.recipients, expiry: [] } })
    ).toMatch(/at least one recipient/);
  });
});

describe('Spreadsheet import', () => {
  it('parses quoted CSV with commas, escaped quotes, CRLF and an Excel BOM', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""",3\r\n\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', '3'],
    ]);
  });

  it('matches headers loosely and reports missing required columns', () => {
    const ok = rowsToRecords(parseCsv(templateCsv(PO_COLUMNS)), PO_COLUMNS);
    expect(ok.missingColumns).toEqual([]);
    expect(ok.records[0].poNumber).toBe('PO/2026/HP/0101');
    const missing = rowsToRecords([['po_number', 'end date']], PO_COLUMNS);
    expect(missing.missingColumns).toContain('Project Code');
  });

  it('reads Indian date and amount formats and rejects impossible dates', () => {
    expect(parseDate('01/04/2026')).toBe('2026-04-01');
    expect(parseDate('2026-04-01')).toBe('2026-04-01');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseAmount('₹12,00,000')).toBe(1_200_000);
    expect(parseAmount('12abc')).toBeNull();
  });

  it('validates PO rows: unknown project, bad dates, duplicates', () => {
    const project = INITIAL_PROJECTS[0];
    const base = {
      poNumber: 'PO/NEW/1',
      projectCode: project.code,
      requester: 'A',
      startDate: '2026-04-01',
      expiryDate: '2027-03-31',
      amountExclGst: '500000',
      gstRate: '',
      sowNumber: '',
      billingAddress: 'Addr',
      shippingAddress: '',
      notes: '',
    };
    const results = validatePORows(
      [
        base,
        { ...base, poNumber: 'PO/NEW/2', projectCode: 'NOPE' },
        { ...base, poNumber: 'PO/NEW/3', expiryDate: '2026-01-01' },
        { ...base }, // duplicate of row 1 in the same file
      ],
      INITIAL_PROJECTS,
      []
    );
    expect(results[0].value?.gstRate).toBe(18);
    expect(results[0].value?.shippingAddress).toBe('Addr');
    expect(results[1].errors.join()).toMatch(/does not exist/);
    expect(results[2].errors.join()).toMatch(/after Start Date/);
    expect(results[3].errors.join()).toMatch(/more than once/);
    expect(results.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5]);
  });

  it('validates employee rows against existing employees', () => {
    const existing = INITIAL_EMPLOYEES[0];
    const results = validateEmployeeRows(
      [
        { employeeId: 'PS-900', name: 'New', email: 'new@ps.com', phone: '', designation: 'Dev', department: '', joiningDate: '02/06/2025', location: '', managerName: '' },
        { employeeId: existing.employeeId, name: 'Dup', email: 'dup@ps.com', phone: '', designation: 'Dev', department: '', joiningDate: '2025-06-02', location: '', managerName: '' },
      ],
      INITIAL_EMPLOYEES
    );
    expect(results[0].value?.joiningDate).toBe('2025-06-02');
    expect(results[1].errors.join()).toMatch(/already exists/);
    expect(EMPLOYEE_COLUMNS.filter((c) => c.required).length).toBe(5);
  });
});

describe('Passwords and lockout (demo)', () => {
  it('enforces the password rules and matching confirmation', () => {
    expect(failedPasswordRules('abc').length).toBeGreaterThan(0);
    expect(checkNewPassword('Str0ng!Pass', 'Str0ng!Pass')).toBeNull();
    expect(checkNewPassword('Str0ng!Pass', 'different')).toMatch(/do not match/);
    expect(checkNewPassword('weakpass', 'weakpass')).toMatch(/uppercase/);
  });

  it('hashes per account, never storing the password itself', async () => {
    const a = await hashPassword('a@ps.com', 'Str0ng!Pass');
    const b = await hashPassword('b@ps.com', 'Str0ng!Pass');
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Str0ng');
  });

  it('knows when a lock has expired', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    expect(isLocked('2026-10-15T10:15:00Z', now)).toBe(true);
    expect(isLocked('2026-10-15T09:59:00Z', now)).toBe(false);
    expect(minutesUntil('2026-10-15T10:15:00Z', now)).toBe(15);
  });
});

describe('Page access and PO rules', () => {
  const has = (keys: PermissionKey[]) => (k: PermissionKey) => keys.includes(k);

  it('opens a page only with one of its permissions', () => {
    expect(canOpenTab('dashboard', has([]))).toBe(true);
    expect(canOpenTab('po-tracker', has([]))).toBe(false);
    expect(canOpenTab('po-tracker', has(['po.view']))).toBe(true);
    expect(canOpenTab('users-roles', has(['audit.view']))).toBe(true);
    expect(canOpenTab('alert-settings', has(['po.edit']))).toBe(false);
    expect(canOpenTab('made-up-page', has(['po.view']))).toBe(false);
  });

  it('blocks over-balance invoices unless overridden with a reason', () => {
    const po = makePO();
    expect(checkInvoiceOverride(po, 100_000, false, '')).toBeNull();
    expect(checkInvoiceOverride(po, 2_000_000, false, 'long enough reason')).toMatch(/Only the CEO/);
    expect(checkInvoiceOverride(po, 2_000_000, true, 'short')).toMatch(/at least 10/);
    expect(checkInvoiceOverride(po, 2_000_000, true, 'Client approved increase by email')).toBeNull();
  });

  it('keeps milestones inside the PO period', () => {
    const po = makePO();
    expect(checkMilestone(po, 'UAT', '2026-06-01', 100)).toBeNull();
    expect(checkMilestone(po, 'UAT', '2027-02-01', 100)).toMatch(/within the PO period/);
    expect(checkMilestone(po, '', '2026-06-01', 100)).toMatch(/name/);
    expect(checkMilestone(po, 'UAT', '2026-06-01', 0)).toMatch(/greater than zero/);
  });
});
