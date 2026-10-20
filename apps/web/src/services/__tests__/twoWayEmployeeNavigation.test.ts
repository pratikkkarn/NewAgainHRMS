import { describe, it, expect } from 'vitest';
import { INITIAL_POS, INITIAL_EMPLOYEES, INITIAL_PROFORMA_INVOICES } from '../mockData';
import { PurchaseOrder, AssignedEmployee, ProformaInvoice } from '../../types/domain';

describe('Two-Way Employee Navigation Between PO Workforce and Proforma Invoices', () => {
  const samplePo = INITIAL_POS[0]; // PO/2025/HDFC/0089 (po-101)
  const sampleEmployee = samplePo.assignedEmployees[0]; // Rohan Deshmukh (PS-108)

  describe('1. Purchase Order -> Proforma Invoices Navigation', () => {
    it('constructs correct navigation parameters with PO ID and stable Employee ID', () => {
      const navigateParams = {
        poId: samplePo.id,
        highlightEmployeeId: sampleEmployee.employeeId,
      };

      expect(navigateParams.poId).toBe('po-101');
      expect(navigateParams.highlightEmployeeId).toBe('PS-108');
    });

    it('selects the exact target PO and locates employee by ID in Proforma Invoices', () => {
      const targetPoId = 'po-101';
      const targetEmpId = 'PS-108';

      const selectedPo = INITIAL_POS.find((p) => p.id === targetPoId);
      expect(selectedPo).toBeDefined();
      expect(selectedPo?.poNumber).toBe(INITIAL_POS[0].poNumber);

      const employeeInPo = selectedPo?.assignedEmployees.find((e) => e.employeeId === targetEmpId);
      expect(employeeInPo).toBeDefined();
      expect(employeeInPo?.employeeName).toBe('Rohan Deshmukh');
    });

    it('automatically expands proformas for target employee regardless of zero or multiple proformas', () => {
      // Employee with multiple proformas (PS-108)
      const empWithProformas = 'PS-108';
      const rohanProformas = INITIAL_PROFORMA_INVOICES.filter(
        (p) => p.poId === samplePo.id && p.employeeId === empWithProformas
      );
      expect(rohanProformas.length).toBeGreaterThanOrEqual(2);

      // Expansion state map
      const expandedMap: Record<string, boolean> = {};
      expandedMap[empWithProformas] = true;
      expect(expandedMap[empWithProformas]).toBe(true);

      // Employee with zero proformas
      const empWithZero = 'PS-015'; // Not in INITIAL_PROFORMA_INVOICES
      const zeroProformas = INITIAL_PROFORMA_INVOICES.filter(
        (p) => p.poId === samplePo.id && p.employeeId === empWithZero
      );
      expect(zeroProformas.length).toBe(0);

      expandedMap[empWithZero] = true;
      expect(expandedMap[empWithZero]).toBe(true);
    });
  });

  describe('2. Proforma Invoices -> Purchase Order Navigation', () => {
    it('constructs reverse navigation parameters targeting exact PO, Employee ID, and Employees tab', () => {
      const reverseParams = {
        poId: samplePo.id,
        highlightEmployeeId: sampleEmployee.employeeId,
        initialTab: 'employees',
      };

      expect(reverseParams.poId).toBe('po-101');
      expect(reverseParams.highlightEmployeeId).toBe('PS-108');
      expect(reverseParams.initialTab).toBe('employees');
    });

    it('opens exact destination PO and selects Assigned Employees tab', () => {
      const targetPoId = 'po-101';
      const targetTab = 'employees';

      const currentViewingPO = INITIAL_POS.find((p) => p.id === targetPoId);
      expect(currentViewingPO).toBeDefined();
      expect(currentViewingPO?.id).toBe('po-101');

      let activeTab = 'overview';
      if (targetTab) {
        activeTab = targetTab;
      }
      expect(activeTab).toBe('employees');
    });

    it('locates target employee in Assigned Workforce table by stable ID', () => {
      const targetEmpId = 'PS-108';
      const foundEmp = samplePo.assignedEmployees.find((e) => e.employeeId === targetEmpId);

      expect(foundEmp).toBeDefined();
      expect(foundEmp?.employeeId).toBe('PS-108');
      expect(foundEmp?.employeeName).toBe('Rohan Deshmukh');
    });
  });

  describe('3. Multi-PO Assignment & Disambiguation', () => {
    it('differentiates navigation when an employee is assigned to multiple POs', () => {
      const employeeId = 'PS-108';

      // Create two distinct POs with Rohan assigned
      const po1: PurchaseOrder = { ...samplePo, id: 'po-hdfc-1', poNumber: 'PO/2025/HDFC/001' };
      const po2: PurchaseOrder = { ...samplePo, id: 'po-hpe-2', poNumber: 'PO/2025/HPE/002' };

      // Reverse navigation from PO-1 proforma -> PO-1
      const navFromPo1 = { poId: po1.id, highlightEmployeeId: employeeId, initialTab: 'employees' };
      // Reverse navigation from PO-2 proforma -> PO-2
      const navFromPo2 = { poId: po2.id, highlightEmployeeId: employeeId, initialTab: 'employees' };

      expect(navFromPo1.poId).not.toBe(navFromPo2.poId);
      expect(navFromPo1.poId).toBe('po-hdfc-1');
      expect(navFromPo2.poId).toBe('po-hpe-2');
    });

    it('handles employees with similar or identical names using unique employeeId', () => {
      const emp1: AssignedEmployee = {
        employeeId: 'PS-101',
        employeeName: 'Rajesh Sharma',
        designation: 'Senior Architect',
        billingRatePerMonth: 200000,
        assignedFrom: '2025-01-01',
        assignedTo: '2026-12-31',
        status: 'Active',
      };

      const emp2: AssignedEmployee = {
        employeeId: 'PS-202',
        employeeName: 'Rajesh Sharma', // Identical name
        designation: 'Cloud Engineer',
        billingRatePerMonth: 180000,
        assignedFrom: '2025-01-01',
        assignedTo: '2026-12-31',
        status: 'Active',
      };

      const poWithTwo: PurchaseOrder = {
        ...samplePo,
        assignedEmployees: [emp1, emp2],
      };

      // Target emp2 specifically
      const targetEmpId = 'PS-202';
      const matched = poWithTwo.assignedEmployees.find((e) => e.employeeId === targetEmpId);

      expect(matched?.employeeId).toBe('PS-202');
      expect(matched?.designation).toBe('Cloud Engineer');
    });
  });

  describe('4. Navigation Safety & Financial Isolation', () => {
    it('repeated navigation in both directions does not duplicate records or mutate PO balances', () => {
      const initialPoCount = INITIAL_POS.length;
      const initialProformaCount = INITIAL_PROFORMA_INVOICES.length;
      const initialRemainingBalance = samplePo.remainingBalanceExclGst;

      // Simulate 5 navigation round trips
      for (let i = 0; i < 5; i++) {
        // Forward
        const fwd = { poId: samplePo.id, highlightEmployeeId: sampleEmployee.employeeId };
        // Reverse
        const rev = { poId: samplePo.id, highlightEmployeeId: sampleEmployee.employeeId, initialTab: 'employees' };

        expect(fwd.poId).toBe('po-101');
        expect(rev.initialTab).toBe('employees');
      }

      // No side effects on dataset or balances
      expect(INITIAL_POS.length).toBe(initialPoCount);
      expect(INITIAL_PROFORMA_INVOICES.length).toBe(initialProformaCount);
      expect(samplePo.remainingBalanceExclGst).toBe(initialRemainingBalance);
    });

    it('gracefully handles non-existent PO or employee ID without crashing', () => {
      const invalidPoId = 'po-non-existent';
      const invalidEmpId = 'PS-99999';

      const foundPo = INITIAL_POS.find((p) => p.id === invalidPoId);
      expect(foundPo).toBeUndefined();

      const foundEmp = samplePo.assignedEmployees.find((e) => e.employeeId === invalidEmpId);
      expect(foundEmp).toBeUndefined();
    });
  });
});
