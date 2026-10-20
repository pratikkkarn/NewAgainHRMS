import type { RoleKey } from './enums.js';

/**
 * Permission names checked by the API guard on every endpoint and by the frontend to hide controls.
 * Roles are stored in the database; ROLE_DEFAULTS only seeds them.
 * "Own" and "team" scopes are enforced in services, not by these names alone.
 * Source: Architecture doc, section 11, merged with the Phase 1 frontend (Users & Roles screen).
 */

/** Phase 1, PO management. The frontend's Users & Roles screen uses exactly these. */
export const PHASE1_PERMISSIONS = [
  'project.view',
  'project.edit',
  'po.view',
  'po.create',
  'po.edit',
  'po.renew',
  'po.close',
  'invoice.view',
  'invoice.create',
  'invoice.override',
  'proforma.view',
  'proforma.edit',
  'document.view',
  'document.upload',
  'document.delete',
  'assignment.view',
  'assignment.edit',
  'user.manage',
  'role.manage',
  'audit.view',
  'settings.manage',
] as const;

/** Phases 2 and 3, onboarding and the employee portal. */
export const HR_PERMISSIONS = [
  'onboarding.edit',
  'offer.view',
  'offer.draft',
  'offer.edit',
  'ctcLimit.view',
  'ctcLimit.edit',
  'employee.view',
  'employee.viewTeam',
  'employee.edit',
  'employee.salary.view',
  'projectManager.view',
  'projectManager.assign',
  'timesheet.view',
  'timesheet.approve',
  'timesheet.approveTeam',
  'payslip.view',
  'payslip.upload',
  'payslip.edit',
  'news.view',
  'news.edit',
  'portal.self',
] as const;

export const PERMISSIONS = [...PHASE1_PERMISSIONS, ...HR_PERMISSIONS] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Read access to all PO data, shared by several roles. */
const VIEW_ALL_PO: readonly Permission[] = [
  'project.view',
  'po.view',
  'invoice.view',
  'proforma.view',
  'document.view',
  'assignment.view',
];

export const ROLE_DEFAULTS: Record<RoleKey, readonly Permission[]> = {
  // Locked role (Role.isLocked): its permissions can't be edited.
  CEO: [
    ...PHASE1_PERMISSIONS,
    'onboarding.edit', 'offer.view', 'offer.draft', 'offer.edit', 'ctcLimit.view', 'ctcLimit.edit',
    'employee.view', 'employee.edit', 'employee.salary.view', 'projectManager.view',
    'projectManager.assign', 'timesheet.view', 'payslip.view', 'payslip.upload', 'payslip.edit',
    'news.view', 'news.edit',
  ],
  HR_HEAD: [
    ...VIEW_ALL_PO, 'assignment.edit', 'user.manage', 'role.manage', 'audit.view',
    'onboarding.edit', 'offer.view', 'offer.draft', 'offer.edit', 'ctcLimit.view', 'ctcLimit.edit',
    'employee.view', 'employee.edit', 'employee.salary.view', 'projectManager.view',
    'projectManager.assign', 'timesheet.view', 'timesheet.approve', 'payslip.view', 'payslip.upload',
    'news.view', 'news.edit',
  ],
  HR_EXECUTIVE: [
    'assignment.view',
    'onboarding.edit', 'offer.draft', 'employee.view', 'employee.edit', 'projectManager.view',
    'projectManager.assign', 'timesheet.view', 'payslip.upload', 'news.view', 'news.edit',
  ],
  FINANCE_MANAGER: [
    ...VIEW_ALL_PO, 'audit.view',
    'offer.view', 'ctcLimit.view', 'employee.view', 'employee.salary.view', 'projectManager.view',
    'timesheet.view', 'payslip.view',
  ],
  PO_ADMIN: [
    ...VIEW_ALL_PO, 'project.edit', 'po.create', 'po.edit', 'po.renew', 'po.close',
    'invoice.create', 'invoice.override', 'proforma.edit', 'document.upload', 'document.delete',
    'assignment.edit', 'settings.manage',
  ],
  // Scoped to their own projects in the services.
  PROJECT_MANAGER: [...VIEW_ALL_PO, 'employee.viewTeam', 'timesheet.approveTeam'],
  EMPLOYEE: ['portal.self', 'news.view', 'projectManager.view'],
};

/** Roles whose permissions can't be edited. */
export const LOCKED_ROLES: readonly RoleKey[] = ['CEO'];

/** A user's permissions are the union of all their roles. */
export function permissionsFor(roles: readonly RoleKey[]): Set<Permission> {
  return new Set(roles.flatMap((role) => ROLE_DEFAULTS[role]));
}
