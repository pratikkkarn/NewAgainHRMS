import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, financialYear, isIsoDate, monthsBetween, todayIst } from './dates.js';
import { checkUploadMeta, detectUploadKind, MAX_UPLOAD_BYTES } from './fileRules.js';
import { addGst, defaultGstType, rateToHundredths, splitGst } from './gst.js';
import {
  checkAmendment,
  checkCreditNote,
  checkInvoiceOverride,
  checkMilestone,
  computeBalance,
  derivePoStatus,
  forecastRunOut,
  poWarnings,
  renewalGapDays,
  type LedgerEntry,
} from './po.js';

const entry = (over: Partial<LedgerEntry> & { amountExGst: string }): LedgerEntry => ({
  type: 'INVOICE',
  status: 'ISSUED',
  billingMonth: '2026-01-01',
  ...over,
});

describe('dates (India time)', () => {
  it('works out "today" in IST, not UTC', () => {
    expect(todayIst(new Date('2026-03-31T17:00:00Z'))).toBe('2026-03-31'); // 10:30 pm IST
    expect(todayIst(new Date('2026-03-31T19:00:00Z'))).toBe('2026-04-01'); // 00:30 am IST next day
  });

  it('puts April to March in one financial year', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2027-02-01')).toBe('2026-27');
    expect(financialYear('2099-12-31')).toBe('2099-00');
  });

  it('counts days across a leap year and adds days', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-05-10', '2026-05-01')).toBe(-9);
  });

  it('counts months inclusively and validates dates', () => {
    expect(monthsBetween('2026-01-15', '2026-03-02')).toBe(3);
    expect(monthsBetween('2026-05-01', '2026-02-01')).toBe(1);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('28/02/2026')).toBe(false);
  });
});

describe('GST', () => {
  it('splits intra-state GST into equal halves', () => {
    expect(splitGst('1000.00', '18', 'CGST_SGST')).toEqual({ cgst: '90.00', sgst: '90.00', igst: '0.00', total: '180.00' });
  });

  it('puts the odd paisa on SGST so the halves always add up', () => {
    const split = splitGst('0.05', '18', 'CGST_SGST'); // 0.9 paise rounds to 1
    expect(split).toMatchObject({ cgst: '0.00', sgst: '0.01', total: '0.01' });
    const odd = splitGst('333.33', '18', 'CGST_SGST'); // 59.9994 rounds to 60.00
    expect(odd.total).toBe('60.00');
  });

  it('charges IGST on inter-state supplies and handles fractional rates', () => {
    expect(splitGst('1000.00', '18', 'IGST')).toMatchObject({ igst: '180.00', cgst: '0.00' });
    expect(splitGst('1000.00', '12.5', 'IGST').total).toBe('125.00');
    expect(rateToHundredths('12.5')).toBe(1250n);
    expect(addGst('100.00', '18')).toBe('118.00');
  });

  it('keeps the sign for credit amounts', () => {
    expect(splitGst('-1000.00', '18', 'CGST_SGST').total).toBe('-180.00');
  });

  it('pre-fills the type from the billing state', () => {
    expect(defaultGstType('29', '29')).toBe('CGST_SGST');
    expect(defaultGstType('27', '29')).toBe('IGST');
    expect(defaultGstType(null, '29')).toBe('CGST_SGST');
  });
});

describe('upload checks', () => {
  const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

  it('recognises files by content', () => {
    expect([detectUploadKind(pdf), detectUploadKind(png), detectUploadKind(jpg), detectUploadKind(exe)]).toEqual(['pdf', 'png', 'jpg', null]);
  });

  it('refuses a program renamed to .pdf, an empty file and a file over 10 MB', () => {
    expect(checkUploadMeta('invoice.pdf', 1000, exe)).toMatch(/Only PDF, JPG or PNG/);
    expect(checkUploadMeta('a.pdf', 0, pdf)).toMatch(/empty/);
    expect(checkUploadMeta('a.pdf', MAX_UPLOAD_BYTES + 1, pdf)).toMatch(/10 MB/);
  });

  it('catches a file whose name lies about its type, and accepts honest ones', () => {
    expect(checkUploadMeta('scan.png', 1000, pdf)).toMatch(/really a PDF/);
    expect(checkUploadMeta('scan.PDF', 1000, pdf)).toBeNull();
    expect(checkUploadMeta('photo.jpeg', 1000, jpg)).toBeNull();
    expect(checkUploadMeta('noextension', 1000, png)).toBeNull();
  });
});

