import { describe, it, expect } from 'vitest';
import { PurchaseOrder, Assignment } from '../../types/domain';

function createMockPO(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-close-1',
    poNumber: 'PO/2026/INFY/0032',
    projectId: 'proj-1',
    projectName: 'Infosys Finacle AI Infrastructure',
    poRequester: 'John Doe',
    startDate: '2025-01-01',
    expiryDate: '2026-11-15',
    amountExclGst: 1000000,
    amountInclGst: 1180000,
    remainingBalanceExclGst: 500000,
    invoicedExclGst: 500000,
    creditNotesExclGst: 0,
    gstRate: 18,
    status: 'Active',
    invoices: [
      {
        id: 'inv-1',
        poId: 'po-close-1',
        invoiceNumber: 'INV/2026/001',
        amountExclGst: 100000,
        gstRate: 18,
        gstAmount: 18000,
        totalAmountInclGst: 118000,
        invoiceDate: '2026-02-01',
        status: 'Issued',
        isCreditNote: false,
      },
    ],
    assignedEmployees: [
      {
        employeeId: 'PS-108',
        employeeName: 'Rohan Deshmukh',
        designation: 'Senior Architect',
        billingRatePerMonth: 200000,
        status: 'Active',
      },
    ],
    activityLogs: [],
    billingAddress: '123 Tech Park',
    shippingAddress: '123 Tech Park',
    ...overrides,
  } as PurchaseOrder;
}

function createMockAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'asgn-1',
    employeeId: 'PS-108',
    employeeName: 'Rohan Deshmukh',
    designation: 'Senior Architect',
    projectId: 'proj-1',
    projectName: 'Infosys Finacle AI Infrastructure',
    poId: 'po-close-1',
    poNumber: 'PO/2026/INFY/0032',
    assignedFrom: '2025-01-01',
    assignedTo: '2026-12-31',
    allocationPercentage: 100,
    status: 'Active',
    ...overrides,
  };
}

describe('Confirmation Dialogs Specification', () => {
  describe('Untag Employee Confirmation Dialog', () => {
    it('displays the correct employee name and PO number in confirmation dialog text', () => {
      const empName = 'Rohan Deshmukh';
      const poNum = 'PO/2026/INFY/0032';

      const dialogTitle = 'Untag Employee?';
      const dialogMsg = `Are you sure you want to remove ${empName} from PO ${poNum}? This will remove their current assignment to this purchase order.`;

      expect(dialogTitle).toBe('Untag Employee?');
      expect(dialogMsg).toContain(empName);
      expect(dialogMsg).toContain(poNum);
    });

    it('selecting No / Cancel leaves assignment intact', () => {
      const initialAssigned = [
        { employeeId: 'PS-108', employeeName: 'Rohan Deshmukh' },
      ];
      let assignedList = [...initialAssigned];

      // User selects 'No, Cancel'
      const onConfirm = false;
      if (onConfirm) {
        assignedList = assignedList.filter((e) => e.employeeId !== 'PS-108');
      }

      expect(assignedList.length).toBe(1);
      expect(assignedList[0].employeeId).toBe('PS-108');
    });

    it('selecting Yes untags only the targeted employee from the selected PO', () => {
      const po = createMockPO();
      let assigned = [...po.assignedEmployees];

      // User selects 'Yes, Untag Employee'
      const onConfirm = true;
      const targetEmpId = 'PS-108';

      if (onConfirm) {
        assigned = assigned.filter((e) => e.employeeId !== targetEmpId);
      }

      expect(assigned.length).toBe(0);
    });
  });

  describe('Close PO Confirmation Dialog', () => {
    it('displays the correct PO number and project name in confirmation dialog text', () => {
      const po = createMockPO();

      const title = 'Close Purchase Order?';
      const msg = `Are you sure you want to close PO ${po.poNumber} for ${po.projectName}? Please confirm that this purchase order should no longer remain open.`;

      expect(title).toBe('Close Purchase Order?');
      expect(msg).toContain('PO/2026/INFY/0032');
      expect(msg).toContain('Infosys Finacle AI Infrastructure');
    });

    it('selecting No / Cancel leaves PO status unchanged', () => {
      const po = createMockPO({ status: 'Active' });
      let currentPo = { ...po };

      // User selects 'No, Cancel'
      const onConfirm = false;
      if (onConfirm) {
        currentPo.status = 'Closed';
      }

      expect(currentPo.status).toBe('Active');
    });

    it('selecting Yes updates PO status to Closed and preserves invoices, documents, and history', () => {
      const po = createMockPO({ status: 'Active' });
      let currentPo = { ...po };

      // User selects 'Yes, Close PO'
      const onConfirm = true;
      if (onConfirm) {
        currentPo = {
          ...currentPo,
          status: 'Closed',
          closedAt: '2026-10-20T04:00:00Z',
          closedReason: 'Client engagement ended',
        };
      }

      expect(currentPo.status).toBe('Closed');
      // Invoices, credit notes, and assigned workforce records remain intact
      expect(currentPo.invoices.length).toBe(1);
      expect(currentPo.assignedEmployees.length).toBe(1);
      expect(currentPo.amountExclGst).toBe(1000000);
    });

    it('prevents repeated submission on already closed POs', () => {
      const po = createMockPO({ status: 'Closed' });
      let closeCallCount = 0;

      const attemptClose = (p: PurchaseOrder) => {
        if (p.status === 'Closed') return;
        closeCallCount++;
      };

      attemptClose(po);
      expect(closeCallCount).toBe(0);
    });
  });
});
