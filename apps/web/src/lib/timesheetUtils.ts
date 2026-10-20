import { TimesheetEntry, DailyTimesheet } from '../types/domain';

export interface TimesheetMetrics {
  totalTimesheets: number;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  billablePercentage: number;
  pendingApprovals: number;
  approvedCount: number;
  unlockRequestsCount: number;
  rejectedCount: number;
  draftCount: number;
  activeConsultantsCount: number;
}

/**
 * Calculates comprehensive aggregate metrics for a collection of timesheets.
 */
export function calculateTimesheetMetrics(timesheets: TimesheetEntry[]): TimesheetMetrics {
  let totalHours = 0;
  let billableHours = 0;
  let nonBillableHours = 0;
  let pendingApprovals = 0;
  let approvedCount = 0;
  let unlockRequestsCount = 0;
  let rejectedCount = 0;
  let draftCount = 0;

  const uniqueEmployees = new Set<string>();

  timesheets.forEach((ts) => {
    if (ts.employeeId) uniqueEmployees.add(ts.employeeId);
    else if (ts.employeeName) uniqueEmployees.add(ts.employeeName);

    totalHours += ts.totalHours || 0;

    // Calculate billable vs non-billable hours from daily logs
    if (ts.dailyLogs && ts.dailyLogs.length > 0) {
      ts.dailyLogs.forEach((log) => {
        if (log.category === 'Project Delivery' || log.category === 'Client Meeting') {
          billableHours += log.hoursSpent || 0;
        } else {
          nonBillableHours += log.hoursSpent || 0;
        }
      });
    } else {
      // Default fallback if no daily logs itemized
      billableHours += ts.totalHours || 0;
    }

    switch (ts.status) {
      case 'Submitted':
        pendingApprovals++;
        break;
      case 'Approved':
        approvedCount++;
        break;
      case 'Unlock Requested':
        unlockRequestsCount++;
        break;
      case 'Rejected':
        rejectedCount++;
        break;
      case 'Draft':
        draftCount++;
        break;
    }
  });

  const billablePercentage = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  return {
    totalTimesheets: timesheets.length,
    totalHours,
    billableHours,
    nonBillableHours,
    billablePercentage,
    pendingApprovals,
    approvedCount,
    unlockRequestsCount,
    rejectedCount,
    draftCount,
    activeConsultantsCount: uniqueEmployees.size,
  };
}

/**
 * Itemized hours breakdown by category for a single timesheet entry.
 */
export function calculateCategoryBreakdown(timesheet: TimesheetEntry): Record<string, number> {
  const breakdown: Record<string, number> = {
    'Project Delivery': 0,
    'Client Meeting': 0,
    'Internal Operations': 0,
    Training: 0,
    Leave: 0,
  };

  if (timesheet.dailyLogs) {
    timesheet.dailyLogs.forEach((log) => {
      if (breakdown[log.category] !== undefined) {
        breakdown[log.category] += log.hoursSpent || 0;
      } else {
        breakdown[log.category] = (breakdown[log.category] || 0) + (log.hoursSpent || 0);
      }
    });
  }

  return breakdown;
}

export interface TimesheetFilterOptions {
  searchQuery?: string;
  statusFilter?: string;
  projectFilter?: string;
  departmentFilter?: string;
}

/**
 * Filter timesheets based on search query, status, project, and department.
 */
export function filterTimesheets(
  timesheets: TimesheetEntry[],
  options: TimesheetFilterOptions
): TimesheetEntry[] {
  const { searchQuery = '', statusFilter = 'All', projectFilter = 'All', departmentFilter = 'All' } = options;

  const query = searchQuery.trim().toLowerCase();

  return timesheets.filter((ts) => {
    // Search query matching
    if (query) {
      const matchesName = ts.employeeName.toLowerCase().includes(query);
      const matchesEmpId = ts.employeeId.toLowerCase().includes(query);
      const matchesProject = ts.projectName.toLowerCase().includes(query);
      const matchesTask = ts.dailyLogs?.some((log) =>
        log.taskDescription.toLowerCase().includes(query)
      );

      if (!matchesName && !matchesEmpId && !matchesProject && !matchesTask) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'All' && ts.status !== statusFilter) {
      return false;
    }

    // Project filter
    if (projectFilter !== 'All' && ts.projectName !== projectFilter) {
      return false;
    }

    // Department filter
    if (departmentFilter !== 'All' && ts.department && ts.department !== departmentFilter) {
      return false;
    }

    return true;
  });
}

/**
 * Formats timesheet data into a downloadable CSV string.
 */
export function exportTimesheetsToCsv(timesheets: TimesheetEntry[]): string {
  const headers = [
    'Timesheet ID',
    'Employee ID',
    'Employee Name',
    'Department',
    'Project Name',
    'Start Date',
    'End Date',
    'Total Hours',
    'Status',
    'Submitted At',
    'Approver',
    'Rejection / Unlock Reason',
  ];

  const rows = timesheets.map((ts) => [
    ts.id,
    ts.employeeId,
    `"${ts.employeeName.replace(/"/g, '""')}"`,
    `"${(ts.department || 'Delivery').replace(/"/g, '""')}"`,
    `"${ts.projectName.replace(/"/g, '""')}"`,
    ts.periodStartDate,
    ts.periodEndDate,
    ts.totalHours,
    ts.status,
    ts.submittedAt || '',
    `"${(ts.approverName || '').replace(/"/g, '""')}"`,
    `"${(ts.rejectionReason || ts.unlockReason || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