describe('PO balance', () => {
  it('is the PO amount minus invoices plus credit notes, ignoring cancelled entries', () => {
    const balance = computeBalance('1000000.00', [
      entry({ amountExGst: '300000.00' }),
      entry({ amountExGst: '200000.00', status: 'PAID' }),
      entry({ amountExGst: '500000.00', status: 'CANCELLED' }),
      entry({ amountExGst: '50000.00', type: 'CREDIT_NOTE' }),
    ]);
    expect(balance).toMatchObject({ invoiced: 50000000n, creditNotes: 5000000n, remaining: 55000000n });
  });

  it('never shows a negative balance, but keeps the raw number after an override', () => {
    const balance = computeBalance('100.00', [entry({ amountExGst: '150.00' })]);
    expect(balance.remaining).toBe(0n);
    expect(balance.remainingRaw).toBe(-5000n);
  });

  it('adds up exactly where floats would drift', () => {
    const balance = computeBalance('0.30', [entry({ amountExGst: '0.10' }), entry({ amountExGst: '0.20' })]);
    expect(balance.remaining).toBe(0n);
  });
});

describe('PO status', () => {
  const balance = (remaining: bigint) => ({ invoiced: 0n, creditNotes: 0n, remainingRaw: remaining, remaining });

  it('moves between active, exhausted and expired', () => {
    expect(derivePoStatus('ACTIVE', balance(100n), '2026-12-31', '2026-06-01')).toBe('ACTIVE');
    expect(derivePoStatus('ACTIVE', balance(0n), '2026-12-31', '2026-06-01')).toBe('EXHAUSTED');
    expect(derivePoStatus('ACTIVE', balance(100n), '2026-05-31', '2026-06-01')).toBe('EXPIRED');
  });

  it('is still active on its last day', () => {
    expect(derivePoStatus('ACTIVE', balance(100n), '2026-06-01', '2026-06-01')).toBe('ACTIVE');
  });

  it('returns an exhausted PO to active when a credit note frees up balance', () => {
    expect(derivePoStatus('EXHAUSTED', balance(5000n), '2026-12-31', '2026-06-01')).toBe('ACTIVE');
  });

  it('keeps renewed and closed, which are decisions a person made', () => {
    expect(derivePoStatus('RENEWED', balance(0n), '2020-01-01', '2026-06-01')).toBe('RENEWED');
    expect(derivePoStatus('CLOSED', balance(100n), '2020-01-01', '2026-06-01')).toBe('CLOSED');
  });
});

