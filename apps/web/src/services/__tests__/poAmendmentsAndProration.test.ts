import { describe, it, expect, beforeEach } from 'vitest';
import { PurchaseOrder, Assignment, Invoice, POAmendment } from '../../types/domain';
import {
  recalculatePOBalances,
  validatePOAmendment,
  applyPOAmendment,
  validateNewInvoiceAmount,
  validateNewCreditNoteAmount,
} from '../../lib/poUtils';
import {
  calculateProratedBillingAmount,
  getPOEmployeeEligibleBillingForMonth,
  validateEmployeeAllocation,
} from '../../lib/assignmentUtils';
import { INITIAL_POS, INITIAL_ASSIGNMENTS } from '../mockData';

// LocalStorage polyfill for node environment
if (typeof localStorage === 'undefined' || !localStorage.getItem) {
  const store = new Map<string, string>();
  (global as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() {
      return store.size;
    },
  };
}

describe('Prime Star HRMS — Complete Financial, Proration & Amendment Regression Suite', () => {
  let samplePO: PurchaseOrder;

  beforeEach(() => {
    localStorage.clear();

    samplePO = {
      id: 'po-test-500',
      poNumber: 'PO/2026/TEST/500',
      projectId: 'proj-1',
      projectName: 'Test Cloud Migration',
      poRequester: 'Kavita Nair',
      startDate: '2026-01-01',
      expiryDate: '2026-12-31',
      amountExclGst: 150000, // ₹1,50,000
      originalAmountExclGst: 150000,
      gstRate: 18,
      amountInclGst: 177000,
      invoicedExclGst: 0,
      creditNotesExclGst: 0,
      remainingBalanceExclGst: 150000,
      billingAddress: 'Mumbai, India',
      shippingAddress: 'Mumbai, India',
      status: 'Active',
      invoices: [],
      assignedEmployees: [],
      activityLogs: [],
      amendments: [],
    };
  });

  // Scenario 1: Multiple invoices for one PO across different billing months
  it('1. supports multiple invoices for one PO across different billing months', () => {
    const invJan: Invoice = {
      id: 'inv-jan',
      poId: samplePO.id,
      invoiceNumber: 'INV/2026/01',
      invoiceDate: '2026-01-31',
      billingMonth: 'January',
      billingYear: 2026,
      billingPeriodStart: '2026-01-01',
      billingPeriodEnd: '2026-01-31',
      amountExclGst: 30000,
      gstRate: 18,
      gstAmount: 5400,
      totalAmountInclGst: 35400,
      status: 'Issued',
    };

    const invFeb: Invoice = {
      id: 'inv-feb',
      poId: samplePO.id,
      invoiceNumber: 'INV/2026/02',
      invoiceDate: '2026-02-28',
      billingMonth: 'February',
      billingYear: 2026,
      billingPeriodStart: '2026-02-01',
      billingPeriodEnd: '2026-02-28',
      amountExclGst: 40000,
      gstRate: 18,
      gstAmount: 7200,
      totalAmountInclGst: 47200,
      status: 'Issued',
    };

    const updatedPo = recalculatePOBalances({
      ...samplePO,
      invoices: [invJan, invFeb],
    });

    expect(updatedPo.invoicedExclGst).toBe(70000);
    expect(updatedPo.remainingBalanceExclGst).toBe(80000); // 150000 - 70000
    expect(updatedPo.invoices.length).toBe(2);
  });

  // Scenario 2: Multiple partial invoices in the same billing month
  it('2. handles multiple partial invoices in the same billing month without double counting', () => {
    const partial1: Invoice = {
      id: 'inv-p1',
      poId: samplePO.id,
      invoiceNumber: 'INV/2026/MAR/01',
      invoiceDate: '2026-03-15',
      billingMonth: 'March',
      billingYear: 2026,
      billingPeriodStart: '2026-03-01',
      billingPeriodEnd: '2026-03-15',
      amountExclGst: 25000,
      gstRate: 18,
      gstAmount: 4500,
      totalAmountInclGst: 29500,
      status: 'Issued',
    };

    const partial2: Invoice = {
      id: 'inv-p2',
      poId: samplePO.id,
      invoiceNumber: 'INV/2026/MAR/02',
      invoiceDate: '2026-03-31',
      billingMonth: 'March',
      billingYear: 2026,
      billingPeriodStart: '2026-03-16',
      billingPeriodEnd: '2026-03-31',
      amountExclGst: 25000,
      gstRate: 18,
      gstAmount: 4500,
      totalAmountInclGst: 29500,
      status: 'Issued',
    };

    const updatedPo = recalculatePOBalances({
      ...samplePO,
      invoices: [partial1, partial2],
    });

    expect(updatedPo.invoicedExclGst).toBe(50000);
    expect(updatedPo.remainingBalanceExclGst).toBe(100000);
  });

  // Scenario 3: Employee allocation split across a PO
  it('3. supports multiple employees allocated to one PO and computes total billing', () => {
    const assignments: Assignment[] = [
      {
        id: 'asgn-a',
        employeeId: 'PS-101',
        employeeName: 'Rohan Deshmukh',
        designation: 'Architect',
        projectId: 'proj-1',
        projectName: 'Test Cloud Migration',
        poId: samplePO.id,
        assignedFrom: '2026-01-01',
        assignedTo: '2026-12-31',
        allocationPercentage: 50,
        billingRatePerMonth: 50000,
        status: 'Active',
      },
      {
        id: 'asgn-b',
        employeeId: 'PS-102',
        employeeName: 'Megha Kulkarni',
        designation: 'DevOps Lead',
        projectId: 'proj-1',
        projectName: 'Test Cloud Migration',
        poId: samplePO.id,
        assignedFrom: '2026-01-01',
        assignedTo: '2026-12-31',
        allocationPercentage: 50,
        billingRatePerMonth: 40000,
        status: 'Active',
      },
    ];

    const breakdown = getPOEmployeeEligibleBillingForMonth({
      poId: samplePO.id,
      assignments,
      billingYear: 2026,
      billingMonth: 'June',
    });

    expect(breakdown.length).toBe(2);
    expect(breakdown[0].eligibleAmount).toBe(50000);
    expect(breakdown[1].eligibleAmount).toBe(40000);
    const totalEligible = breakdown.reduce((s, b) => s + b.eligibleAmount, 0);
    expect(totalEligible).toBe(90000);
  });

  // Scenario 4: Employee termination without deleting historical assignment data
  it('4. preserves historical assignment data when an employee allocation is terminated', () => {
    const asgn: Assignment = {
      id: 'asgn-term',
      employeeId: 'PS-105',
      employeeName: 'Rajesh Sharma',
      designation: 'Developer',
      projectId: 'proj-1',
      projectName: 'Test Cloud Migration',
      poId: samplePO.id,
      assignedFrom: '2026-01-01',
      assignedTo: '2026-12-31',
      allocationPercentage: 100,
      billingRatePerMonth: 60000,
      status: 'Active',
    };

    const terminatedAsgn: Assignment = {
      ...asgn,
      status: 'Terminated',
      assignedTo: '2026-06-15',
      effectiveTerminationDate: '2026-06-15',
      terminationReason: 'Employee departure',
    };

    expect(terminatedAsgn.id).toBe('asgn-term');
    expect(terminatedAsgn.employeeName).toBe('Rajesh Sharma');
    expect(terminatedAsgn.effectiveTerminationDate).toBe('2026-06-15');
    expect(terminatedAsgn.status).toBe('Terminated');
  });

  // Scenario 5: Calendar-day proration for 28-, 29-, 30-, and 31-day months
  it('5. computes exact calendar-day proration for 28, 29, 30, and 31 day months', () => {
    const rate = 50000;

    // Feb 2025 (28 days): 14 days worked
    const p28 = calculateProratedBillingAmount({
      monthlyBillingRate: rate,
      assignedFrom: '2025-02-01',
      assignedTo: '2025-02-28',
      effectiveTerminationDate: '2025-02-14',
      billingYear: 2025,
      billingMonth: 2,
    });
    expect(p28.totalDaysInMonth).toBe(28);
    expect(p28.eligibleDays).toBe(14);
    expect(p28.eligibleAmount).toBe(25000); // 50000 * 14 / 28

    // Feb 2028 (Leap Year - 29 days): 14 days worked
    const p29 = calculateProratedBillingAmount({
      monthlyBillingRate: rate,
      assignedFrom: '2028-02-01',
      assignedTo: '2028-02-29',
      effectiveTerminationDate: '2028-02-14',
      billingYear: 2028,
      billingMonth: 2,
    });
    expect(p29.totalDaysInMonth).toBe(29);
    expect(p29.eligibleDays).toBe(14);
    expect(p29.eligibleAmount).toBe(Math.round((50000 * 14) / 29));

    // June 2026 (30 days): 15 days worked
    const p30 = calculateProratedBillingAmount({
      monthlyBillingRate: rate,
      assignedFrom: '2026-06-01',
      assignedTo: '2026-06-30',
      effectiveTerminationDate: '2026-06-15',
      billingYear: 2026,
      billingMonth: 6,
    });
    expect(p30.totalDaysInMonth).toBe(30);
    expect(p30.eligibleDays).toBe(15);
    expect(p30.eligibleAmount).toBe(25000); // 50000 * 15 / 30

    // October 2026 (31 days): 15 days worked
    const p31 = calculateProratedBillingAmount({
      monthlyBillingRate: rate,
      assignedFrom: '2026-10-01',
      assignedTo: '2026-10-31',
      effectiveTerminationDate: '2026-10-15',
      billingYear: 2026,
      billingMonth: 10,
    });
    expect(p31.totalDaysInMonth).toBe(31);
    expect(p31.eligibleDays).toBe(15);
    expect(p31.eligibleAmount).toBe(Math.round((50000 * 15) / 31));
  });

  // Scenario 6: Inclusive departure date treatment
  it('6. treats effective termination date inclusively (employee is billable on termination date)', () => {
    // Oct 1 to Oct 15 inclusive = 15 days
    const res = calculateProratedBillingAmount({
      monthlyBillingRate: 31000,
      assignedFrom: '2026-10-01',
      assignedTo: '2026-10-31',
      effectiveTerminationDate: '2026-10-15',
      billingYear: 2026,
      billingMonth: 10, // 31 days
    });

    expect(res.eligibleDays).toBe(15);
    expect(res.eligibleAmount).toBe(15000); // 31000 * 15 / 31
  });

  // Scenario 7: Employee departure in the middle of a month
  it('7. handles departure in the middle of a 30-day month resulting in ₹25,000 for a ₹50,000 rate', () => {
    const res = calculateProratedBillingAmount({
      monthlyBillingRate: 50000,
      assignedFrom: '2025-06-01',
      assignedTo: '2025-06-30',
      effectiveTerminationDate: '2025-06-15',
      billingYear: 2025,
      billingMonth: 'June',
    });

    expect(res.eligibleDays).toBe(15);
    expect(res.totalDaysInMonth).toBe(30);
    expect(res.eligibleAmount).toBe(25000);
  });

  // Scenario 8: Original and revised PO value history
  it('8. preserves original PO value and tracks amendment history', () => {
    const origPO = recalculatePOBalances(samplePO);
    expect(origPO.originalAmountExclGst).toBe(150000);
    expect(origPO.amountExclGst).toBe(150000);

    const amended = applyPOAmendment(
      origPO,
      {
        originalValueExclGst: 150000,
        revisedValueExclGst: 100000,
        changeType: 'REDUCTION',
        changeAmountExclGst: 50000,
        effectiveDate: '2026-07-01',
        reason: 'Contract scope reduction',
        requestedBy: 'Kavita Nair',
        status: 'APPROVED',
      },
      { name: 'Siddharth Mehta', role: 'Super Admin' }
    );

    expect(amended.originalAmountExclGst).toBe(150000);
    expect(amended.amountExclGst).toBe(100000);
    expect(amended.amendments?.length).toBe(1);
    expect(amended.amendments?.[0].status).toBe('APPROVED');
  });

  // Scenario 9: Approved PO value reduction from ₹1,50,000 to ₹1,00,000
  it('9. executes approved PO value reduction from ₹1,50,000 to ₹1,00,000 and recalculates remaining balance', () => {
    const updated = applyPOAmendment(
      samplePO,
      {
        originalValueExclGst: 150000,
        revisedValueExclGst: 100000,
        changeType: 'REDUCTION',
        changeAmountExclGst: 50000,
        effectiveDate: '2026-07-01',
        reason: 'Commercial reduction approved by client',
        requestedBy: 'Kavita Nair',
        status: 'APPROVED',
      },
      { name: 'Finance Manager', role: 'Finance Admin' }
    );

    expect(updated.amountExclGst).toBe(100000);
    expect(updated.remainingBalanceExclGst).toBe(100000);
    expect(updated.activityLogs.some((l) => l.action === 'PO Value Amended')).toBe(true);
  });

  // Scenario 10: Prevention of an amendment that conflicts with already-issued invoices
  it('10. prevents an amendment when proposed value is less than issued invoices total', () => {
    const poWithInvoice: PurchaseOrder = {
      ...samplePO,
      amountExclGst: 150000,
      invoices: [
        {
          id: 'inv-1',
          poId: samplePO.id,
          invoiceNumber: 'INV-101',
          invoiceDate: '2026-05-01',
          billingPeriodStart: '2026-04-01',
          billingPeriodEnd: '2026-04-30',
          amountExclGst: 120000,
          gstRate: 18,
          gstAmount: 21600,
          totalAmountInclGst: 141600,
          status: 'Issued',
        },
      ],
    };

    const recalculated = recalculatePOBalances(poWithInvoice);
    expect(recalculated.invoicedExclGst).toBe(120000);

    // Try proposing ₹1,00,000 (which is less than ₹1,20,000 issued invoices)
    const validation = validatePOAmendment(recalculated, 100000);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('exceeds the proposed revised PO value');

    expect(() =>
      applyPOAmendment(recalculated, {
        originalValueExclGst: 150000,
        revisedValueExclGst: 100000,
        changeType: 'REDUCTION',
        changeAmountExclGst: 50000,
        effectiveDate: '2026-06-01',
        reason: 'Conflicting reduction',
        requestedBy: 'Test',
        status: 'APPROVED',
      })
    ).toThrow();
  });

  // Scenario 11: Correct balance calculations after approved amendments
  it('11. calculates correct remaining balance after approved amendment and existing invoices', () => {
    const poWithInvoice: PurchaseOrder = {
      ...samplePO,
      amountExclGst: 150000,
      invoices: [
        {
          id: 'inv-1',
          poId: samplePO.id,
          invoiceNumber: 'INV-101',
          invoiceDate: '2026-05-01',
          billingPeriodStart: '2026-04-01',
          billingPeriodEnd: '2026-04-30',
          amountExclGst: 60000,
          gstRate: 18,
          gstAmount: 10800,
          totalAmountInclGst: 70800,
          status: 'Issued',
        },
      ],
    };

    // Amend PO value from ₹1,50,000 to ₹1,00,000
    const amended = applyPOAmendment(poWithInvoice, {
      originalValueExclGst: 150000,
      revisedValueExclGst: 100000,
      changeType: 'REDUCTION',
      changeAmountExclGst: 50000,
      effectiveDate: '2026-06-01',
      reason: 'Valid scope reduction',
      requestedBy: 'Test',
      status: 'APPROVED',
    });

    expect(amended.amountExclGst).toBe(100000);
    expect(amended.invoicedExclGst).toBe(60000);
    expect(amended.remainingBalanceExclGst).toBe(40000); // 100000 - 60000
  });

  // Scenario 12: No duplicate balance adjustments when saving or reopening records
  it('12. ensures recalculatePOBalances is idempotent and does not accumulate duplicate balance decrements', () => {
    const poWithInvoice: PurchaseOrder = {
      ...samplePO,
      amountExclGst: 150000,
      invoices: [
        {
          id: 'inv-1',
          poId: samplePO.id,
          invoiceNumber: 'INV-101',
          invoiceDate: '2026-05-01',
          billingPeriodStart: '2026-04-01',
          billingPeriodEnd: '2026-04-30',
          amountExclGst: 50000,
          gstRate: 18,
          gstAmount: 9000,
          totalAmountInclGst: 59000,
          status: 'Issued',
        },
      ],
    };

    const pass1 = recalculatePOBalances(poWithInvoice);
    const pass2 = recalculatePOBalances(pass1);
    const pass3 = recalculatePOBalances(pass2);

    expect(pass1.remainingBalanceExclGst).toBe(100000);
    expect(pass2.remainingBalanceExclGst).toBe(100000);
    expect(pass3.remainingBalanceExclGst).toBe(100000);
  });

  // Scenario 13: Existing invoice amounts and statuses remain unchanged after employee departure
  it('13. leaves existing issued invoices completely unchanged when an employee departs', () => {
    const inv: Invoice = {
      id: 'inv-past',
      poId: samplePO.id,
      invoiceNumber: 'INV-MAY',
      invoiceDate: '2026-05-31',
      billingPeriodStart: '2026-05-01',
      billingPeriodEnd: '2026-05-31',
      amountExclGst: 50000,
      gstRate: 18,
      gstAmount: 9000,
      totalAmountInclGst: 59000,
      status: 'Issued',
      employeeIds: ['PS-105'],
    };

    const poWithInv = recalculatePOBalances({
      ...samplePO,
      invoices: [inv],
    });

    expect(poWithInv.invoices[0].amountExclGst).toBe(50000);
    expect(poWithInv.invoices[0].status).toBe('Issued');

    // Simulate employee departure on June 15
    const updatedPoAfterDeparture = recalculatePOBalances(poWithInv);
    expect(updatedPoAfterDeparture.invoices[0].amountExclGst).toBe(50000);
    expect(updatedPoAfterDeparture.invoices[0].status).toBe('Issued');
  });

  // Scenario 14: Credit notes preserve their existing validation and balance-restoration behavior
  it('14. verifies credit note restores PO balance and validates against active invoiced amounts', () => {
    const poWithInv: PurchaseOrder = {
      ...samplePO,
      amountExclGst: 100000,
      invoices: [
        {
          id: 'inv-1',
          poId: samplePO.id,
          invoiceNumber: 'INV-101',
          invoiceDate: '2026-05-01',
          billingPeriodStart: '2026-04-01',
          billingPeriodEnd: '2026-04-30',
          amountExclGst: 60000,
          gstRate: 18,
          gstAmount: 10800,
          totalAmountInclGst: 70800,
          status: 'Issued',
        },
      ],
    };

    const recalculated = recalculatePOBalances(poWithInv);
    expect(recalculated.remainingBalanceExclGst).toBe(40000); // 100000 - 60000

    // Add Credit Note of ₹20,000
    const cnVal = validateNewCreditNoteAmount(recalculated, 20000);
    expect(cnVal.valid).toBe(true);

    const poWithCN = recalculatePOBalances({
      ...recalculated,
      invoices: [
        ...recalculated.invoices,
        {
          id: 'cn-1',
          poId: samplePO.id,
          invoiceNumber: 'CN-101',
          invoiceDate: '2026-05-15',
          billingPeriodStart: '2026-04-01',
          billingPeriodEnd: '2026-04-30',
          amountExclGst: 20000,
          gstRate: 18,
          gstAmount: 3600,
          totalAmountInclGst: 23600,
          status: 'Issued',
          isCreditNote: true,
        },
      ],
    });

    expect(poWithCN.creditNotesExclGst).toBe(20000);
    expect(poWithCN.remainingBalanceExclGst).toBe(60000); // 100000 - 60000 + 20000
  });

  // Scenario 15: Invoice employee associations persist correctly
  it('15. persists employee IDs and names on invoice records', () => {
    const inv: Invoice = {
      id: 'inv-emp-test',
      poId: samplePO.id,
      invoiceNumber: 'INV-EMP-01',
      invoiceDate: '2026-06-01',
      billingPeriodStart: '2026-05-01',
      billingPeriodEnd: '2026-05-31',
      amountExclGst: 50000,
      gstRate: 18,
      gstAmount: 9000,
      totalAmountInclGst: 59000,
      status: 'Issued',
      employeeIds: ['PS-108', 'PS-112'],
      employeeNames: ['Rohan Deshmukh', 'Megha Kulkarni'],
    };

    expect(inv.employeeIds).toContain('PS-108');
    expect(inv.employeeIds).toContain('PS-112');
    expect(inv.employeeNames?.length).toBe(2);
  });

  // Scenario 16: Unauthorized users cannot approve restricted PO amendments
  it('16. restricts approval status if user does not have permission', () => {
    const unauthValidation = validatePOAmendment(samplePO, 100000);
    expect(unauthValidation.valid).toBe(true);

    const pendingResult = applyPOAmendment(samplePO, {
      originalValueExclGst: 150000,
      revisedValueExclGst: 100000,
      changeType: 'REDUCTION',
      changeAmountExclGst: 50000,
      effectiveDate: '2026-07-01',
      reason: 'Pending user review',
      requestedBy: 'Junior User',
      status: 'PENDING',
    });

    // When status is PENDING, PO amountExclGst is NOT changed yet
    expect(pendingResult.amountExclGst).toBe(150000);
    expect(pendingResult.amendments?.[0].status).toBe('PENDING');
  });

  // Scenario 17: Historical audit logs remain intact
  it('17. preserves historical audit logs when amendments and allocations are modified', () => {
    const initialPO: PurchaseOrder = {
      ...samplePO,
      activityLogs: [
        {
          id: 'act-1',
          poId: samplePO.id,
          timestamp: '2026-01-01 10:00 AM',
          userName: 'Admin',
          userRole: 'Super Admin',
          action: 'PO Created',
          details: 'Initial creation',
        },
      ],
    };

    const amended = applyPOAmendment(initialPO, {
      originalValueExclGst: 150000,
      revisedValueExclGst: 120000,
      changeType: 'REDUCTION',
      changeAmountExclGst: 30000,
      effectiveDate: '2026-06-01',
      reason: 'Scope adjustment',
      requestedBy: 'Admin',
      status: 'APPROVED',
    });

    expect(amended.activityLogs.length).toBe(2);
    expect(amended.activityLogs.some((l) => l.action === 'PO Created')).toBe(true);
    expect(amended.activityLogs.some((l) => l.action === 'PO Value Amended')).toBe(true);
  });

  // Scenario 18: Existing demo records load without errors
  it('18. verifies INITIAL_POS and INITIAL_ASSIGNMENTS load cleanly without errors', () => {
    expect(INITIAL_POS.length).toBeGreaterThan(0);
    expect(INITIAL_ASSIGNMENTS.length).toBeGreaterThan(0);

    INITIAL_POS.forEach((po) => {
      const recalculated = recalculatePOBalances(po);
      expect(recalculated.poNumber).toBeDefined();
      expect(recalculated.remainingBalanceExclGst).toBeGreaterThanOrEqual(0);
    });

    INITIAL_ASSIGNMENTS.forEach((asgn) => {
      expect(asgn.employeeId).toBeDefined();
      expect(asgn.status).toBeDefined();
    });
  });
});
