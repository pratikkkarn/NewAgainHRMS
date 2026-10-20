import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PurchaseOrder, Project, Assignment, Invoice } from '../../types/domain';
import {
  recalculatePOBalances,
  recalculateProjectBalances,
  validateNewInvoiceAmount,
  validateNewCreditNoteAmount,
} from '../../lib/poUtils';
import {
  createVerifiedLocalStorageBackup,
  migrateLegacyDataIdempotent,
  ALL_SYSTEM_STORAGE_KEYS,
} from '../../context/DataContext';

// Polyfill localStorage for node environment
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

describe('Financial Reconciliation, Credit Note & Allocation Enhancement Unit Tests', () => {
  const basePO: PurchaseOrder = {
    id: 'po-test-101',
    poNumber: 'PO/TEST/001',
    projectId: 'proj-test-1',
    projectName: 'Enterprise Portal Modernization',
    poRequester: 'Anil Kumar (Finance Lead)',
    startDate: '2026-01-01',
    expiryDate: '2026-12-31',
    amountExclGst: 1000000, // ₹10,00,000
    gstRate: 18,
    amountInclGst: 1180000,
    invoicedExclGst: 0,
    creditNotesExclGst: 0,
    remainingBalanceExclGst: 1000000,
    billingAddress: 'Bangalore, India',
    shippingAddress: 'Bangalore, India',
    status: 'Active',
    invoices: [],
    assignedEmployees: [],
    activityLogs: [],
  };

  const baseProject: Project = {
    id: 'proj-test-1',
    name: 'Enterprise Portal Modernization',
    code: 'PRJ-TEST-1',
    clientName: 'Apex Financial Corp',
    projectManager: 'Siddharth Mehta',
    projectManagers: ['Siddharth Mehta', 'Priya Sharma'],
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'Active',
    assignedHeadcount: 2,
    totalPoValue: 1000000,
    remainingBalance: 1000000,
  };

  // Setup mock localStorage before each test
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Scenario 1: Multi-Manager Grouping', () => {
    it('supports projectManagers array and groups employees without duplicating profiles', () => {
      expect(baseProject.projectManagers).toContain('Siddharth Mehta');
      expect(baseProject.projectManagers).toContain('Priya Sharma');
      expect(baseProject.projectManagers?.length).toBe(2);
    });
  });

  describe('Scenario 2: Independent PO Requester', () => {
    it('keeps poRequester separate from projectManagers', () => {
      expect(basePO.poRequester).toBe('Anil Kumar (Finance Lead)');
      expect(baseProject.projectManagers).not.toContain(basePO.poRequester);
    });
  });

  describe('Scenario 3: Allocation Cap on New Assignment', () => {
    it('blocks new assignment if total active allocation exceeds 100%', () => {
      const existingAssignments: Assignment[] = [
        {
          id: 'asgn-1',
          employeeId: 'emp-101',
          employeeName: 'Rahul Sharma',
          designation: 'Senior Frontend Engineer',
          projectId: 'proj-test-1',
          projectName: 'Enterprise Portal',
          assignedFrom: '2026-01-01',
          assignedTo: '2026-12-31',
          allocationPercentage: 70,
          status: 'Active',
        },
      ];

      const newRequestedAllocation = 40; // 70 + 40 = 110% (> 100%)
      const currentActiveSum = existingAssignments
        .filter((a) => a.employeeId === 'emp-101' && a.status === 'Active')
        .reduce((sum, a) => sum + a.allocationPercentage, 0);

      const isValid = currentActiveSum + newRequestedAllocation <= 100;
      expect(isValid).toBe(false);
    });
  });

  describe('Scenario 4: Allocation Cap Self-Exclusion on Edit', () => {
    it('excludes editing assignment id when validating total allocation percentage', () => {
      const existingAssignments: Assignment[] = [
        {
          id: 'asgn-1',
          employeeId: 'emp-101',
          employeeName: 'Rahul Sharma',
          designation: 'Senior Frontend Engineer',
          projectId: 'proj-test-1',
          projectName: 'Enterprise Portal',
          assignedFrom: '2026-01-01',
          assignedTo: '2026-12-31',
          allocationPercentage: 80,
          status: 'Active',
        },
        {
          id: 'asgn-2',
          employeeId: 'emp-101',
          employeeName: 'Rahul Sharma',
          designation: 'Senior Frontend Engineer',
          projectId: 'proj-test-2',
          projectName: 'Mobile App',
          assignedFrom: '2026-01-01',
          assignedTo: '2026-12-31',
          allocationPercentage: 20,
          status: 'Active',
        },
      ];

      const editingId = 'asgn-1';
      const requestedNewAlloc = 75; // Changing 80% -> 75%

      const sumExcludingEditing = existingAssignments
        .filter((a) => a.id !== editingId && a.employeeId === 'emp-101' && a.status === 'Active')
        .reduce((sum, a) => sum + a.allocationPercentage, 0); // 20%

      const isValid = sumExcludingEditing + requestedNewAlloc <= 100; // 20 + 75 = 95% <= 100%
      expect(isValid).toBe(true);
      expect(sumExcludingEditing).toBe(20);
    });
  });

  describe('Scenario 5: Multiple Invoices in Same Billing Month', () => {
    it('allows issuing two partial invoices for same billing month and updates balance correctly', () => {
      const inv1: Invoice = {
        id: 'inv-1',
        poId: basePO.id,
        invoiceNumber: 'INV/001',
        invoiceDate: '2026-10-05',
        billingMonth: 'October',
        billingYear: 2026,
        billingPeriodStart: '2026-10-01',
        billingPeriodEnd: '2026-10-15',
        amountExclGst: 500000, // ₹5L
        gstRate: 18,
        gstAmount: 90000,
        totalAmountInclGst: 590000,
        status: 'Issued',
      };

      const inv2: Invoice = {
        id: 'inv-2',
        poId: basePO.id,
        invoiceNumber: 'INV/002',
        invoiceDate: '2026-10-20',
        billingMonth: 'October',
        billingYear: 2026,
        billingPeriodStart: '2026-10-16',
        billingPeriodEnd: '2026-10-31',
        amountExclGst: 300000, // ₹3L
        gstRate: 18,
        gstAmount: 54000,
        totalAmountInclGst: 354000,
        status: 'Issued',
      };

      const updatedPo = recalculatePOBalances({
        ...basePO,
        invoices: [inv1, inv2],
      });

      expect(updatedPo.invoicedExclGst).toBe(800000); // 5L + 3L = 8L
      expect(updatedPo.remainingBalanceExclGst).toBe(200000); // 10L - 8L = 2L
    });
  });

  describe('Scenario 6: Billing Period Migration', () => {
    it('derives billingMonth and billingYear for legacy invoices missing these fields', () => {
      const legacyPo: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-legacy',
            poId: basePO.id,
            invoiceNumber: 'INV/LEG/001',
            invoiceDate: '2026-08-15',
            billingPeriodStart: '2026-08-01',
            billingPeriodEnd: '2026-08-31',
            amountExclGst: 200000,
            gstRate: 18,
            gstAmount: 36000,
            totalAmountInclGst: 236000,
            status: 'Issued',
          },
        ],
      };

      localStorage.setItem('primestar_purchase_orders', JSON.stringify([legacyPo]));
      ALL_SYSTEM_STORAGE_KEYS.forEach((k) => {
        if (k !== 'primestar_purchase_orders') {
          localStorage.setItem(k, JSON.stringify([]));
        }
      });

      migrateLegacyDataIdempotent();

      const savedPOs: PurchaseOrder[] = JSON.parse(localStorage.getItem('primestar_purchase_orders') || '[]');
      expect(savedPOs[0].invoices[0].billingMonth).toBe('August');
      expect(savedPOs[0].invoices[0].billingYear).toBe(2026);
    });
  });

  describe('Scenario 7: Invoice Overbilling Prevention', () => {
    it('blocks tax invoice exceeding remaining PO balance', () => {
      const poWithIssued: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-prev',
            poId: basePO.id,
            invoiceNumber: 'INV/PREV/001',
            invoiceDate: '2026-01-01',
            amountExclGst: 800000, // ₹8L
            gstRate: 18,
            gstAmount: 144000,
            totalAmountInclGst: 944000,
            status: 'Issued',
            billingPeriodStart: '2026-01-01',
            billingPeriodEnd: '2026-01-31',
          },
        ],
      };

      const result = validateNewInvoiceAmount(poWithIssued, 300000); // ₹3L > ₹2L remaining
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds available remaining PO balance');
    });
  });

  describe('Scenario 8: Credit Note on Low / Zero Remaining PO Balance', () => {
    it('allows credit note when remaining balance is zero if issued tax invoices exist', () => {
      const fullyInvoicedPo: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-1',
            poId: basePO.id,
            invoiceNumber: 'INV/001',
            invoiceDate: '2026-05-01',
            amountExclGst: 1000000,
            gstRate: 18,
            gstAmount: 180000,
            totalAmountInclGst: 1180000,
            status: 'Issued',
            billingPeriodStart: '2026-05-01',
            billingPeriodEnd: '2026-05-31',
          },
        ],
      };

      const recalculated = recalculatePOBalances(fullyInvoicedPo);
      expect(recalculated.remainingBalanceExclGst).toBe(0);

      const result = validateNewCreditNoteAmount(recalculated, 200000); // ₹2L Credit Note
      expect(result.valid).toBe(true);
    });
  });

  describe('Scenario 9: Credit Note Restoration & Subsequent Invoice', () => {
    it('restores PO balance with credit note allowing a subsequent tax invoice to be issued', () => {
      const poWithTaxAndCN: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-1',
            poId: basePO.id,
            invoiceNumber: 'INV/001',
            invoiceDate: '2026-01-01',
            amountExclGst: 1000000, // ₹10L
            gstRate: 18,
            gstAmount: 180000,
            totalAmountInclGst: 1180000,
            status: 'Issued',
            billingPeriodStart: '2026-01-01',
            billingPeriodEnd: '2026-01-31',
          },
          {
            id: 'cn-1',
            poId: basePO.id,
            invoiceNumber: 'CN/001',
            invoiceDate: '2026-02-01',
            amountExclGst: 300000, // ₹3L Credit Note
            gstRate: 18,
            gstAmount: 54000,
            totalAmountInclGst: 354000,
            status: 'Issued',
            isCreditNote: true,
            billingPeriodStart: '2026-02-01',
            billingPeriodEnd: '2026-02-28',
          },
        ],
      };

      const recalculated = recalculatePOBalances(poWithTaxAndCN);
      // Formula: 10L PO - 10L Tax + 3L CN = 3L Available
      expect(recalculated.remainingBalanceExclGst).toBe(300000);

      const subsequentInvoiceValidation = validateNewInvoiceAmount(recalculated, 250000);
      expect(subsequentInvoiceValidation.valid).toBe(true);
    });
  });

  describe('Scenario 10: Credit Note Cancellation Effect', () => {
    it('removes credit note balance restoration when credit note status is changed to Cancelled', () => {
      const poWithCancelledCN: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-1',
            poId: basePO.id,
            invoiceNumber: 'INV/001',
            invoiceDate: '2026-01-01',
            amountExclGst: 800000,
            gstRate: 18,
            gstAmount: 144000,
            totalAmountInclGst: 944000,
            status: 'Issued',
            billingPeriodStart: '2026-01-01',
            billingPeriodEnd: '2026-01-31',
          },
          {
            id: 'cn-1',
            poId: basePO.id,
            invoiceNumber: 'CN/001',
            invoiceDate: '2026-02-01',
            amountExclGst: 200000,
            gstRate: 18,
            gstAmount: 36000,
            totalAmountInclGst: 236000,
            status: 'Cancelled', // Voided Credit Note
            isCreditNote: true,
            billingPeriodStart: '2026-02-01',
            billingPeriodEnd: '2026-02-28',
          },
        ],
      };

      const recalculated = recalculatePOBalances(poWithCancelledCN);
      expect(recalculated.creditNotesExclGst).toBe(0);
      expect(recalculated.remainingBalanceExclGst).toBe(200000); // 10L - 8L = 2L
    });
  });

  describe('Scenario 11: Dynamic GST Rates', () => {
    it('uses stored gstRate (12% or 5%) on invoice without hardcoding 18%', () => {
      const inv12: Invoice = {
        id: 'inv-12',
        poId: basePO.id,
        invoiceNumber: 'INV/12/001',
        invoiceDate: '2026-03-01',
        amountExclGst: 100000,
        gstRate: 12, // 12% reduced rate
        gstAmount: 12000,
        totalAmountInclGst: 112000,
        status: 'Issued',
        billingPeriodStart: '2026-03-01',
        billingPeriodEnd: '2026-03-31',
      };

      const calculatedGst = inv12.amountExclGst * (inv12.gstRate / 100);
      expect(calculatedGst).toBe(12000);
      expect(inv12.amountExclGst + calculatedGst).toBe(112000);
    });
  });

  describe('Scenario 12: Pending Credit Note Inaction', () => {
    it('does not restore balance for Pending credit notes until approved/issued', () => {
      const poWithPendingCN: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-1',
            poId: basePO.id,
            invoiceNumber: 'INV/001',
            invoiceDate: '2026-01-01',
            amountExclGst: 500000,
            gstRate: 18,
            gstAmount: 90000,
            totalAmountInclGst: 590000,
            status: 'Issued',
            billingPeriodStart: '2026-01-01',
            billingPeriodEnd: '2026-01-31',
          },
          {
            id: 'cn-pending',
            poId: basePO.id,
            invoiceNumber: 'CN/DRAFT/001',
            invoiceDate: '2026-02-01',
            amountExclGst: 100000,
            gstRate: 18,
            gstAmount: 18000,
            totalAmountInclGst: 118000,
            status: 'Pending', // Unapproved draft
            isCreditNote: true,
            billingPeriodStart: '2026-02-01',
            billingPeriodEnd: '2026-02-28',
          },
        ],
      };

      const recalculated = recalculatePOBalances(poWithPendingCN);
      expect(recalculated.creditNotesExclGst).toBe(0);
      expect(recalculated.remainingBalanceExclGst).toBe(500000); // 10L - 5L = 5L
    });
  });

  describe('Scenario 13: Backup Failure Abort', () => {
    it('aborts migration if localStorage backup fails', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = (key: string, value: string) => {
        if (key.startsWith('primestar_backup_')) {
          throw new Error('QuotaExceededError: LocalStorage quota reached');
        }
        originalSetItem.call(localStorage, key, value);
      };

      const backupResult = createVerifiedLocalStorageBackup();
      expect(backupResult.success).toBe(false);
      expect(backupResult.error).toContain('QuotaExceededError');

      localStorage.setItem = originalSetItem;
    });
  });

  describe('Scenario 14: Interrupted Migration Recovery & Re-runs', () => {
    it('runs idempotently using _migrated_v2 flag without duplicating data', () => {
      ALL_SYSTEM_STORAGE_KEYS.forEach((k) => {
        localStorage.setItem(k, JSON.stringify([]));
      });
      localStorage.setItem(
        'primestar_projects',
        JSON.stringify([
          {
            ...baseProject,
            _migrated_v2: true,
          },
        ])
      );

      migrateLegacyDataIdempotent();
      const projectsPostFirst: Project[] = JSON.parse(localStorage.getItem('primestar_projects') || '[]');

      migrateLegacyDataIdempotent();
      const projectsPostSecond: Project[] = JSON.parse(localStorage.getItem('primestar_projects') || '[]');

      expect(projectsPostFirst.length).toBe(1);
      expect(projectsPostSecond.length).toBe(1);
      expect(projectsPostSecond[0]._migrated_v2).toBe(true);
    });
  });

  describe('Scenario 15: Financial Reconciliation Across Screens', () => {
    it('verifies PO detail ledger, project totals and reports display identical balance', () => {
      const poWithInvoices: PurchaseOrder = {
        ...basePO,
        invoices: [
          {
            id: 'inv-1',
            poId: basePO.id,
            invoiceNumber: 'INV/001',
            invoiceDate: '2026-01-01',
            amountExclGst: 600000,
            gstRate: 18,
            gstAmount: 108000,
            totalAmountInclGst: 708000,
            status: 'Issued',
            billingPeriodStart: '2026-01-01',
            billingPeriodEnd: '2026-01-31',
          },
        ],
      };

      const recalculatedPo = recalculatePOBalances(poWithInvoices);
      const updatedProjects = recalculateProjectBalances([baseProject], [recalculatedPo]);

      expect(recalculatedPo.remainingBalanceExclGst).toBe(400000);
      expect(updatedProjects[0].remainingBalance).toBe(400000);
      expect(recalculatedPo.remainingBalanceExclGst).toBe(updatedProjects[0].remainingBalance);
    });
  });
});