describe('invoice, amendment, credit note and milestone checks', () => {
  const long = 'Client approved extra scope by email';

  it('allows an invoice within the balance and blocks one over it', () => {
    expect(checkInvoiceOverride(100000n, '1000.00', false, '')).toBeNull();
    expect(checkInvoiceOverride(100000n, '1000.01', false, '')).toMatch(/Only the CEO or a PO Admin can override/);
  });

  it('lets an authorised user override with a real reason, and no one else', () => {
    expect(checkInvoiceOverride(100000n, '2000.00', true, 'short')).toMatch(/at least 10 characters/);
    expect(checkInvoiceOverride(100000n, '2000.00', true, '   padded   ')).toMatch(/at least 10 characters/);
    expect(checkInvoiceOverride(100000n, '2000.00', true, long)).toBeNull();
    expect(checkInvoiceOverride(100000n, '2000.00', false, long)).not.toBeNull();
  });

  it('refuses zero and negative invoices', () => {
    expect(checkInvoiceOverride(100000n, '0.00', true, long)).toMatch(/greater than zero/);
    expect(checkInvoiceOverride(100000n, '-5.00', true, long)).toMatch(/greater than zero/);
  });

  it('blocks an amendment below what is already invoiced', () => {
    expect(checkAmendment(50000000n, '499999.99')).toMatch(/Active issued invoices total ₹5,00,000/);
    expect(checkAmendment(50000000n, '500000.00')).toBeNull();
    expect(checkAmendment(0n, '0.00')).toMatch(/greater than zero/);
  });

  it('lets a credit note through on an exhausted PO, up to the net invoiced amount', () => {
    const exhausted = computeBalance('1000.00', [entry({ amountExGst: '1000.00' })]);
    expect(exhausted.remaining).toBe(0n);
    expect(checkCreditNote(exhausted, '400.00')).toBeNull();
    expect(checkCreditNote(exhausted, '1000.01')).toMatch(/exceeds the net invoiced/);
    expect(checkCreditNote(computeBalance('1000.00', []), '10.00')).toMatch(/No active invoiced amount/);
  });

  it('counts earlier credit notes against the eligible amount', () => {
    const balance = computeBalance('1000.00', [entry({ amountExGst: '1000.00' }), entry({ amountExGst: '700.00', type: 'CREDIT_NOTE' })]);
    expect(checkCreditNote(balance, '300.00')).toBeNull();
    expect(checkCreditNote(balance, '300.01')).not.toBeNull();
  });

  it('keeps milestones inside the PO period', () => {
    const po = { startDate: '2026-01-01', endDate: '2026-12-31' };
    expect(checkMilestone(po, 'Phase 1', '2026-06-30', '1000.00')).toBeNull();
    expect(checkMilestone(po, 'Phase 1', '2025-12-31', '1000.00')).toMatch(/within the PO period/);
    expect(checkMilestone(po, 'Phase 1', '2027-01-01', '1000.00')).toMatch(/within the PO period/);
    expect(checkMilestone(po, '  ', '2026-06-30', '1000.00')).toMatch(/name/);
    expect(checkMilestone(po, 'Phase 1', '2026-06-30', '0.00')).toMatch(/greater than zero/);
    expect(checkMilestone(po, 'Phase 1', '2026-06-30', null)).toBeNull();
  });

  it('measures the gap between a PO and its renewal', () => {
    expect(renewalGapDays('2026-03-31', '2026-04-01')).toBe(0);
    expect(renewalGapDays('2026-03-31', '2026-04-11')).toBe(10);
    expect(renewalGapDays('2026-03-31', '2026-03-15')).toBe(0);
  });
});

