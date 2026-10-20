export type UserRole =
  | 'CEO'
  | 'HR Head'
  | 'HR Executive'
  | 'Finance Manager'
  | 'PO Admin'
  | 'Project Manager'
  | 'Employee';

export interface RolePermission {
  canViewPODashboard: boolean;
  canManagePOs: boolean;
  canViewFinancials: boolean;
  canManageInvoices: boolean;
  canManageSOW: boolean;
  canAssignEmployeesToPO: boolean;
  canViewOnboarding: boolean;
  canManageOnboarding: boolean;
  canReviewCandidates: boolean;
  canReleaseOffers: boolean;
  canViewEmployeeDirectory: boolean;
  canManageEmployees: boolean;
  canManageSalaryStructures: boolean;
  canApproveTimesheets: boolean;
  canViewReports: boolean;
  isEmployeeOnly: boolean;
  canDirectlyEditProfiles: boolean;
  canReviewProfileChangeRequests: boolean;
  canRequestProfileChanges: boolean;
  canManageCompanySettings: boolean;
  canManageUserRoles: boolean;
  canViewAuditLogs: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermission> = {
  CEO: {
    canViewPODashboard: true,
    canManagePOs: true,
    canViewFinancials: true,
    canManageInvoices: true,
    canManageSOW: true,
    canAssignEmployeesToPO: true,
    canViewOnboarding: true,
    canManageOnboarding: true,
    canReviewCandidates: true,
    canReleaseOffers: true,
    canViewEmployeeDirectory: true,
    canManageEmployees: true,
    canManageSalaryStructures: true,
    canApproveTimesheets: true,
    canViewReports: true,
    isEmployeeOnly: false,
    canDirectlyEditProfiles: true, // CEO has full administrative access to edit employee profiles
    canReviewProfileChangeRequests: true, // CEO can approve or reject profile change requests
    canRequestProfileChanges: true,
    canManageCompanySettings: true,
    canManageUserRoles: true,
    canViewAuditLogs: true,
  },
  'HR Head': {
    canViewPODashboard: true,
    canManagePOs: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canManageSOW: false,
    canAssignEmployeesToPO: true,
    canViewOnboarding: true,
    canManageOnboarding: true,
    canReviewCandidates: true,
    canReleaseOffers: true,
    canViewEmployeeDirectory: true,
    canManageEmployees: true,
    canManageSalaryStructures: true,
    canApproveTimesheets: true,
    canViewReports: true,
    isEmployeeOnly: false,
    canDirectlyEditProfiles: true, // HR Head can directly edit profiles
    canReviewProfileChangeRequests: true, // HR Head reviews profile requests
    canRequestProfileChanges: true,
    canManageCompanySettings: true,
    canManageUserRoles: false,
    canViewAuditLogs: true,
  },
  'HR Executive': {
    canViewPODashboard: true,
    canManagePOs: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canManageSOW: false,
    canAssignEmployeesToPO: false,
    canViewOnboarding: true,
    canManageOnboarding: true,
    canReviewCandidates: true,
    canReleaseOffers: false,
    canViewEmployeeDirectory: true,
    canManageEmployees: false,
    canManageSalaryStructures: false,
    canApproveTimesheets: false,
    canViewReports: false,
    isEmployeeOnly: false,
    canDirectlyEditProfiles: true, // HR Executive can edit profiles
    canReviewProfileChangeRequests: true,
    canRequestProfileChanges: true,
    canManageCompanySettings: false,
    canManageUserRoles: false,
    canViewAuditLogs: false,
  },
  'Finance Manager': {
    canViewPODashboard: true,
    canManagePOs: false,
    canViewFinancials: true,
    canManageInvoices: true,
    canManageSOW: true,
    canAssignEmployeesToPO: false,
    canViewOnboarding: false,
    canManageOnboarding: false,
    canReviewCandidates: false,
    canReleaseOffers: false,
    canViewEmployeeDirectory: true,
    canManageEmployees: false,
    canManageSalaryStructures: true,
    canApproveTimesheets: false,
    canViewReports: true,
    isEmployeeOnly: false,
    canDirectlyEditProfiles: false,
    canReviewProfileChangeRequests: false,
    canRequestProfileChanges: true,
    canManageCompanySettings: false,
    canManageUserRoles: false,
    canViewAuditLogs: false,
  },
  'PO Admin': {
    canViewPODashboard: true,
    canManagePOs: true,
    canViewFinancials: true,
    canManageInvoices: true,
    canManageSOW: true,
    canAssignEmployeesToPO: true,
    canViewOnboarding: false,
    canManageOnboarding: false,
    canReviewCandidates: false,
    canReleaseOffers: false,
    canViewEmployeeDirectory: true,
    canManageEmployees: false,
    canManageSalaryStructures: false,
    canApproveTimesheets: false,
    canViewReports: true,
    isEmployeeOnly: false,
    canDirectlyEditProfiles: false,
    canReviewProfileChangeRequests: false,
    canRequestProfileChanges: true,
    canManageCompanySettings: false,
    canManageUserRoles: false,
    canViewAuditLogs: false,
  },
  'Project Manager': {
    canViewPODashboard: true,
    canManagePOs: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canManageSOW: true,
    canAssignEmployeesToPO: true,
    canViewOnboarding: false,
    canManageOnboarding: false,
    canReviewCandidates: false,
    canReleaseOffers: false,
    canViewEmployeeDirectory: true,
    canManageEmployees: false,
    canManageSalaryStructures: false,
    canApproveTimesheets: true,
    canViewReports: true,
    isEmployeeOnly: false,
    canDirectlyEditProfiles: false,
    canReviewProfileChangeRequests: false,
    canRequestProfileChanges: true,
    canManageCompanySettings: false,
    canManageUserRoles: false,
    canViewAuditLogs: false,
  },
  Employee: {
    canViewPODashboard: false,
    canManagePOs: false,
    canViewFinancials: false,
    canManageInvoices: false,
    canManageSOW: false,
    canAssignEmployeesToPO: false,
    canViewOnboarding: false,
    canManageOnboarding: false,
    canReviewCandidates: false,
    canReleaseOffers: false,
    canViewEmployeeDirectory: false,
    canManageEmployees: false,
    canManageSalaryStructures: false,
    canApproveTimesheets: false,
    canViewReports: false,
    isEmployeeOnly: true,
    canDirectlyEditProfiles: false, // Employees cannot directly edit
    canReviewProfileChangeRequests: false,
    canRequestProfileChanges: true,
    canManageCompanySettings: false,
    canManageUserRoles: false,
    canViewAuditLogs: false,
  },
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  designation: string;
  department: string;
  avatarUrl?: string;
  employeeId?: string;
}

export const DEMO_USERS: UserProfile[] = [
  {
    id: 'usr-1',
    name: 'Rajesh Sharma',
    email: 'rajesh.sharma@primestarconsulting.com',
    role: 'CEO',
    designation: 'Chief Executive Officer',
    department: 'Executive Office',
    employeeId: 'PS-001',
  },
  {
    id: 'usr-2',
    name: 'Priya Sundaram',
    email: 'priya.s@primestarconsulting.com',
    role: 'HR Head',
    designation: 'Head of Human Resources',
    department: 'Human Resources',
    employeeId: 'PS-012',
  },
  {
    id: 'usr-3',
    name: 'Ananya Roy',
    email: 'ananya.roy@primestarconsulting.com',
    role: 'HR Executive',
    designation: 'HR Onboarding Specialist',
    department: 'Human Resources',
    employeeId: 'PS-034',
  },
  {
    id: 'usr-4',
    name: 'Vikramaditya Rao',
    email: 'vikram.rao@primestarconsulting.com',
    role: 'Finance Manager',
    designation: 'Senior Finance & Accounts Lead',
    department: 'Finance',
    employeeId: 'PS-018',
  },
  {
    id: 'usr-5',
    name: 'Kavita Nair',
    email: 'kavita.nair@primestarconsulting.com',
    role: 'PO Admin',
    designation: 'PO & Billing Operations Lead',
    department: 'Operations',
    employeeId: 'PS-022',
  },
  {
    id: 'usr-6',
    name: 'Siddharth Mehta',
    email: 'siddharth.m@primestarconsulting.com',
    role: 'Project Manager',
    designation: 'Delivery Director — Cloud & Analytics',
    department: 'Consulting Delivery',
    employeeId: 'PS-015',
  },
  {
    id: 'usr-7',
    name: 'Rohan Deshmukh',
    email: 'rohan.d@primestarconsulting.com',
    role: 'Employee',
    designation: 'Senior Cloud Architect',
    department: 'Technology Consulting',
    employeeId: 'PS-108',
  },
];

export const ROLE_EMPLOYEE_ID_MAP: Record<UserRole, string> = {
  CEO: 'PS-001',
  'HR Head': 'PS-012',
  'HR Executive': 'PS-034',
  'Finance Manager': 'PS-018',
  'PO Admin': 'PS-022',
  'Project Manager': 'PS-015',
  Employee: 'PS-108',
};

export function getInitials(name: string): string {
  if (!name) return 'PS';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}
