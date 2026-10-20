import { describe, it, expect } from 'vitest';
import { getDaysRemainingCalendar, getExpiryCountdownLabel } from '../../lib/utils';
import { recalculatePOBalances } from '../../lib/poUtils';
import { PurchaseOrder } from '../../types/domain';

describe('Refined Expiring Soon Summary Card and Countdown Rules', () => {
  const refToday = '2026-10-20';

  const mockPO = (expiryDate: string, id = 'po-test'): PurchaseOrder => ({
    id,
    poNumber: `PO-${id}`,
    projectId: 'proj-1',
    projectName: 'Acme Cloud',
    poRequester: 'John Doe',
    startDate: '2026-01-01',
    expiryDate,
    amountExclGst: 100000,
    amountInclGst: 118000,
    gstRate: 18,
    remainingBalanceExclGst: 100000,
    invoicedExclGst: 0,
    creditNotesExclGst: 0,
    status: 'Active',
    invoices: [],
    billingAddress: '123 Tech Park',
    shippingAddress: '123 Tech Park',
    assignedEmployees: [],
    activityLogs: [],
  });

  function computeExpiringSoonSummary(pos: PurchaseOrder[], todayStr = refToday) {
    const list = pos
      .filter((p) => {
        if (p.status === 'Closed' || p.status === 'Renewed') return false;
        const days = getDaysRemainingCalendar(p.expiryDate, todayStr);
        return days !== null && days >= 0 && days <= 60;
      })
      .map((p) => ({ po: p, days: getDaysRemainingCalendar(p.expiryDate, todayStr)! }))
      .sort((a, b) => a.days - b.days);

    const count = list.length;
    const subtitle = 'Expiring within 60 days';
    let nearest = '';
    if (count > 0) {
      const minDays = list[0].days;
      if (minDays === 0) {
        nearest = 'Nearest: Expires today';
      } else if (minDays === 1) {
        nearest = 'Nearest: 1 day left';
      } else {
        nearest = `Nearest: ${minDays} days left`;
      }
    }

    return { count, subtitle, nearest, list };
  }

  it('1. Zero expiring POs: shows count 0, subtitle "Expiring within 60 days", and no fake nearest expiry', () => {
    const pos = [
      mockPO('2026-12-20', 'po-1'), // 61 days -> Active
      mockPO('2026-10-19', 'po-2'), // -1 days -> Expired
    ].map(recalculatePOBalances);

    const summary = computeExpiringSoonSummary(pos);
    expect(summary.count).toBe(0);
    expect(summary.subtitle).toBe('Expiring within 60 days');
    expect(summary.nearest).toBe('');
  });

  it('2. One expiring PO in 26 days: shows count 1 and "Nearest: 26 days left"', () => {
    const pos = [
      mockPO('2026-11-15', 'po-1'), // 26 days
      mockPO('2026-12-20', 'po-2'), // 61 days
    ].map(recalculatePOBalances);

    const summary = computeExpiringSoonSummary(pos);
    expect(summary.count).toBe(1);
    expect(summary.nearest).toBe('Nearest: 26 days left');
  });

  it('3. One expiring PO expiring today: shows count 1 and "Nearest: Expires today"', () => {
    const pos = [
      mockPO('2026-10-20', 'po-1'), // 0 days
    ].map(recalculatePOBalances);

    const summary = computeExpiringSoonSummary(pos);
    expect(summary.count).toBe(1);
    expect(summary.nearest).toBe('Nearest: Expires today');
  });

  it('4. Multiple expiring POs: shows total count and ONLY the nearest expiry indicator', () => {
    const pos = [
      mockPO('2026-10-25', 'po-1'), // 5 days
      mockPO('2026-11-15', 'po-2'), // 26 days
      mockPO('2026-12-04', 'po-3'), // 45 days
    ].map(recalculatePOBalances);

    const summary = computeExpiringSoonSummary(pos);
    expect(summary.count).toBe(3);
    expect(summary.nearest).toBe('Nearest: 5 days left');
  });

  it('5. Large set with 10 expiring POs: displays count 10 and ONLY nearest expiry without clutter', () => {
    const daysOffsetList = [2, 5, 12, 18, 25, 30, 40, 45, 50, 58];
    const pos = daysOffsetList.map((d, idx) => {
      const dt = new Date('2026-10-20T00:00:00Z');
      dt.setUTCDate(dt.getUTCDate() + d);
      return mockPO(dt.toISOString().split('T')[0], `po-${idx + 1}`);
    }).map(recalculatePOBalances);

    const summary = computeExpiringSoonSummary(pos);
    expect(summary.count).toBe(10);
    expect(summary.nearest).toBe('Nearest: 2 days left');
  });

  it('6. Verify individual PO countdown labels in Period column', () => {
    expect(getExpiryCountdownLabel('2026-12-31', refToday)).toBe('72 days left');
    expect(getExpiryCountdownLabel('2026-11-15', refToday)).toBe('Ends in 26 days');
    expect(getExpiryCountdownLabel('2026-10-20', refToday)).toBe('Expires today');
    expect(getExpiryCountdownLabel('2026-10-17', refToday)).toBe('Expired 3 days ago');
  });
});
