import React, { useEffect, useState, ReactNode } from 'react';
import {
  AccessAuditAction,
  AccessAuditEntry,
  AppRole,
  AppUser,
  AppUserStatus,
  DEFAULT_AUDIT,
  DEFAULT_ROLES,
  DEFAULT_USERS,
  PermissionKey,
} from '../types/access';
import {
  checkCanDeleteRole,
  checkCanEditRole,
  checkCanEditUser,
  checkRoleAssignment,
  checkRoleName,
  checkStatusChange,
  checkUserDetails,
  hasPermission,
} from '../lib/accessRules';
import {
  INVITE_VALID_DAYS,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  RESET_VALID_MINUTES,
  addMinutes,
  checkNewPassword,
  hashPassword,
  isLocked,
  minutesUntil,
  randomToken,
} from '../lib/passwordDemo';
import {
  AccessContext,
  AccessContextType,
  AccessResult,
  LoginResult,
  TokenLookup,
} from './accessTypes';

// Demo-mode store for users, roles and the access audit log.
// Saved in this browser only. The API provider (ApiAccessProvider) replaces it when the backend is used.

const STORAGE_KEYS = {
  ROLES: 'primestar_access_roles',
  USERS: 'primestar_access_users',
  AUDIT: 'primestar_access_audit',
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked (private window); the page still works for this session.
  }
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const fail = (error: string): AccessResult => ({ ok: false, error });
const OK: AccessResult = { ok: true };
const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

