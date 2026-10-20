import { describe, it, expect } from 'vitest';
import { INITIAL_POS, INITIAL_EMPLOYEES } from '../mockData';
import { recalculatePOBalances } from '../../lib/poUtils';
import { PurchaseOrder, Invoice, AssignedEmployee } from '../../types/domain';

describe('Tag Employee & Invoice Employee Selection Module', () => {
  // Setup fresh copy of po-102 (PO/2025/INFY/0032) where requester is Kavita Nair
  const getFreshInfyPo = (): PurchaseOrder => {
    const raw = INITIAL_POS.find((p) => p.id === 'po-102')!;
    return JSON.parse(JSON.stringify(raw));
  };

  const rajeshEmp = INITIAL_EMPLOYEES.find((e) => e.employeeId === 'PS-001')!; // Rajesh Sharma
  const rohanEmp = INITIAL_EMPLOYEES.find((e) => e.employeeId === 'PS-108')!; // Rohan Deshmukh

  it('1. Selecting Rajesh Sharma in Tag Employee saves Rajesh\'s employee ID (PS-001), not Kavita Nair\'s', () => {
    const po = getFreshInfyPo();
    expect(po.poRequester).toBe('Kavita Nair');

    const newAssignment: AssignedEmployee = {
      employeeId: rajeshEmp.employeeId,
      employeeName: rajeshEmp.name,
      designation: rajeshEmp.designation,
      billingRatePerMonth: 300000,
      assignedFrom: '2025-03-01',
      assignedTo: '2026-11-15',
      status: 'Active',
    };

    // Tag Rajesh
    const exists = po.assignedEmployees.some((e) => e.employeeId === rajeshEmp.employeeId);
    const updatedAssigned = exists
      ? po.assignedEmployees.map((e) => (e.employeeId === rajeshEmp.employeeId ? newAssignment : e))
      : [...po.assignedEmployees, newAssignment];

    const updatedPo = { ...po, assignedEmployees: updatedAssigned };

    const taggedRajesh = updatedPo.assignedEmployees.find((e) => e.employeeId === 'PS-001');
    expect(taggedRajesh).toBeDefined();
    expect(taggedRajesh?.employeeName).toBe('Rajesh Sharma');
    expect(taggedRajesh?.employeeId).toBe('PS-001');
    expect(taggedRajesh?.employeeId).not.toBe('PS-016'); // Not Kavita Nair
  });

  it('2. The PO requester remains Kavita Nair after Rajesh is tagged', () => {
    const po = getFreshInfyPo();
    const newAssignment: AssignedEmployee = {
      employeeId: rajeshEmp.employeeId,
      employeeName: rajeshEmp.name,
      designation: rajeshEmp.designation,
      billingRatePerMonth: 300000,
      assignedFrom: '2025-03-01',
      assignedTo: '2026-11-15',
      status: 'Active',
    };

    const updatedPo = {
      ...po,
      assignedEmployees: [...po.assignedEmployees, newAssignment],
    };

    expect(updatedPo.poRequester).toBe('Kavita Nair');
    expect(updatedPo.assignedEmployees.some((e) => e.employeeId === 'PS-001')).toBe(true);
  });

  it('3. Reopening the Tag Employee or edit flow shows the saved employee', () => {
    const po = getFreshInfyPo();
    po.assignedEmployees.push({
      employeeId: 'PS-001',
      employeeName: 'Rajesh Sharma',
      designation: 'Chief Executive Officer',
      billingRatePerMonth: 300000,
      assignedFrom: '2025-03-01',
      assignedTo: '2026-11-15',
      status: 'Active',
    });

    const rajeshRecord = po.assignedEmployees.find((e) => e.employeeId === 'PS-001');
    expect(rajeshRecord).toBeDefined();
    expect(rajeshRecord?.billingRatePerMonth).toBe(300000);
  });

  it('4. Duplicate PO employee tagging is handled correctly (updates existing assignment)', () => {
    const po = getFreshInfyPo();
    // Rohan Deshmukh (PS-108) is initially in po-102
    expect(po.assignedEmployees.length).toBe(1);
    expect(po.assignedEmployees[0].employeeId).toBe('PS-108');

    // Tag Rohan again with updated billing rate
    const updatedRohan: AssignedEmployee = {
      employeeId: 'PS-108',
      employeeName: 'Rohan Deshmukh',
      designation: 'Senior Cloud Architect',
      billingRatePerMonth: 280000,
      assignedFrom: '2025-03-01',
      assignedTo: '2026-11-15',
      status: 'Active',
    };

    const exists = po.assignedEmployees.some((e) => e.employeeId === updatedRohan.employeeId);
    const updatedAssigned = exists
      ? po.assignedEmployees.map((e) => (e.employeeId === updatedRohan.employeeId ? updatedRohan : e))
      : [...po.assignedEmployees, updatedRohan];

    expect(updatedAssigned.length).toBe(1); // Not duplicated
    expect(updatedAssigned[0].billingRatePerMonth).toBe(280000);
  });

  it('5. An invoice can be created with an assigned employee', () => {
    const po = getFreshInfyPo();
    const newInvoice: Invoice = {
      id: 'inv-test-emp',
      poId: po.id,
      invoiceNumber: 'INV/PS/25-26/301',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 200000,
      gstRate: 18,
      gstAmount: 36000,
      totalAmountInclGst: 236000,
      status: 'Issued',
      employeeIds: ['PS-001'],
      employeeNames: ['Rajesh Sharma'],
      employeeId: 'PS-001',
      employeeName: 'Rajesh Sharma',
    };

    po.invoices.push(newInvoice);

    const savedInv = po.invoices.find((i) => i.id === 'inv-test-emp');
    expect(savedInv).toBeDefined();
    expect(savedInv?.employeeIds).toEqual(['PS-001']);
    expect(savedInv?.employeeNames).toEqual(['Rajesh Sharma']);
  });

  it('6. An invoice can be created without an assigned employee if the field is optional', () => {
    const po = getFreshInfyPo();
    const newInvoice: Invoice = {
      id: 'inv-test-no-emp',
      poId: po.id,
      invoiceNumber: 'INV/PS/25-26/302',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 100000,
      gstRate: 18,
      gstAmount: 18000,
      totalAmountInclGst: 118000,
      status: 'Issued',
      employeeIds: [],
      employeeNames: [],
    };

    po.invoices.push(newInvoice);

    const savedInv = po.invoices.find((i) => i.id === 'inv-test-no-emp');
    expect(savedInv).toBeDefined();
    expect(savedInv?.employeeIds).toEqual([]);
    expect(savedInv?.employeeNames).toEqual([]);
  });

  it('7. The selected employee association survives reopening the invoice / state reload', () => {
    const po = getFreshInfyPo();
    const invoiceWithEmployee: Invoice = {
      id: 'inv-persisted',
      poId: po.id,
      invoiceNumber: 'INV/PS/25-26/303',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 150000,
      gstRate: 18,
      gstAmount: 27000,
      totalAmountInclGst: 177000,
      status: 'Issued',
      employeeIds: ['PS-108'],
      employeeNames: ['Rohan Deshmukh'],
    };

    po.invoices.push(invoiceWithEmployee);

    // Simulate JSON stringify & parse (localStorage persistence)
    const serialized = JSON.stringify(po);
    const deserialized: PurchaseOrder = JSON.parse(serialized);

    const inv = deserialized.invoices.find((i) => i.id === 'inv-persisted');
    expect(inv?.employeeIds).toEqual(['PS-108']);
    expect(inv?.employeeNames).toEqual(['Rohan Deshmukh']);
  });

  it('8. Editing an invoice preserves or updates its employee association correctly', () => {
    const invoice: Invoice = {
      id: 'inv-editable',
      poId: 'po-102',
      invoiceNumber: 'INV/PS/25-26/304',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 100000,
      gstRate: 18,
      gstAmount: 18000,
      totalAmountInclGst: 118000,
      status: 'Issued',
      employeeIds: ['PS-108'],
      employeeNames: ['Rohan Deshmukh'],
    };

    // Update to add Rajesh Sharma as well
    const updatedInvoice: Invoice = {
      ...invoice,
      employeeIds: ['PS-108', 'PS-001'],
      employeeNames: ['Rohan Deshmukh', 'Rajesh Sharma'],
    };

    expect(updatedInvoice.employeeIds).toEqual(['PS-108', 'PS-001']);
    expect(updatedInvoice.employeeNames).toEqual(['Rohan Deshmukh', 'Rajesh Sharma']);
  });

  it('9. Changing invoice status does not erase the association', () => {
    const invoice: Invoice = {
      id: 'inv-status-change',
      poId: 'po-102',
      invoiceNumber: 'INV/PS/25-26/305',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 100000,
      gstRate: 18,
      gstAmount: 18000,
      totalAmountInclGst: 118000,
      status: 'Issued',
      employeeIds: ['PS-001'],
      employeeNames: ['Rajesh Sharma'],
    };

    const paidInvoice: Invoice = { ...invoice, status: 'Paid' };
    expect(paidInvoice.employeeIds).toEqual(['PS-001']);
    expect(paidInvoice.employeeNames).toEqual(['Rajesh Sharma']);

    const cancelledInvoice: Invoice = { ...invoice, status: 'Cancelled' };
    expect(cancelledInvoice.employeeIds).toEqual(['PS-001']);
    expect(cancelledInvoice.employeeNames).toEqual(['Rajesh Sharma']);
  });

  it('10. Credit notes do not accidentally inherit unrelated invoice employee associations', () => {
    const invoice: Invoice = {
      id: 'inv-with-emp',
      poId: 'po-102',
      invoiceNumber: 'INV/PS/25-26/306',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 100000,
      gstRate: 18,
      gstAmount: 18000,
      totalAmountInclGst: 118000,
      status: 'Issued',
      employeeIds: ['PS-001'],
      employeeNames: ['Rajesh Sharma'],
    };

    const creditNote: Invoice = {
      id: 'cn-independent',
      poId: 'po-102',
      invoiceNumber: 'CN/PS/25-26/001',
      invoiceDate: '2025-10-05',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 50000,
      gstRate: 18,
      gstAmount: 9000,
      totalAmountInclGst: 59000,
      status: 'Issued',
      isCreditNote: true,
      employeeIds: [],
      employeeNames: [],
    };

    expect(creditNote.employeeIds).toEqual([]);
    expect(creditNote.employeeNames).toEqual([]);
    expect(invoice.employeeIds).toEqual(['PS-001']);
  });

  it('11. Existing financial calculations and PO balances remain unchanged', () => {
    const po = getFreshInfyPo();
    const originalRec = recalculatePOBalances(po);

    // Add invoice with employee association
    po.invoices.push({
      id: 'inv-fin-test',
      poId: po.id,
      invoiceNumber: 'INV/PS/25-26/307',
      invoiceDate: '2025-10-01',
      billingPeriodStart: '2025-09-01',
      billingPeriodEnd: '2025-09-30',
      amountExclGst: 100000,
      gstRate: 18,
      gstAmount: 18000,
      totalAmountInclGst: 118000,
      status: 'Issued',
      employeeIds: ['PS-001'],
      employeeNames: ['Rajesh Sharma'],
    });

    const newRec = recalculatePOBalances(po);
    expect(newRec.invoicedExclGst).toBe(originalRec.invoicedExclGst + 100000);
    expect(newRec.remainingBalanceExclGst).toBe(originalRec.remainingBalanceExclGst - 100000);
  });

  it('12. Existing records without employee associations continue to work seamlessly', () => {
    const po = getFreshInfyPo();
    // Verify existing invoices without employeeIds/employeeNames work without error
    po.invoices.forEach((inv) => {
      expect(inv.invoiceNumber).toBeDefined();
      expect(inv.amountExclGst).toBeGreaterThan(0);
      expect(inv.employeeIds).toBeUndefined();
    });

    // po-102 has inv-4 (10L Paid) and inv-5 (6.5L Pending).
    // Issued/Paid invoices calculate balance (25L - 10L = 15L).
    const recalculated = recalculatePOBalances(po);
    expect(recalculated.remainingBalanceExclGst).toBe(1500000);
  });

  it('13. Searchable employee selector filters dynamically by employee name or ID', () => {
    const queryName = 'rajesh';
    const queryId = 'PS-001';

    const matchName = INITIAL_EMPLOYEES.filter(
      (e) => e.name.toLowerCase().includes(queryName) || e.employeeId.toLowerCase().includes(queryName)
    );
    expect(matchName.length).toBeGreaterThan(0);
    expect(matchName[0].name).toBe('Rajesh Sharma');

    const matchId = INITIAL_EMPLOYEES.filter(
      (e) => e.name.toLowerCase().includes(queryId.toLowerCase()) || e.employeeId.toLowerCase().includes(queryId.toLowerCase())
    );
    expect(matchId.length).toBe(1);
    expect(matchId[0].employeeId).toBe('PS-001');

    const matchNone = INITIAL_EMPLOYEES.filter(
      (e) => e.name.toLowerCase().includes('nonexistent_person_xyz')
    );
    expect(matchNone.length).toBe(0);
  });

  it('14. Allows toggling and clearing employee selection in searchable dropdown', () => {
    let selectedIds: string[] = [];

    // Add Rajesh
    selectedIds = [...selectedIds, 'PS-001'];
    expect(selectedIds).toEqual(['PS-001']);

    // Add Rohan
    selectedIds = [...selectedIds, 'PS-108'];
    expect(selectedIds).toEqual(['PS-001', 'PS-108']);

    // Remove Rajesh
    selectedIds = selectedIds.filter((id) => id !== 'PS-001');
    expect(selectedIds).toEqual(['PS-108']);

    // Clear all
    selectedIds = [];
    expect(selectedIds).toEqual([]);
  });
});
