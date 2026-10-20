import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiAuditItem,
  ApiRole,
  ApiSessionUser,
  ApiUser,
  errorText,
  mergeRolePermissions,
  screenRoleId,
  serverRoleId,
  Session,
  toAppRole,
  toAppUser,
  toSession,
  tokenFromLink,
} from '../lib/accessApi';
import {
  api,
  clearTokens,
  hasStoredSession,
  LoginPayload,
  onSessionLost,
  refreshSession,
  setTokens,
} from '../lib/apiClient';
import { checkNewPassword } from '../lib/passwordDemo';
import { AccessAuditAction, AccessAuditEntry, PermissionKey } from '../types/access';
import { AccessContext, AccessContextType, AccessResult, TokenLookup } from './accessTypes';

// The real thing: sign-in, users, roles and the audit log come from the backend (`/api/auth`, `/api/users`,
// `/api/roles`, `/api/audit`). The screens call the same functions as in demo mode; each one now makes a
// request, waits, reloads what changed, and reports back as `{ ok }` or `{ ok: false, error }`.
//
// The server is the one that decides. The screens still check the same rules first, only to explain them.

const INVITE_TOKENS_KEY = 'primestar_dev_invite_tokens';

const OK: AccessResult = { ok: true };
const fail = (error: string): AccessResult => ({ ok: false, error });
const failLookup = (error: string): TokenLookup => ({ ok: false, error });

