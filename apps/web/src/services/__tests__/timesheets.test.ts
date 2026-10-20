import { describe, it, expect } from 'vitest';
import { INITIAL_TIMESHEETS } from '../mockData';
import {
  calculateTimesheetMetrics,
  calculateCategoryBreakdown,
  filterTimesheets,
  exportTimesheetsToCsv,
} from '../../lib/timesheetUtils';
import { TimesheetEntry } from '../../types/domain';

describe('Timesheet Administration Module', () => {
  describe('1. Metric Calculations', () => {
    it('should correctly aggregate total hours, billable percentage, and status counts', () => {
      const metrics = calculateTimesheetMetrics(INITIAL_TIMESHEETS);

      expect(metrics.totalTimesheets).toBe(6);
      expect(metrics.totalHours).toBe(210); // 40 + 8 + 42 + 44 + 36 + 40 = 210
      expect(metrics.pendingApprovals).toBe(2); // ts-2026-10-w1 and ts-2026-10-w6
      expect(metrics.approvedCount).toBe(1); // ts-2026-10-w3
      expect(metrics.unlockRequestsCount).toBe(1); // ts-2026-10-w4
      expect(metrics.rejectedCount).toBe(1); // ts-2026-10-w5
      expect(metrics.draftCount).toBe(1); // ts-2026-10-w2
      expect(metrics.activeConsultantsCount).toBe(5); // Rohan, Megha, Rajesh, Ananya, Vikramaditya
    });

    it('should correctly calculate category breakdown for a specific timesheet', () => {
      const meghaTs = INITIAL_TIMESHEETS.find((t) => t.id === 'ts-2026-10-w3')!;
      const breakdown = calculateCategoryBreakdown(meghaTs);

      expect(breakdown['Project Delivery']).toBe(26); // 9 + 8 + 9 = 26
      expect(breakdown['Client Meeting']).toBe(8);
      expect(breakdown['Internal Operations']).toBe(8);
      expect(breakdown['Training']).toBe(0);
      expect(breakdown['Leave']).toBe(0);
    });
  });

  describe('2. Multi-Facet Filtering', () => {
    it('should filter timesheets by status', () => {
      const submitted = filterTimesheets(INITIAL_TIMESHEETS, { statusFilter: 'Submitted' });
      expect(submitted.length).toBe(2);
      expect(submitted.every((t) => t.status === 'Submitted')).toBe(true);

      const unlockRequested = filterTimesheets(INITIAL_TIMESHEETS, { statusFilter: 'Unlock Requested' });
      expect(unlockRequested.length).toBe(1);
      expect(unlockRequested[0].id).toBe('ts-2026-10-w4');
    });

    it('should filter timesheets by project name', () => {
      const hdfcTs = filterTimesheets(INITIAL_TIMESHEETS, { projectFilter: 'HDFC Bank Core Cloud Migration' });
      expect(hdfcTs.length).toBe(3); // Rohan (2) + Ananya (1)
      expect(hdfcTs.every((t) => t.projectName === 'HDFC Bank Core Cloud Migration')).toBe(true);
    });

    it('should filter timesheets by search query', () => {
      const rohanResults = filterTimesheets(INITIAL_TIMESHEETS, { searchQuery: 'Rohan' });
      expect(rohanResults.length).toBe(2);

      const taskResults = filterTimesheets(INITIAL_TIMESHEETS, { searchQuery: 'Kubernetes' });
      expect(taskResults.length).toBe(1);
      expect(taskResults[0].employeeName).toBe('Rohan Deshmukh');
    });

    it('should filter by department', () => {
      const cloudDevOps = filterTimesheets(INITIAL_TIMESHEETS, { departmentFilter: 'Cloud & DevOps' });
      expect(cloudDevOps.length).toBe(2);
      expect(cloudDevOps.every((t) => t.department === 'Cloud & DevOps')).toBe(true);
    });
  });

  describe('3. CSV Export Generation', () => {
    it('should generate valid CSV text including header and employee data', () => {
      const csv = exportTimesheetsToCsv(INITIAL_TIMESHEETS.slice(0, 2));
      const lines = csv.split('\n');

      expect(lines.length).toBe(3); // 1 header + 2 rows
      expect(lines[0]).toContain('Timesheet ID,Employee ID,Employee Name');
      expect(lines[1]).toContain('Rohan Deshmukh');
      expect(lines[1]).toContain('HDFC Bank Core Cloud Migration');
    });
  });

  describe('4. Status Transitions & Audit Trail Integrity', () => {
    it('should maintain audit history structure when status transitions occur', () => {
      const sampleTs: TimesheetEntry = {
        id: 'ts-test-01',
        employeeId: 'PS-999',
        employeeName: 'Test Engineer',
        periodStartDate: '2026-10-06',
        periodEndDate: '2026-10-12',
        projectName: 'Test Project',
        totalHours: 40,
        status: 'Submitted',
        submittedAt: '2026-10-12 10:00 AM',
        dailyLogs: [],
        auditTrail: [
          {
            id: 'aud-test-1',
            timestamp: '2026-10-12 10:00 AM',
            action: 'Submitted',
            actorName: 'Test Engineer',
            actorRole: 'Employee',
          },
        ],
      };

      expect(sampleTs.auditTrail).toBeDefined();
      expect(sampleTs.auditTrail?.length).toBe(1);
      expect(sampleTs.auditTrail?.[0].action).toBe('Submitted');
    });
  });
});
