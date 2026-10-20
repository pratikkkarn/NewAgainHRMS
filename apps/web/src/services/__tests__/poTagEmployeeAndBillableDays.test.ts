import { describe, it, expect } from 'vitest';
import {
  calculateCalendarDays,
  calculateWorkingDays,
  isPOAssignmentExpired,
  getPOAssignmentEffectiveStatus,
  calculateProratedBillingAmount,
  getPOEmployeeEligibleBillingForMonth,
} from '../../lib/assignmentUtils';
import { INITIAL_EMPLOYEES, INITIAL_POS } from '../mockData';
import { AssignedEmployee, Assignment, PurchaseOrder } from '../../types/domain';

describe('Tag Employee to PO: Billable Days, Expiry & Data Safety Module', () => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pastDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  describe('1. Billable Days Calculation Methods', () => {
    it('calculates calendar days accurately for single-day, multi-day, and weekend spans', () => {
      // Single day
      expect(calculateCalendarDays('2026-10-05', '2026-10-05')).toBe(1);
      // Mon to Sun (7 days inclusive)
      expect(calculateCalendarDays('2026-10-05', '2026-10-11')).toBe(7);
      // Full month of October 2026 (31 days)
      expect(calculateCalendarDays('2026-10-01', '2026-10-31')).toBe(31);
      // Full month of June 2026 (30 days)
      expect(calculateCalendarDays('2026-06-01', '2026-06-30')).toBe(30);
      // Inverted dates return 0
      expect(calculateCalendarDays('2026-10-31', '2026-10-01')).toBe(0);
    });

    it('calculates working days accurately excluding Saturdays and Sundays', () => {
      // Single working day (Monday 2026-10-05)
      expect(calculateWorkingDays('2026-10-05', '2026-10-05')).toBe(1);
      // Single Saturday (2026-10-10)
      expect(calculateWorkingDays('2026-10-10', '2026-10-10')).toBe(0);
      // Single Sunday (2026-10-11)
      expect(calculateWorkingDays('2026-10-11', '2026-10-11')).toBe(0);
      // Weekend only span (Saturday to Sunday)
      expect(calculateWorkingDays('2026-10-10', '2026-10-11')).toBe(0);
      // Full week (Mon 2026-10-05 to Sun 2026-10-11) -> 5 working days
      expect(calculateWorkingDays('2026-10-05', '2026-10-11')).toBe(5);
      // 2 weeks (Mon 2026-10-05 to Sun 2026-10-18) -> 10 working days
      expect(calculateWorkingDays('2026-10-05', '2026-10-18')).toBe(10);
      // Inverted dates return 0
      expect(calculateWorkingDays('2026-10-18', '2026-10-05')).toBe(0);
    });

    it('prorates billing with the Working Days method excluding weekends', () => {
      const rate = 100000;
      // October 2026: 2026-10-01 to 2026-10-31
      const totalWorkingDaysInOct = calculateWorkingDays('2026-10-01', '2026-10-31');
      expect(totalWorkingDaysInOct).toBe(22);

      // Worked first 11 working days (2026-10-01 to 2026-10-15)
      const workingDaysWorked = calculateWorkingDays('2026-10-01', '2026-10-15');
      expect(workingDaysWorked).toBe(11);

      const proration = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom: '2026-10-01',
        assignedTo: '2026-10-15',
        billingYear: 2026,
        billingMonth: 'October',
        billableDaysMethod: 'working_days',
      });

      expect(proration.eligibleDays).toBe(11);
      expect(proration.totalDaysInMonth).toBe(22);
      expect(proration.eligibleAmount).toBe(50000); // 100000 * 11 / 22
      expect(proration.isFullMonth).toBe(false);
    });

    it('prorates billing with the Manual Billable Days method', () => {
      const rate = 120000;
      // June 2026 has 30 calendar days. User specifies 15 manual billable days.
      const proration = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom: '2026-06-01',
        assignedTo: '2026-06-30',
        billingYear: 2026,
        billingMonth: 'June',
        billableDaysMethod: 'manual',
        manualBillableDays: 15,
      });

      expect(proration.eligibleDays).toBe(15);
      expect(proration.totalDaysInMonth).toBe(30);
      expect(proration.eligibleAmount).toBe(60000); // 120000 * 15 / 30
      expect(proration.isFullMonth).toBe(false);
    });

    it('defaults to Calendar Days method when billableDaysMethod is omitted or set to calendar', () => {
      const rate = 60000;
      // June 2026 has 30 days. Worked 10 calendar days.
      const proration = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom: '2026-06-01',
        assignedTo: '2026-06-10',
        billingYear: 2026,
        billingMonth: 'June',
        billableDaysMethod: 'calendar',
      });

      expect(proration.eligibleDays).toBe(10);
      expect(proration.totalDaysInMonth).toBe(30);
      expect(proration.eligibleAmount).toBe(20000); // 60000 * 10 / 30
    });
  });

  describe('2. Assignment Expiry Scenarios', () => {
    it('marks an assignment active when it starts today and ends in the future', () => {
      const isExpired = isPOAssignmentExpired(futureDate, today);
      expect(isExpired).toBe(false);

      const status = getPOAssignmentEffectiveStatus({ assignedTo: futureDate }, today);
      expect(status).toBe('Active');
    });

    it('marks an assignment active on its last working day (ends today)', () => {
      // Employee is billable ON and up to the last working day inclusive
      const isExpired = isPOAssignmentExpired(today, today);
      expect(isExpired).toBe(false);

      const status = getPOAssignmentEffectiveStatus({ assignedTo: today }, today);
      expect(status).toBe('Active');
    });

    it('marks an assignment inactive / expired once the current date is strictly later than the last working day (expired yesterday)', () => {
      const isExpired = isPOAssignmentExpired(yesterday, today);
      expect(isExpired).toBe(true);

      const status = getPOAssignmentEffectiveStatus({ assignedTo: yesterday }, today);
      expect(status).toBe('Inactive');
    });

    it('excludes expired assignments from future billing calculations', () => {
      const rate = 80000;
      // Assignment expired in May 2026 (last working day 2026-05-31)
      // Billing query is for July 2026
      const proration = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom: '2026-01-01',
        assignedTo: '2026-05-31',
        billingYear: 2026,
        billingMonth: 'July',
      });

      expect(proration.eligibleDays).toBe(0);
      expect(proration.eligibleAmount).toBe(0);
    });

    it('handles an assignment spanning multiple invoice periods with correct monthly eligibility', () => {
      const rate = 90000;
      const assignedFrom = '2026-01-01';
      const assignedTo = '2026-12-31';

      // Period 1: January 2026 (31 days) -> Full Month
      const jan = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom,
        assignedTo,
        billingYear: 2026,
        billingMonth: 'January',
      });
      expect(jan.isFullMonth).toBe(true);
      expect(jan.eligibleDays).toBe(31);
      expect(jan.eligibleAmount).toBe(90000);

      // Period 2: February 2026 (28 days) -> Full Month
      const feb = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom,
        assignedTo,
        billingYear: 2026,
        billingMonth: 'February',
      });
      expect(feb.isFullMonth).toBe(true);
      expect(feb.eligibleDays).toBe(28);
      expect(feb.eligibleAmount).toBe(90000);

      // Period 3: After expiry in January 2027 -> 0 days
      const futureJan = calculateProratedBillingAmount({
        monthlyBillingRate: rate,
        assignedFrom,
        assignedTo,
        billingYear: 2027,
        billingMonth: 'January',
      });
      expect(futureJan.eligibleDays).toBe(0);
      expect(futureJan.eligibleAmount).toBe(0);
    });
  });

  describe('3. Data Safety, Isolation & Historical Preservation', () => {
    it('expiry does not delete PO assignment records or erase their historical data', () => {
      const expiredAssignment: AssignedEmployee = {
        employeeId: 'PS-108',
        employeeName: 'Rohan Deshmukh',
        designation: 'Senior Cloud Architect',
        billingRatePerMonth: 280000,
        assignedFrom: '2025-01-01',
        assignedTo: '2025-06-30', // in the past
        status: 'Inactive',
        billableDaysMethod: 'working_days',
      };

      // Record remains fully intact
      expect(expiredAssignment.employeeId).toBe('PS-108');
      expect(expiredAssignment.billingRatePerMonth).toBe(280000);
      expect(expiredAssignment.assignedTo).toBe('2025-06-30');
      expect(expiredAssignment.billableDaysMethod).toBe('working_days');
      expect(expiredAssignment.status).toBe('Inactive');
    });

    it('expiry on one PO does not deactivate the employee globally in HRMS or affect other POs', () => {
      const globalEmployee = INITIAL_EMPLOYEES.find((e) => e.employeeId === 'PS-108')!;
      expect(globalEmployee).toBeDefined();
      expect(globalEmployee.employeeId).toBe('PS-108');

      // Simulate PO-1 having an expired assignment for Rohan
      const po1Assignment: AssignedEmployee = {
        employeeId: globalEmployee.employeeId,
        employeeName: globalEmployee.name,
        designation: globalEmployee.designation,
        billingRatePerMonth: 250000,
        assignedFrom: '2025-01-01',
        assignedTo: yesterday,
        status: 'Inactive',
      };

      // Simulate PO-2 having an active assignment for Rohan
      const po2Assignment: AssignedEmployee = {
        employeeId: globalEmployee.employeeId,
        employeeName: globalEmployee.name,
        designation: globalEmployee.designation,
        billingRatePerMonth: 280000,
        assignedFrom: today,
        assignedTo: futureDate,
        status: 'Active',
      };

      // PO-1 is expired/inactive
      expect(getPOAssignmentEffectiveStatus(po1Assignment, today)).toBe('Inactive');
      // PO-2 remains active
      expect(getPOAssignmentEffectiveStatus(po2Assignment, today)).toBe('Active');
      // Global employee profile is untouched
      expect(globalEmployee.designation).toBe('Senior Cloud Architect');
    });

    it('derives correct status and billable method in getPOEmployeeEligibleBillingForMonth', () => {
      const mockAssignments: Assignment[] = [
        {
          id: 'asgn-active',
          employeeId: 'PS-001',
          employeeName: 'Rajesh Sharma',
          designation: 'CEO',
          projectId: 'proj-1',
          projectName: 'Cloud Modernization',
          poId: 'po-test-1',
          assignedFrom: '2026-01-01',
          assignedTo: '2026-12-31',
          allocationPercentage: 100,
          billingRatePerMonth: 300000,
          status: 'Active',
          billableDaysMethod: 'working_days',
        },
        {
          id: 'asgn-expired',
          employeeId: 'PS-002',
          employeeName: 'Priya Sharma',
          designation: 'VP Delivery',
          projectId: 'proj-1',
          projectName: 'Cloud Modernization',
          poId: 'po-test-1',
          assignedFrom: '2026-01-01',
          assignedTo: '2026-05-31', // Expired as of June 2026
          allocationPercentage: 50,
          billingRatePerMonth: 200000,
          status: 'Active',
          billableDaysMethod: 'calendar',
        },
      ];

      const breakdown = getPOEmployeeEligibleBillingForMonth({
        poId: 'po-test-1',
        assignments: mockAssignments,
        billingYear: 2026,
        billingMonth: 'June',
        asOfDate: '2026-06-01',
      });

      expect(breakdown.length).toBe(2);

      // Active employee in June 2026
      const activeItem = breakdown.find((b) => b.employeeId === 'PS-001')!;
      expect(activeItem.status).toBe('Active');
      expect(activeItem.billableDaysMethod).toBe('working_days');
      expect(activeItem.eligibleAmount).toBe(300000);

      // Expired employee in June 2026
      const expiredItem = breakdown.find((b) => b.employeeId === 'PS-002')!;
      expect(expiredItem.status).toBe('Inactive');
      expect(expiredItem.eligibleDays).toBe(0);
      expect(expiredItem.eligibleAmount).toBe(0);
    });
  });
});
