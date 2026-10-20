import {
  AppRole,
  AppUser,
  AppUserStatus,
  CEO_ROLE_ID,
  HR_HEAD_ROLE_ID,
  PermissionKey,
  permissionsForUser,
} from '../types/access';

// Each check returns an error message, or null when the action is allowed.
// The backend must enforce the same rules; these keep the screens honest.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isCeo(user: AppUser): boolean {
  return user.roleIds.includes(CEO_ROLE_ID);
}

export function hasPermission(user: AppUser, roles: AppRole[], key: PermissionKey): boolean {
  return permissionsForUser(user, roles).has(key);
}

export function countActiveCeos(users: AppUser[]): number {
  return users.filter((u) => u.status === 'Active' && isCeo(u)).length;
}

export function usersWithRole(roleId: string, users: AppUser[]): AppUser[] {
  return users.filter((u) => u.roleIds.includes(roleId));
}

// Can the actor open the edit form for this user at all?
export function checkCanEditUser(actor: AppUser, target: AppUser, roles: AppRole[]): string | null {
  if (!hasPermission(actor, roles, 'user.manage')) return 'You do not have permission to manage users.';
  if (actor.id === target.id) return 'You cannot change your own access. Ask another admin.';
  if (isCeo(target) && !isCeo(actor)) return "Only a CEO can change a CEO's access.";
  return null;
}

export function checkUserDetails(
  name: string,
  email: string,
  users: AppUser[],
  editingUserId?: string
): string | null {
  if (!name.trim()) return 'Full name is required.';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.';
  const taken = users.some(
    (u) => u.id !== editingUserId && u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (taken) return 'A user with this email already exists.';
  return null;
}

export function checkRoleAssignment(
  actor: AppUser,
  target: AppUser | null,
  newRoleIds: string[],
  users: AppUser[]
): string | null {
  if (newRoleIds.length === 0) return 'Pick at least one role.';
  const givesCeo = newRoleIds.includes(CEO_ROLE_ID) && !(target && isCeo(target));
  if (givesCeo && !isCeo(actor)) return 'Only a CEO can assign the CEO role.';
  const removesCeo = target !== null && isCeo(target) && !newRoleIds.includes(CEO_ROLE_ID);
  if (removesCeo && target.status === 'Active' && countActiveCeos(users) <= 1) {
    return 'This is the last active CEO. Assign another CEO first.';
  }
  return null;
}

export function checkStatusChange(
  actor: AppUser,
  target: AppUser,
  newStatus: AppUserStatus,
  users: AppUser[],
  roles: AppRole[]
): string | null {
  const editError = checkCanEditUser(actor, target, roles);
  if (editError) return editError;
  if (newStatus === 'Disabled' && isCeo(target) && target.status === 'Active' && countActiveCeos(users) <= 1) {
    return 'This is the last active CEO and cannot be disabled.';
  }
  return null;
}

export function checkCanEditRole(actor: AppUser, role: AppRole, roles: AppRole[]): string | null {
  if (!hasPermission(actor, roles, 'role.manage')) return 'You do not have permission to manage roles.';
  if (role.locked) return `The ${role.name} role is locked and always has full access.`;
  if (role.id === HR_HEAD_ROLE_ID && !isCeo(actor)) return 'Only a CEO can change the HR Head role.';
  if (actor.roleIds.includes(role.id) && !isCeo(actor)) return 'You cannot change a role you hold yourself.';
  return null;
}

export function checkRoleName(name: string, roles: AppRole[], editingRoleId?: string): string | null {
  if (!name.trim()) return 'Role name is required.';
  const taken = roles.some(
    (r) => r.id !== editingRoleId && r.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (taken) return 'A role with this name already exists.';
  return null;
}

export function checkCanDeleteRole(actor: AppUser, role: AppRole, roles: AppRole[], users: AppUser[]): string | null {
  if (!hasPermission(actor, roles, 'role.manage')) return 'You do not have permission to manage roles.';
  if (role.builtIn) return 'Built-in roles cannot be deleted.';
  const holders = usersWithRole(role.id, users).length;
  if (holders > 0) return `${holders} user(s) still have this role. Reassign them first.`;
  return null;
}
