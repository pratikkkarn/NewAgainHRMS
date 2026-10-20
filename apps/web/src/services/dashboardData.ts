export interface DashboardSummary {
  totalPOs: number;
  totalPOValueStr: string;
  activePOs: number;
  activePOValueStr: string;
  expiringSoonPOs: number;
  expiringValueStr: string;
  lowBalancePOs: number;
  lowBalanceValueStr: string;
  totalPOValueRaw: number; // in INR
  remainingBalanceRaw: number; // in INR
  totalPOValueDisplay: string; // "₹0"
  remainingBalanceDisplay: string; // "₹0"
  invoicedAmountDisplay: string; // "₹0"
  totalProjects: number;
  totalEmployees: number;
  pendingOnboarding: number;
  pendingTimesheets: number;
  unreadNotifications: number;
}

export interface ProjectChartData {
  projectName: string;
  totalValue: number;
  remainingBalance: number;
}

export interface POStatusDistributionData {
  name: string;
  value: number;
  color: string;
}

export interface RecentPORecord {
  id: string;
  poNumber: string;
  projectName: string;
  requester: string;
  startDate: string;
  endDate: string;
  poValue: number;
  remainingBalance: number;
  status: 'Active' | 'Expiring Soon' | 'Expired' | 'Exhausted';
}

// Zero-default data source for unpopulated frontend preview state
export const DASHBOARD_SUMMARY_DATA: DashboardSummary = {
  totalPOs: 0,
  totalPOValueStr: '₹0 total value',
  activePOs: 0,
  activePOValueStr: '₹0 active',
  expiringSoonPOs: 0,
  expiringValueStr: '₹0 expiring',
  lowBalancePOs: 0,
  lowBalanceValueStr: '₹0 remaining',
  totalPOValueRaw: 0,
  remainingBalanceRaw: 0,
  totalPOValueDisplay: '₹0',
  remainingBalanceDisplay: '₹0',
  invoicedAmountDisplay: '₹0',
  totalProjects: 0,
  totalEmployees: 0,
  pendingOnboarding: 0,
  pendingTimesheets: 0,
  unreadNotifications: 0,
};

export const PROJECT_CHART_DATA: ProjectChartData[] = [
  { projectName: 'HP Infra', totalValue: 0, remainingBalance: 0 },
  { projectName: 'TCS Support', totalValue: 0, remainingBalance: 0 },
  { projectName: 'Bangalore DC', totalValue: 0, remainingBalance: 0 },
  { projectName: 'HDFC Cloud', totalValue: 0, remainingBalance: 0 },
  { projectName: 'Other Projects', totalValue: 0, remainingBalance: 0 },
];

export const STATUS_DISTRIBUTION_DATA: POStatusDistributionData[] = [
  { name: 'Active', value: 0, color: '#10B981' },
  { name: 'Expiring Soon', value: 0, color: '#F59E0B' },
  { name: 'Low Balance', value: 0, color: '#EF4444' },
  { name: 'Expired / Exhausted', value: 0, color: '#6B7280' },
];

export const RECENT_PO_RECORDS: RecentPORecord[] = [];