describe('run-out forecast', () => {
  const po = { amountExGst: '120000.00', startDate: '2026-01-01', endDate: '2026-12-31' };

  it('assumes even spending when there are fewer than 2 invoiced months', () => {
    const forecast = forecastRunOut(po, [], '2026-03-15');
    expect(forecast.method).toBe('even-spend');
    expect(forecast.monthlyBurn).toBe('10000.00');
    expect(forecast.runsOutBeforeExpiry).toBe(false);
  });

  it('uses the average of the last 3 invoiced months once there are 2 or more', () => {
    const ledger = [
      entry({ amountExGst: '10000.00', billingMonth: '2026-01-01' }),
      entry({ amountExGst: '30000.00', billingMonth: '2026-02-01' }),
      entry({ amountExGst: '20000.00', billingMonth: '2026-03-01' }),
      entry({ amountExGst: '50000.00', billingMonth: '2026-04-01' }),
    ];
    const forecast = forecastRunOut(po, ledger, '2026-04-30');
    expect(forecast.method).toBe('recent-invoices');
    expect(forecast.monthlyBurn).toBe('33333.33'); // (30000 + 20000 + 50000) / 3, January dropped
  });

  it('flags a PO that will run out before it ends', () => {
    const ledger = [entry({ amountExGst: '40000.00', billingMonth: '2026-01-01' }), entry({ amountExGst: '40000.00', billingMonth: '2026-02-01' })];
    const forecast = forecastRunOut(po, ledger, '2026-02-28');
    expect(forecast.runsOutBeforeExpiry).toBe(true);
    expect(forecast.series.some((point) => point.projected)).toBe(true);
  });

  it('nets credit notes against invoices in their month', () => {
    const ledger = [
      entry({ amountExGst: '40000.00', billingMonth: '2026-01-01' }),
      entry({ amountExGst: '10000.00', billingMonth: '2026-01-01', type: 'CREDIT_NOTE' }),
      entry({ amountExGst: '20000.00', billingMonth: '2026-02-01' }),
    ];
    expect(forecastRunOut(po, ledger, '2026-02-28').monthlyBurn).toBe('25000.00'); // (30000 + 20000) / 2
  });

  it('reports an exhausted PO as run out today, with a flat-zero actual series', () => {
    const forecast = forecastRunOut(po, [entry({ amountExGst: '120000.00' })], '2026-03-10');
    expect(forecast).toMatchObject({ method: 'exhausted', runOutDate: '2026-03-10', daysToRunOut: 0 });
    expect(forecast.series.at(-1)?.balance).toBe('0.00');
  });

  it('handles a PO that has not started yet', () => {
    const forecast = forecastRunOut(po, [], '2025-11-01');
    expect(forecast.series.every((point) => point.projected)).toBe(true);
    expect(forecast.series[0]?.month).toBe('2026-01');
  });

  it('formats chart labels', () => {
    expect(forecastRunOut(po, [], '2026-03-15').series[0]).toMatchObject({ month: '2026-01', label: 'Jan 26', balance: '120000.00' });
  });
});

describe('warnings', () => {
  const settings = { expiryDays: 60, lowBalanceDays: 60 };
  const calm = { daysToRunOut: 400, runsOutBeforeExpiry: false };

  it('flags a PO ending within the expiry window, but not one already past', () => {
    expect(poWarnings({ status: 'ACTIVE', endDate: '2026-07-30' }, calm, settings, '2026-06-01').expiringSoon).toBe(true);
    expect(poWarnings({ status: 'ACTIVE', endDate: '2026-12-31' }, calm, settings, '2026-06-01').expiringSoon).toBe(false);
    expect(poWarnings({ status: 'ACTIVE', endDate: '2026-05-31' }, calm, settings, '2026-06-01').expiringSoon).toBe(false);
  });

  it('flags a PO projected to run out soon, only when it will do so before it ends', () => {
    const soon = { daysToRunOut: 30, runsOutBeforeExpiry: true };
    expect(poWarnings({ status: 'ACTIVE', endDate: '2026-12-31' }, soon, settings, '2026-06-01').runningLow).toBe(true);
    expect(poWarnings({ status: 'ACTIVE', endDate: '2026-12-31' }, { ...soon, runsOutBeforeExpiry: false }, settings, '2026-06-01').runningLow).toBe(false);
    expect(poWarnings({ status: 'ACTIVE', endDate: '2026-12-31' }, { daysToRunOut: 120, runsOutBeforeExpiry: true }, settings, '2026-06-01').runningLow).toBe(false);
  });

  it('shows no warnings on POs that are not active', () => {
    const soon = { daysToRunOut: 5, runsOutBeforeExpiry: true };
    for (const status of ['CLOSED', 'RENEWED', 'EXPIRED', 'EXHAUSTED'] as const) {
      expect(poWarnings({ status, endDate: '2026-06-10' }, soon, settings, '2026-06-01')).toMatchObject({ expiringSoon: false, runningLow: false });
    }
  });
});