/** Invite links this browser was handed while testing. Dropped when the tab closes. */
function loadInviteTokens(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(INVITE_TOKENS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

const toAuditEntry = (item: ApiAuditItem): AccessAuditEntry => ({
  id: item.id,
  at: item.at,
  actorName: item.actorName,
  action: item.action as AccessAuditAction,
  target: item.target ?? '',
  details: item.details ?? '',
});

async function loadAllUsers(): Promise<ApiUser[]> {
  const users: ApiUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await api<{ items: ApiUser[]; total: number }>('GET', '/users', { query: { page, pageSize: 100 } });
    users.push(...result.items);
    if (users.length >= result.total || result.items.length === 0) break;
  }
  return users;
}

export const ApiAccessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  // A saved session is restored after a reload, and the app waits for that before choosing a screen.
  const [restoring, setRestoring] = useState<boolean>(hasStoredSession);
  const [apiRoles, setApiRoles] = useState<ApiRole[]>([]);
  const [apiUsers, setApiUsers] = useState<ApiUser[]>([]);
  const [audit, setAudit] = useState<AccessAuditEntry[]>([]);
  const [inviteTokens, setInviteTokens] = useState<Record<string, string>>(loadInviteTokens);
  const permissionsRef = useRef<PermissionKey[]>([]);

  useEffect(() => {
    try {
      sessionStorage.setItem(INVITE_TOKENS_KEY, JSON.stringify(inviteTokens));
    } catch {
      // Storage can be blocked; the links then only last until a reload.
    }
  }, [inviteTokens]);

  const roles = useMemo(() => apiRoles.map(toAppRole), [apiRoles]);
  const users = useMemo(() => apiUsers.map((user) => toAppUser(user, inviteTokens)), [apiUsers, inviteTokens]);

  const clearData = useCallback(() => {
    permissionsRef.current = [];
    setApiRoles([]);
    setApiUsers([]);
    setAudit([]);
  }, []);

  /** Loads only what this person is allowed to see; the server would refuse the rest. */
  const loadLists = useCallback(async (permissions: PermissionKey[]): Promise<void> => {
    const can = (key: PermissionKey) => permissions.includes(key);
    const jobs: Promise<unknown>[] = [];
    if (can('user.manage') || can('role.manage') || can('settings.manage')) {
      jobs.push(api<ApiRole[]>('GET', '/roles').then(setApiRoles));
    }
    if (can('user.manage')) jobs.push(loadAllUsers().then(setApiUsers));
    if (can('audit.view')) {
      jobs.push(
        api<{ items: (ApiAuditItem & { entityType: string })[] }>('GET', '/audit', { query: { pageSize: 100 } }).then((result) =>
          // This tab is about access, so other kinds of audit entry stay out of it.
          setAudit(result.items.filter((item) => ['User', 'Role', 'System'].includes(item.entityType)).map(toAuditEntry))
        )
      );
    }
    await Promise.allSettled(jobs);
  }, []);

  const startSession = useCallback(
    (user: ApiSessionUser): Session => {
      const next = toSession(user);
      permissionsRef.current = next.permissions;
      setSession(next);
      return next;
    },
    []
  );

  // Restore a saved session on load, and drop back to the sign-in page if the server ends the session.
  useEffect(() => {
    let cancelled = false;
    onSessionLost(() => {
      setSession(null);
      clearData();
    });
    (async () => {
      if (!hasStoredSession()) {
        setRestoring(false);
        return;
      }
      const payload = await refreshSession();
      if (cancelled) return;
      if (payload) {
        const restored = startSession(payload.user as ApiSessionUser);
        void loadLists(restored.permissions);
      }
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
      onSessionLost(null);
    };
  }, [clearData, loadLists, startSession]);

  const reload = () => loadLists(permissionsRef.current);

  /** Runs a request, reloads the lists it may have changed, and reports the outcome the way the screens expect. */
  const run = async (action: () => Promise<void>): Promise<AccessResult> => {
    try {
      await action();
      await reload();
      return OK;
    } catch (error) {
      return fail(errorText(error));
    }
  };

  const rememberInviteLink = (userId: string, link: string | undefined) => {
    const token = tokenFromLink(link, 'invite');
    if (token) setInviteTokens((prev) => ({ ...prev, [userId]: token }));
  };

  const ids = (screenIds: string[]) => screenIds.map((id) => serverRoleId(id, apiRoles));

  // ─── Sign in and out ───────────────────────────────────────────────────

  const authenticate: AccessContextType['authenticate'] = async (email, password) => {
    try {
      const payload = await api<LoginPayload>('POST', '/auth/login', { body: { email, password }, anonymous: true });
      setTokens(payload);
      const started = startSession(payload.user as ApiSessionUser);
      void loadLists(started.permissions);
      return { ok: true, user: started.user };
    } catch (error) {
      return { ok: false, error: errorText(error) };
    }
  };

  const signOut: AccessContextType['signOut'] = async () => {
    // The request starts with the current token, then this browser forgets the session straight away, so the
    // app returns to the sign-in page at once instead of waiting for the server.
    const request = api('POST', '/auth/logout').catch(() => undefined);
    clearTokens();
    setSession(null);
    clearData();
    await request;
  };

  // ─── Users ─────────────────────────────────────────────────────────────

  const inviteUser: AccessContextType['inviteUser'] = (_actor, input) =>
    run(async () => {
      const created = await api<{ user: ApiUser; devInviteLink?: string }>('POST', '/users', {
        body: { name: input.name, email: input.email, roleIds: ids(input.roleIds) },
      });
      rememberInviteLink(created.user.id, created.devInviteLink);
    });

  const updateUser: AccessContextType['updateUser'] = (_actor, userId, input) =>
    run(async () => {
      const updated = await api<{ devInviteLink?: string }>('PATCH', `/users/${userId}`, {
        body: { name: input.name, email: input.email, roleIds: ids(input.roleIds) },
      });
      rememberInviteLink(userId, updated.devInviteLink);
    });

  const setUserStatus: AccessContextType['setUserStatus'] = (_actor, userId, status) =>
    run(async () => {
      const result = await api<{ devInviteLink?: string } | undefined>('POST', `/users/${userId}/${status === 'Disabled' ? 'disable' : 'enable'}`);
      rememberInviteLink(userId, result?.devInviteLink);
    });

  const resendInvite: AccessContextType['resendInvite'] = (_actor, userId) =>
    run(async () => {
      const result = await api<{ devInviteLink?: string }>('POST', `/users/${userId}/resend-invite`);
      rememberInviteLink(userId, result.devInviteLink);
    });

  const requirePasswordChange: AccessContextType['requirePasswordChange'] = (_actor, userId) =>
    run(() => api('POST', `/users/${userId}/require-password-change`));

  const unlockUser: AccessContextType['unlockUser'] = (_actor, userId) => run(() => api('POST', `/users/${userId}/unlock`));

  // ─── Roles ─────────────────────────────────────────────────────────────

  const createRole: AccessContextType['createRole'] = (_actor, input) =>
    run(() =>
      api('POST', '/roles', {
        body: { name: input.name.trim(), description: input.description.trim(), permissions: input.permissions },
      })
    );

  const updateRole: AccessContextType['updateRole'] = (_actor, roleId, input) => {
    const existing = apiRoles.find((role) => screenRoleId(role) === roleId);
    if (!existing) return fail('Role not found.');
    return run(() =>
      api('PATCH', `/roles/${existing.id}`, {
        body: {
          // Built-in role names stay fixed; screens and docs refer to them.
          name: existing.isSystem ? undefined : input.name.trim(),
          description: input.description.trim(),
          // The editor only shows permissions that have screens, so the others are kept, not wiped.
          permissions: mergeRolePermissions(existing.permissions, input.permissions),
        },
      })
    );
  };

  const deleteRole: AccessContextType['deleteRole'] = (_actor, roleId) => {
    const existing = apiRoles.find((role) => screenRoleId(role) === roleId);
    if (!existing) return fail('Role not found.');
    return run(() => api('DELETE', `/roles/${existing.id}`));
  };

  // ─── Passwords and links ───────────────────────────────────────────────

  const lookup = async (kind: 'invite' | 'reset', token: string): Promise<TokenLookup> => {
    if (!token) return failLookup('This link is not valid. Ask for a new one.');
    try {
      const info = await api<{ name: string; email: string }>('GET', '/auth/link-info', {
        query: { kind, token },
        anonymous: true,
      });
      return {
        ok: true,
        user: { id: '', name: info.name, email: info.email, roleIds: [], status: kind === 'invite' ? 'Invited' : 'Active' },
      };
    } catch (error) {
      return failLookup(errorText(error));
    }
  };

  const acceptInvite: AccessContextType['acceptInvite'] = async (token, password, confirm) => {
    const problem = checkNewPassword(password, confirm);
    if (problem) return fail(problem);
    try {
      const payload = await api<LoginPayload>('POST', '/auth/accept-invite', { body: { token, password }, anonymous: true });
      // Accepting also signs the person in on the server. They sign in on the next screen instead, so end that session.
      await api('POST', '/auth/logout', { token: payload.accessToken }).catch(() => undefined);
      return OK;
    } catch (error) {
      return fail(errorText(error));
    }
  };

  const requestPasswordReset: AccessContextType['requestPasswordReset'] = async (email) => {
    const result = await api<{ devResetLink?: string }>('POST', '/auth/forgot', { body: { email }, anonymous: true });
    // Only present outside production, where no email is sent.
    return { resetToken: tokenFromLink(result.devResetLink, 'reset') };
  };

  const completePasswordReset: AccessContextType['completePasswordReset'] = async (token, password, confirm) => {
    const problem = checkNewPassword(password, confirm);
    if (problem) return fail(problem);
    try {
      await api('POST', '/auth/reset', { body: { token, password }, anonymous: true });
      return OK;
    } catch (error) {
      return fail(errorText(error));
    }
  };

  const changePassword: AccessContextType['changePassword'] = async (_userId, current, next, confirm) => {
    const problem = checkNewPassword(next, confirm);
    if (problem) return fail(problem);
    if (current && current === next) return fail('Choose a password different from the current one.');
    try {
      await api('POST', '/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      // The "must change your password" flag is now off, and the lists that were blocked can load.
      const me = await api<ApiSessionUser>('GET', '/auth/me');
      const refreshed = startSession(me);
      void loadLists(refreshed.permissions);
      return OK;
    } catch (error) {
      return fail(errorText(error));
    }
  };

  return (
    <AccessContext.Provider
      value={{
        mode: 'api',
        session,
        restoring,
        signOut,
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
        // The server decides who may sign in; there is nothing to check before a password is entered.
        checkLoginAllowed: () => OK,
        findInvite: (token) => lookup('invite', token),
        acceptInvite,
        requestPasswordReset,
        findReset: (token) => lookup('reset', token),
        completePasswordReset,
        changePassword,
        requirePasswordChange,
        unlockUser,
        resetAccessData: () => {},
      }}
    >
      {children}
    </AccessContext.Provider>
  );
};
