import { ALL_PERMISSION_KEYS, AppRole, AppUser, AppUserStatus, PermissionKey } from '../types/access';
import { ApiRequestError } from './apiClient';

// Translates between what the API sends and what the Users & Roles screens already expect.
// The screens were built against a local demo store, and they should not have to change shape.

export interface ApiRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isLocked: boolean;
  userCount: number;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';
  employeeId: string | null;
  roles: { id: string; key: string; name: string }[];
  lockedUntil: string | null;
  inviteExpiresAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

/** What login, refresh and `/auth/me` return for the signed-in person. */
export interface ApiSessionUser {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  roles: { id: string; key: string; name: string }[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface ApiAuditItem {
  id: string;
  at: string;
  actorName: string;
  action: string;
  target: string | null;
  details: string | null;
}

export interface Session {
  user: AppUser;
  /** Straight from the server, so screens work for people who cannot list roles. */
  permissions: PermissionKey[];
  roleNames: string[];
}

/**
 * The seven built-in roles keep the ids the screens already use (`role-ceo` and so on). Custom roles use the
 * server's own id. This is also what makes "is this person a CEO" checks in the screens keep working.
 */
export const SYSTEM_ROLE_ID: Record<string, string> = {
  CEO: 'role-ceo',
  HR_HEAD: 'role-hr-head',
  HR_EXECUTIVE: 'role-hr-executive',
  FINANCE_MANAGER: 'role-finance-manager',
  PO_ADMIN: 'role-po-admin',
  PROJECT_MANAGER: 'role-project-manager',
  EMPLOYEE: 'role-employee',
};

const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSION_KEYS);
export const isKnownPermission = (key: string): key is PermissionKey => KNOWN_PERMISSIONS.has(key);

/** The screens' id for a role: a fixed id for built-in roles, the server's id for custom ones. */
export function screenRoleId(role: { id: string; key: string }): string {
  return SYSTEM_ROLE_ID[role.key] ?? role.id;
}

export function toAppRole(role: ApiRole): AppRole {
  return {
    id: screenRoleId(role),
    name: role.name,
    description: role.description ?? '',
    builtIn: role.isSystem,
    locked: role.isLocked,
    // Phase 2 and 3 permissions (onboarding, payslips...) exist on the server but have no screen yet.
    permissions: role.permissions.filter(isKnownPermission),
  };
}

const STATUS: Record<ApiUser['status'], AppUserStatus> = {
  ACTIVE: 'Active',
  LOCKED: 'Active', // a lock is shown from `lockedUntil`, not as a separate status
  INVITED: 'Invited',
  DISABLED: 'Disabled',
};

/**
 * `inviteTokens` holds invite links this browser was given while testing, keyed by user id. The server
 * only hands a link out in development; in production the only copy is the email.
 */
export function toAppUser(user: ApiUser, inviteTokens: Record<string, string> = {}): AppUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // An employee link is a database id, not the PS-001 code the screens show, so it is left out for now.
    roleIds: user.roles.map(screenRoleId),
    status: STATUS[user.status],
    invitedAt: user.status === 'INVITED' ? user.createdAt : undefined,
    inviteExpiresAt: user.inviteExpiresAt ?? undefined,
    inviteToken: user.status === 'INVITED' ? inviteTokens[user.id] : undefined,
    lockedUntil: user.lockedUntil ?? undefined,
    mustChangePassword: user.mustChangePassword,
  };
}

export function toSession(user: ApiSessionUser): Session {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleIds: user.roles.map(screenRoleId),
      status: 'Active',
      mustChangePassword: user.mustChangePassword,
      // Marks "has a password" so the change-password screen asks for the current one.
      passwordHash: 'set',
    },
    permissions: user.permissions.filter(isKnownPermission),
    roleNames: user.roles.map((role) => role.name),
  };
}

/** The server's id for a role the screen refers to by its own id. */
export function serverRoleId(screenId: string, roles: ApiRole[]): string {
  return roles.find((role) => screenRoleId(role) === screenId)?.id ?? screenId;
}

/**
 * The role editor only shows the permissions that have screens. Saving must not wipe the others, so
 * everything the editor cannot show is kept and the chosen ones are added.
 */
export function mergeRolePermissions(existing: string[], chosen: PermissionKey[]): string[] {
  const hidden = existing.filter((key) => !isKnownPermission(key));
  return [...new Set([...hidden, ...chosen])].sort();
}

/** The token inside a link like `http://host/?invite=<token>`. */
export function tokenFromLink(link: string | undefined, param: 'invite' | 'reset'): string | undefined {
  if (!link) return undefined;
  try {
    return new URL(link).searchParams.get(param) ?? undefined;
  } catch {
    return undefined;
  }
}

export const errorText = (error: unknown): string =>
  error instanceof ApiRequestError ? error.message : 'Something went wrong. Please try again.';