/** The demo provider: users, roles and the audit log live in this browser (localStorage). */
export const MockAccessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [roles, setRoles] = useState<AppRole[]>(() => load(STORAGE_KEYS.ROLES, DEFAULT_ROLES));
  const [users, setUsers] = useState<AppUser[]>(() => load(STORAGE_KEYS.USERS, DEFAULT_USERS));
  const [audit, setAudit] = useState<AccessAuditEntry[]>(() => load(STORAGE_KEYS.AUDIT, DEFAULT_AUDIT));

  useEffect(() => save(STORAGE_KEYS.ROLES, roles), [roles]);
  useEffect(() => save(STORAGE_KEYS.USERS, users), [users]);
  useEffect(() => save(STORAGE_KEYS.AUDIT, audit), [audit]);

  // Another tab (e.g. an invite link opened in a new window) changed the data: take its copy,
  // so this tab does not overwrite it with stale state on its next save.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === STORAGE_KEYS.USERS) setUsers(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.ROLES) setRoles(JSON.parse(e.newValue));
        if (e.key === STORAGE_KEYS.AUDIT) setAudit(JSON.parse(e.newValue));
      } catch {
        // Ignore malformed data from other tabs.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const log = (actor: AppUser, action: AccessAuditAction, target: string, details: string) => {
    setAudit((prev) => [
      { id: newId('audit'), at: new Date().toISOString(), actorName: actor.name, action, target, details },
      ...prev,
    ]);
  };

  const roleNames = (ids: string[]) =>
    ids.map((id) => roles.find((r) => r.id === id)?.name || id).join(', ') || 'none';

  const inviteUser: AccessContextType['inviteUser'] = (actor, input) => {
    if (!hasPermission(actor, roles, 'user.manage')) return fail('You do not have permission to manage users.');
    const detailsError = checkUserDetails(input.name, input.email, users);
    if (detailsError) return fail(detailsError);
    const roleError = checkRoleAssignment(actor, null, input.roleIds, users);
    if (roleError) return fail(roleError);

    const user: AppUser = {
      id: newId('usr'),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      roleIds: input.roleIds,
      status: 'Invited',
      invitedAt: new Date().toISOString(),
      inviteToken: randomToken(),
      inviteExpiresAt: addMinutes(new Date(), INVITE_VALID_DAYS * 24 * 60),
    };
    setUsers((prev) => [...prev, user]);
    log(actor, 'User invited', user.name, `${user.email} invited as ${roleNames(user.roleIds)}.`);
    return OK;
  };

  const updateUser: AccessContextType['updateUser'] = (actor, userId, input) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return fail('User not found.');
    const editError = checkCanEditUser(actor, target, roles);
    if (editError) return fail(editError);
    const detailsError = checkUserDetails(input.name, input.email, users, userId);
    if (detailsError) return fail(detailsError);
    const roleError = checkRoleAssignment(actor, target, input.roleIds, users);
    if (roleError) return fail(roleError);

    const rolesChanged =
      [...target.roleIds].sort().join() !== [...input.roleIds].sort().join();
    const detailsChanged = target.name !== input.name.trim() || target.email !== input.email.trim().toLowerCase();

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, name: input.name.trim(), email: input.email.trim().toLowerCase(), roleIds: input.roleIds }
          : u
      )
    );
    if (rolesChanged) {
      log(actor, 'Roles changed', target.name, `${roleNames(target.roleIds)} → ${roleNames(input.roleIds)}`);
    }
    if (detailsChanged) {
      log(actor, 'User updated', target.name, 'Name or email updated.');
    }
    return OK;
  };

  const setUserStatus: AccessContextType['setUserStatus'] = (actor, userId, status) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return fail('User not found.');
    const error = checkStatusChange(actor, target, status, users, roles);
    if (error) return fail(error);

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status } : u)));
    log(
      actor,
      status === 'Disabled' ? 'User disabled' : 'User enabled',
      target.name,
      status === 'Disabled' ? 'Login blocked; active sessions ended.' : 'Login allowed again.'
    );
    return OK;
  };

  const resendInvite: AccessContextType['resendInvite'] = (actor, userId) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return fail('User not found.');
    if (!hasPermission(actor, roles, 'user.manage')) return fail('You do not have permission to manage users.');
    if (target.status !== 'Invited') return fail('Only invited users can be sent a new invite.');

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              invitedAt: new Date().toISOString(),
              inviteToken: randomToken(),
              inviteExpiresAt: addMinutes(new Date(), INVITE_VALID_DAYS * 24 * 60),
            }
          : u
      )
    );
    log(actor, 'Invite resent', target.name, 'New invite link issued; the old link no longer works.');
    return OK;
  };

  const createRole: AccessContextType['createRole'] = (actor, input) => {
    if (!hasPermission(actor, roles, 'role.manage')) return fail('You do not have permission to manage roles.');
    const nameError = checkRoleName(input.name, roles);
    if (nameError) return fail(nameError);

    const role: AppRole = {
      id: newId('role'),
      name: input.name.trim(),
      description: input.description.trim(),
      builtIn: false,
      locked: false,
      permissions: input.permissions,
    };
    setRoles((prev) => [...prev, role]);
    log(actor, 'Role created', role.name, `${role.permissions.length} permission(s).`);
    return OK;
  };

  const updateRole: AccessContextType['updateRole'] = (actor, roleId, input) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return fail('Role not found.');
    const editError = checkCanEditRole(actor, role, roles);
    if (editError) return fail(editError);
    const nameError = checkRoleName(input.name, roles, roleId);
    if (nameError) return fail(nameError);

    const added = input.permissions.filter((k) => !role.permissions.includes(k));
    const removed = role.permissions.filter((k) => !input.permissions.includes(k));

    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              // Built-in role names stay fixed; screens and docs refer to them.
              name: r.builtIn ? r.name : input.name.trim(),
              description: input.description.trim(),
              permissions: input.permissions,
            }
          : r
      )
    );
    const changes = [
      added.length ? `+ ${added.join(', ')}` : '',
      removed.length ? `− ${removed.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    log(actor, 'Role updated', role.name, changes || 'Name or description updated.');
    return OK;
  };

  const deleteRole: AccessContextType['deleteRole'] = (actor, roleId) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return fail('Role not found.');
    const error = checkCanDeleteRole(actor, role, roles, users);
    if (error) return fail(error);

    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    log(actor, 'Role deleted', role.name, 'Custom role removed.');
    return OK;
  };

  const patchUser = (userId: string, patch: Partial<AppUser>) =>
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...patch } : u)));

  const checkLoginAllowed: AccessContextType['checkLoginAllowed'] = (userId) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return fail(GENERIC_LOGIN_ERROR);
    if (user.status === 'Disabled') return fail('This account is disabled. Contact your admin.');
    if (user.status === 'Invited') return fail('This invite has not been accepted yet. Use the link in the invite email.');
    if (isLocked(user.lockedUntil)) {
      return fail(`Too many failed attempts. Try again in ${minutesUntil(user.lockedUntil!)} minute(s).`);
    }
    return OK;
  };

  // Self-service actions (login, invite, reset) are logged under the user's own name.
  const authenticate: AccessContextType['authenticate'] = async (email, password) => {
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return { ok: false, error: GENERIC_LOGIN_ERROR };
    const allowed = checkLoginAllowed(user.id);
    if (!allowed.ok) return allowed;

    // Seeded demo accounts have no password yet and accept any password.
    const matches = !user.passwordHash || (await hashPassword(user.email, password)) === user.passwordHash;
    if (matches) {
      patchUser(user.id, { failedLoginCount: 0, lockedUntil: undefined });
      return { ok: true, user };
    }

    const failures = (user.failedLoginCount || 0) + 1;
    if (failures >= MAX_FAILED_LOGINS) {
      patchUser(user.id, { failedLoginCount: 0, lockedUntil: addMinutes(new Date(), LOCK_MINUTES) });
      log(user, 'Account locked', user.name, `${MAX_FAILED_LOGINS} failed login attempts; locked for ${LOCK_MINUTES} minutes.`);
      return { ok: false, error: `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` };
    }
    patchUser(user.id, { failedLoginCount: failures });
    const left = MAX_FAILED_LOGINS - failures;
    return { ok: false, error: `${GENERIC_LOGIN_ERROR} ${left} attempt(s) left before the account locks.` };
  };

  const findByToken = (kind: 'invite' | 'reset', token: string): TokenLookup => {
    if (!token) return { ok: false, error: 'This link is not valid. Ask for a new one.' };
    const user = users.find((u) => (kind === 'invite' ? u.inviteToken : u.resetToken) === token);
    if (!user) return { ok: false, error: 'This link is not valid or was already used. Ask for a new one.' };
    const expires = kind === 'invite' ? user.inviteExpiresAt : user.resetExpiresAt;
    if (!expires || new Date(expires).getTime() < Date.now()) {
      return { ok: false, error: 'This link has expired. Ask for a new one.' };
    }
    if (kind === 'invite' && user.status !== 'Invited') return { ok: false, error: 'This invite was already used.' };
    if (kind === 'reset' && user.status === 'Disabled') return { ok: false, error: 'This account is disabled.' };
    return { ok: true, user };
  };

  const findInvite = (token: string): TokenLookup => findByToken('invite', token);
  const findReset = (token: string): TokenLookup => findByToken('reset', token);

  const acceptInvite: AccessContextType['acceptInvite'] = async (token, password, confirm) => {
    const found = findInvite(token);
    if (!found.ok) return found;
    const pwError = checkNewPassword(password, confirm);
    if (pwError) return fail(pwError);
    const passwordHash = await hashPassword(found.user.email, password);
    patchUser(found.user.id, {
      status: 'Active',
      passwordHash,
      mustChangePassword: false,
      inviteToken: undefined,
      inviteExpiresAt: undefined,
    });
    log(found.user, 'Invite accepted', found.user.name, 'Password set; account is now active.');
    return OK;
  };

  const requestPasswordReset: AccessContextType['requestPasswordReset'] = (email) => {
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    // Same response whether or not the account exists, so emails cannot be probed.
    if (!user || user.status !== 'Active') return {};
    const resetToken = randomToken();
    patchUser(user.id, { resetToken, resetExpiresAt: addMinutes(new Date(), RESET_VALID_MINUTES) });
    return { resetToken };
  };

  const completePasswordReset: AccessContextType['completePasswordReset'] = async (token, password, confirm) => {
    const found = findReset(token);
    if (!found.ok) return found;
    const pwError = checkNewPassword(password, confirm);
    if (pwError) return fail(pwError);
    const passwordHash = await hashPassword(found.user.email, password);
    patchUser(found.user.id, {
      passwordHash,
      mustChangePassword: false,
      resetToken: undefined,
      resetExpiresAt: undefined,
      failedLoginCount: 0,
      lockedUntil: undefined,
    });
    log(found.user, 'Password reset', found.user.name, 'Password reset through the emailed link.');
    return OK;
  };

  const changePassword: AccessContextType['changePassword'] = async (userId, current, next, confirm) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return fail('User not found.');
    if (user.passwordHash && (await hashPassword(user.email, current)) !== user.passwordHash) {
      return fail('Your current password is incorrect.');
    }
    const pwError = checkNewPassword(next, confirm);
    if (pwError) return fail(pwError);
    if (current && current === next) return fail('Choose a password different from the current one.');
    patchUser(userId, { passwordHash: await hashPassword(user.email, next), mustChangePassword: false });
    log(user, 'Password changed', user.name, 'Password changed by the user.');
    return OK;
  };

  const requirePasswordChange: AccessContextType['requirePasswordChange'] = (actor, userId) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return fail('User not found.');
    const error = checkCanEditUser(actor, target, roles);
    if (error) return fail(error);
    patchUser(userId, { mustChangePassword: true });
    log(actor, 'Password change required', target.name, 'Must set a new password at next login.');
    return OK;
  };

  const unlockUser: AccessContextType['unlockUser'] = (actor, userId) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return fail('User not found.');
    const error = checkCanEditUser(actor, target, roles);
    if (error) return fail(error);
    patchUser(userId, { lockedUntil: undefined, failedLoginCount: 0 });
    log(actor, 'Account unlocked', target.name, 'Login allowed again before the lock expired.');
    return OK;
  };

  const resetAccessData = () => {
    setRoles(DEFAULT_ROLES);
    setUsers(DEFAULT_USERS);
    setAudit(DEFAULT_AUDIT);
  };

  return (
    <AccessContext.Provider
      value={{
        mode: 'demo',
        session: null,
        restoring: false,
        signOut: async () => {},
        roles,
        users,
        audit,
        inviteUser,
        updateUser,
        setUserStatus,
        resendInvite,
        createRole,
        updateRole,
        deleteRole,
        authenticate,
        checkLoginAllowed,
        findInvite,
        acceptInvite,
        requestPasswordReset,
        findReset,
        completePasswordReset,
        changePassword,
        requirePasswordChange,
        unlockUser,
        resetAccessData,
      }}
    >
      {children}
    </AccessContext.Provider>
  );
};
