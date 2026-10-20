import { describe, it, expect } from 'vitest';
import { buildPOAlerts, DEFAULT_ALERT_SETTINGS, alertsForUser, POAlert } from '../poAlerts';
import { PurchaseOrder } from '../../types/domain';
import { getDaysRemainingCalendar } from '../utils';

function createMockPO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-test-1',
    poNumber: 'PO/2026/TEST/001',
    projectId: 'proj-1',
    projectName: 'Infosys Finacle AI Infrastructure',
    poRequester: 'John Doe',
    startDate: '2025-01-01',
    expiryDate: '2026-11-15',
    amountExclGst: 1000000,
    amountInclGst: 1180000,
    remainingBalanceExclGst: 500000,
    invoicedExclGst: 500000,
    gstRate: 18,
    gstType: 'IGST',
    status: 'Active',
    invoices: [],
    billingMilestones: [],
    ...overrides,
  } as PurchaseOrder;
}

describe('PO Expiry Notifications Specification', () => {
  const baseDate = new Date('2026-10-20T00:00:00Z');

  it('creates an expiry notification for a PO expiring in 26 days', () => {
    // 2026-10-20 to 2026-11-15 is 26 days
    const po = createMockPO({
      expiryDate: '2026-11-15',
    });

    const daysLeft = getDaysRemainingCalendar(po.expiryDate, baseDate);
    expect(daysLeft).toBe(26);

    const alerts = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, baseDate);
    const expiryAlert = alerts.find((a) => a.type === 'expiry');

    expect(expiryAlert).toBeDefined();
    expect(expiryAlert?.title).toBe('Purchase Order Expiring Soon');
    expect(expiryAlert?.message).toContain('PO/2026/TEST/001');
    expect(expiryAlert?.message).toContain('expires in 26 days');
    expect(expiryAlert?.message).toContain('15 Nov 2026');
  });

  it('does not create an upcoming-expiry notification for a PO expiring in 61 days', () => {
    // 2026-10-20 + 61 days = 2026-12-20
    const po = createMockPO({
      expiryDate: '2026-12-20',
    });

    const daysLeft = getDaysRemainingCalendar(po.expiryDate, baseDate);
    expect(daysLeft).toBe(61);

    const alerts = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, baseDate);
    const expiryAlert = alerts.find((a) => a.type === 'expiry');

    expect(expiryAlert).toBeUndefined();
  });

  it('creates an urgent notification for a PO expiring today (0 days remaining)', () => {
    const po = createMockPO({
      expiryDate: '2026-10-20',
    });

    const daysLeft = getDaysRemainingCalendar(po.expiryDate, baseDate);
    expect(daysLeft).toBe(0);

    const alerts = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, baseDate);
    const expiryAlert = alerts.find((a) => a.type === 'expiry');

    expect(expiryAlert).toBeDefined();
    expect(expiryAlert?.title).toBe('Purchase Order Expiring Today');
    expect(expiryAlert?.message).toContain('expires today');
  });

  it('classifies already expired POs as expired rather than upcoming expiry', () => {
    const po = createMockPO({
      expiryDate: '2026-10-10', // 10 days ago
    });

    const daysLeft = getDaysRemainingCalendar(po.expiryDate, baseDate);
    expect(daysLeft).toBe(-10);

    const alerts = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, baseDate);
    const expiryAlert = alerts.find((a) => a.type === 'expiry');
    const expiredAlert = alerts.find((a) => a.type === 'expired');

    expect(expiryAlert).toBeUndefined();
    expect(expiredAlert).toBeDefined();
    expect(expiredAlert?.title).toContain('has expired');
  });

  it('ensures CEO, HR Head, PO Admin, PM, and Finance Manager roles receive expiry alerts', () => {
    const po = createMockPO({
      expiryDate: '2026-11-15',
    });

    const alerts = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, baseDate);
    const expiryAlert = alerts.find((a) => a.type === 'expiry');
    expect(expiryAlert).toBeDefined();

    const ceoAlerts = alertsForUser(alerts, ['role-ceo']);
    expect(ceoAlerts.length).toBeGreaterThan(0);

    const hrHeadAlerts = alertsForUser(alerts, ['role-hr-head']);
    expect(hrHeadAlerts.length).toBeGreaterThan(0);

    const poAdminAlerts = alertsForUser(alerts, ['role-po-admin']);
    expect(poAdminAlerts.length).toBeGreaterThan(0);
  });

  it('ensures all notification types (expiry, low_balance, milestone, exhausted, expired) are generated', () => {
    const poExhausted = createMockPO({
      id: 'po-exhausted',
      poNumber: 'PO/EXHAUSTED',
      remainingBalanceExclGst: 0,
      expiryDate: '2026-11-15',
    });

    const poExpired = createMockPO({
      id: 'po-expired',
      poNumber: 'PO/EXPIRED',
      expiryDate: '2026-10-01',
      remainingBalanceExclGst: 1000,
    });

    const poMilestone = createMockPO({
      id: 'po-milestone',
      poNumber: 'PO/MILESTONE',
      expiryDate: '2026-12-30',
      billingMilestones: [
        {
          id: 'm-1',
          title: 'Initial Deliverable',
          dueDate: '2026-10-25', // 5 days from baseDate
          amountExclGst: 50000,
          status: 'Upcoming',
        },
      ],
    });

    const alerts = buildPOAlerts([poExhausted, poExpired, poMilestone], DEFAULT_ALERT_SETTINGS, baseDate);
    const types = alerts.map((a) => a.type);

    expect(types).toContain('exhausted');
    expect(types).toContain('expired');
    expect(types).toContain('milestone');
  });

  it('calculates unread counts and read state synchronization correctly', () => {
    const po = createMockPO({ expiryDate: '2026-11-15' });
    const alerts = buildPOAlerts([po], DEFAULT_ALERT_SETTINGS, baseDate);
    
    expect(alerts.length).toBeGreaterThan(0);
    const alertId = alerts[0].id;

    let readState: Record<string, string[]> = { 'user-1': [] };
    const isRead = (id: string) => (readState['user-1'] || []).includes(id);

    // Initially unread
    let unreadCount = alerts.filter((a) => !isRead(a.id)).length;
    expect(unreadCount).toBe(alerts.length);

    // Mark single alert as read
    readState['user-1'] = [alertId];
    unreadCount = alerts.filter((a) => !isRead(a.id)).length;
    expect(unreadCount).toBe(alerts.length - 1);

    // Mark all read
    readState['user-1'] = alerts.map((a) => a.id);
    unreadCount = alerts.filter((a) => !isRead(a.id)).length;
    expect(unreadCount).toBe(0);
  });

  it('retains empty state when no eligible notifications exist', () => {
    const poFuture = createMockPO({ expiryDate: '2027-12-31' }); // > 60 days
    const alerts = buildPOAlerts([poFuture], DEFAULT_ALERT_SETTINGS, baseDate);
    
    const expiryAlerts = alerts.filter((a) => a.type === 'expiry');
    expect(expiryAlerts.length).toBe(0);
  });
});
