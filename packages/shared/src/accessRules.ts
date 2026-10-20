import { PERMISSIONS, type Permission } from './permissions.js';

/**
 * Who may change whom. The API enforces these on every request; the frontend runs the same
 * checks to keep its screens honest. Each check returns an error message, or null when allowed.
 */

export interface RuleUser {
  id: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';
  roleKeys: string[];
  permissions: ReadonlySet<string>;
}

export interface RuleRole {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  isLocked: boolean;
}

/** Roles that must always have at least one active holder (Architecture doc, section 11). */
export const PROTECTED_ROLE_KEYS = ['CEO', 'HR_HEAD'] as const;

const PROTECTED_ROLE_LABEL: Record<(typeof PROTECTED_ROLE_KEYS)[number], string> = {
  CEO: 'CEO',
  HR_HEAD: 'HR Head',
};

export const isCeo = (user: Pick<RuleUser, 'roleKeys'>): boolean => user.roleKeys.includes('CEO');

export function countActiveHolders(users: readonly RuleUser[], roleKey: string): number {
  return users.filter((u) => u.status === 'ACTIVE' && u.roleKeys.includes(roleKey)).length;
}

export function checkCanEditUser(actor: RuleUser, target: RuleUser): string | null {
  if (!actor.permissions.has('user.manage')) return 'You do not have permission to manage users.';
  if (actor.id === target.id) return 'You cannot change your own access. Ask another admin.';
  if (isCeo(target) && !isCeo(actor)) return "Only a CEO can change a CEO's access.";
  return null;
}

/** `newRoleKeys` is the full list of roles the target will have afterwards. */
export function checkRoleAssignment(
  actor: RuleUser,
  target: RuleUser | null,
  newRoleKeys: readonly string[],
  users: readonly RuleUser[],
): string | null {
  if (newRoleKeys.length === 0) return 'Pick at least one role.';
  const givesCeo = newRoleKeys.includes('CEO') && !(target && isCeo(target));
  if (givesCeo && !isCeo(actor)) return 'Only a CEO can assign the CEO role.';
  for (const key of PROTECTED_ROLE_KEYS) {
    const removes = target !== null && target.roleKeys.includes(key) && !newRoleKeys.includes(key);
    if (removes && target.status === 'ACTIVE' && countActiveHolders(users, key) <= 1) {
      return `This is the last active ${PROTECTED_ROLE_LABEL[key]}. Assign another one first.`;
    }
  }
  return null;
}

export function checkCanDisable(actor: RuleUser, target: RuleUser, users: readonly RuleUser[]): string | null {
  const editError = checkCanEditUser(actor, target);
  if (editError) return editError;
  for (const key of PROTECTED_ROLE_KEYS) {
    if (target.roleKeys.includes(key) && target.status === 'ACTIVE' && countActiveHolders(users, key) <= 1) {
      return `This is the last active ${PROTECTED_ROLE_LABEL[key]} and cannot be disabled.`;
    }
  }
  return null;
}

export function checkCanEditRole(actor: RuleUser, role: RuleRole): string | null {
  if (!actor.permissions.has('role.manage')) return 'You do not have permission to manage roles.';
  if (role.isLocked) return `The ${role.name} role is locked and always has full access.`;
  if (role.key === 'HR_HEAD' && !isCeo(actor)) return 'Only a CEO can change the HR Head role.';
  if (actor.roleKeys.includes(role.key) && !isCeo(actor)) return 'You cannot change a role you hold yourself.';
  return null;
}

export function checkCanDeleteRole(actor: RuleUser, role: RuleRole, holders: number): string | null {
  if (!actor.permissions.has('role.manage')) return 'You do not have permission to manage roles.';
  if (role.isSystem) return 'Built-in roles cannot be deleted.';
  if (holders > 0) return `${holders} user(s) still have this role. Reassign them first.`;
  return null;
}

/** Unknown permission names are rejected, so a typo can't silently grant nothing. */
export function findUnknownPermissions(permissions: readonly string[]): string[] {
  const known = new Set<string>(PERMISSIONS);
  return permissions.filter((p) => !known.has(p as Permission));
}
