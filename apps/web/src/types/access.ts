import { DEMO_USERS, RolePermission, UserRole } from './roles';

// ─── PERMISSIONS ─────────────────────────────────────────────
// Permissions are fixed in code: each one guards a real action.
// Roles are data: a named set of permissions that CEO / HR Head can edit.

export type PermissionKey =
  | 'project.view'
  | 'project.edit'
  | 'po.view'
  | 'po.create'
  | 'po.edit'
  | 'po.renew'
  | 'po.close'
  | 'invoice.view'
  | 'invoice.create'
  | 'invoice.override'
  | 'proforma.view'
  | 'proforma.edit'
  | 'document.view'
  | 'document.upload'
  | 'document.delete'
  | 'assignment.view'
  | 'assignment.edit'
  | 'user.manage'
  | 'role.manage'
  | 'audit.view'
  | 'settings.manage';

export type PermissionColumn = 'view' | 'create' | 'edit' | 'delete' | 'other';

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  column: PermissionColumn;
}

export interface PermissionArea {
  id: string;
  label: string;
  description: string;
  permissions: PermissionDef[];
}

export const PERMISSION_COLUMNS: { id: PermissionColumn; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete / Close' },
  { id: 'other', label: 'Other' },
];

// Phase 1 (PO Management) permission catalog.
// Onboarding, salary and timesheet areas are added in Phases 2 and 3.
export const PERMISSION_AREAS: PermissionArea[] = [
  {
    id: 'projects',
    label: 'Projects',
    description: 'Client projects and their managers',
    permissions: [
      { key: 'project.view', label: 'View', column: 'view' },
      { key: 'project.edit', label: 'Edit', column: 'edit' },
    ],
  },
  {
    id: 'pos',
    label: 'Purchase Orders',
    description: 'POs, SOWs, amendments and renewals',
    permissions: [
      { key: 'po.view', label: 'View', column: 'view' },
      { key: 'po.create', label: 'Create', column: 'create' },
      { key: 'po.edit', label: 'Edit', column: 'edit' },
      { key: 'po.close', label: 'Close', column: 'delete' },
      { key: 'po.renew', label: 'Renew', column: 'other' },
    ],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    description: 'Invoices, credit notes and PO balance',
    permissions: [
      { key: 'invoice.view', label: 'View', column: 'view' },
      { key: 'invoice.create', label: 'Create', column: 'create' },
      { key: 'invoice.override', label: 'Override balance', column: 'other' },
    ],
  },
  {
    id: 'proforma',
    label: 'Proforma Invoices',
    description: 'Proforma drafts, preview and sharing',
    permissions: [
      { key: 'proforma.view', label: 'View', column: 'view' },
      { key: 'proforma.edit', label: 'Edit', column: 'edit' },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'PO scans, SOWs and other files',
    permissions: [
      { key: 'document.view', label: 'View', column: 'view' },
      { key: 'document.upload', label: 'Upload', column: 'create' },
      { key: 'document.delete', label: 'Delete', column: 'delete' },
    ],
  },
  {
    id: 'assignments',
    label: 'Employee Assignments',
    description: 'Tagging employees to POs and projects',
    permissions: [
      { key: 'assignment.view', label: 'View', column: 'view' },
      { key: 'assignment.edit', label: 'Edit', column: 'edit' },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    description: 'Users, roles, audit log and alert settings',
    permissions: [
      { key: 'audit.view', label: 'Audit log', column: 'view' },
      { key: 'user.manage', label: 'Manage users', column: 'other' },
      { key: 'role.manage', label: 'Manage roles', column: 'other' },
      { key: 'settings.manage', label: 'Alert settings', column: 'other' },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_AREAS.flatMap((a) =>
  a.permissions.map((p) => p.key)
);

// ─── ROLES & USERS ───────────────────────────────────────────

export interface AppRole {
  id: string;
  name: string;
  description: string;
  builtIn: boolean; // created at setup; cannot be deleted
  locked: boolean; // permissions cannot be changed (CEO)
  permissions: PermissionKey[];
}

export type AppUserStatus = 'Active' | 'Invited' | 'Disabled';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  employeeId?: string;
  roleIds: string[];
  status: AppUserStatus;
  invitedAt?: string;
  // Demo-mode credentials. The backend stores argon2id hashes server-side instead.
  passwordHash?: string;
  mustChangePassword?: boolean;
  failedLoginCount?: number;
  lockedUntil?: string; // ISO timestamp
  inviteToken?: string;
  inviteExpiresAt?: string;
  resetToken?: string;
  resetExpiresAt?: string;
}

export type AccessAuditAction =
  | 'System setup'
  | 'User invited'
  | 'Invite resent'
  | 'User updated'
  | 'Roles changed'
  | 'User disabled'
  | 'User enabled'
  | 'Role created'
  | 'Role updated'
  | 'Role deleted'
  | 'Invite accepted'
  | 'Password changed'
  | 'Password reset'
  | 'Password change required'
  | 'Account locked'
  | 'Account unlocked';

export interface AccessAuditEntry {
  id: string;
  at: string; // ISO timestamp
  actorName: string;
  action: AccessAuditAction;
  target: string;
  details: string;
}

export const CEO_ROLE_ID = 'role-ceo';
export const HR_HEAD_ROLE_ID = 'role-hr-head';
export const EMPLOYEE_ROLE_ID = 'role-employee';

// Map from the legacy single-role field on demo users to the built-in role ids
export const BUILT_IN_ROLE_ID: Record<UserRole, string> = {
  CEO: CEO_ROLE_ID,
  'HR Head': HR_HEAD_ROLE_ID,
  'HR Executive': 'role-hr-executive',
  'Finance Manager': 'role-finance-manager',
  'PO Admin': 'role-po-admin',
  'Project Manager': 'role-project-manager',
  Employee: EMPLOYEE_ROLE_ID,
};

const VIEW_ALL_PO: PermissionKey[] = [
  'project.view',
  'po.view',
  'invoice.view',
  'proforma.view',
  'document.view',
  'assignment.view',
];

// Defaults follow the role matrix in the HRMS Architecture doc (section 11)
export const DEFAULT_ROLES: AppRole[] = [
  {
    id: CEO_ROLE_ID,
    name: 'CEO',
    description: 'Full access to everything. Cannot be edited.',
    builtIn: true,
    locked: true,
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    id: HR_HEAD_ROLE_ID,
    name: 'HR Head',
    description: 'Senior HR. Manages users and roles; views PO data.',
    builtIn: true,
    locked: false,
    permissions: [...VIEW_ALL_PO, 'assignment.edit', 'user.manage', 'role.manage', 'audit.view'],
  },
  {
    id: 'role-hr-executive',
    name: 'HR Executive',
    description: 'Day-to-day HR work. Views employee assignments only in Phase 1.',
    builtIn: true,
    locked: false,
    permissions: ['assignment.view'],
  },
  {
    id: 'role-finance-manager',
    name: 'Finance Manager',
    description: 'View-only access to POs, invoices and the audit log.',
    builtIn: true,
    locked: false,
    permissions: [...VIEW_ALL_PO, 'audit.view'],
  },
  {
    id: 'role-po-admin',
    name: 'PO Admin',
    description: 'Creates and manages POs, invoices and renewals.',
    builtIn: true,
    locked: false,
    permissions: [
      ...VIEW_ALL_PO,
      'project.edit',
      'po.create',
      'po.edit',
      'po.renew',
      'po.close',
      'invoice.create',
      'invoice.override',
      'proforma.edit',
      'document.upload',
      'document.delete',
      'assignment.edit',
      'settings.manage',
    ],
  },
  {
    id: 'role-project-manager',
    name: 'Project Manager',
    description: 'Views POs and invoices for their projects.',
    builtIn: true,
    locked: false,
    permissions: [...VIEW_ALL_PO],
  },
  {
    id: EMPLOYEE_ROLE_ID,
    name: 'Employee',
    description: 'Self-service portal (Phase 3). No PO access.',
    builtIn: true,
    locked: false,
    permissions: [],
  },
];

export const DEFAULT_USERS: AppUser[] = [
  ...DEMO_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    employeeId: u.employeeId,
    roleIds: [BUILT_IN_ROLE_ID[u.role]],
    status: 'Active' as AppUserStatus,
  })),
  {
    id: 'usr-8',
    name: 'Meera Iyer',
    email: 'meera.iyer@primestarconsulting.com',
    roleIds: ['role-project-manager'],
    status: 'Invited',
    invitedAt: '2026-10-16T10:30:00.000Z',
    inviteToken: 'demo-invite-meera-iyer',
    inviteExpiresAt: '2099-12-31T00:00:00.000Z',
  },
];

export const DEFAULT_AUDIT: AccessAuditEntry[] = [
  {
    id: 'audit-setup',
    at: '2026-10-13T09:00:00.000Z',
    actorName: 'System',
    action: 'System setup',
    target: 'Built-in roles',
    details: '7 built-in roles and the first CEO account created.',
  },
];

// ─── DERIVED ACCESS ──────────────────────────────────────────

export function permissionsForUser(user: AppUser | undefined, roles: AppRole[]): Set<PermissionKey> {
  const keys = new Set<PermissionKey>();
  if (!user || user.status !== 'Active') return keys;
  user.roleIds.forEach((rid) => {
    roles.find((r) => r.id === rid)?.permissions.forEach((k) => keys.add(k));
  });
  return keys;
}

// Translates permission keys into the flags the existing PO screens read.
// HR-only flags keep their defaults until Phases 2–3 move them to keys.
export function toScreenPermissions(keys: Set<PermissionKey>, base: RolePermission): RolePermission {
  const has = (k: PermissionKey) => keys.has(k);
  return {
    ...base,
    canViewPODashboard: has('po.view') || has('project.view'),
    canManagePOs: has('po.create') || has('po.edit'),
    canViewFinancials: has('invoice.view'),
    canManageInvoices: has('invoice.create'),
    canManageSOW: has('po.edit'),
    canAssignEmployeesToPO: has('assignment.edit'),
    canManageUserRoles: has('user.manage') || has('role.manage'),
    canViewAuditLogs: has('audit.view'),
  };
}
