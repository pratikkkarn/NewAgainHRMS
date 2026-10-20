import { createContext, useContext } from 'react';
import type { Session } from '../lib/accessApi';
import type { AccessAuditEntry, AppRole, AppUser, AppUserStatus, PermissionKey } from '../types/access';

// What the screens use to read and change users, roles and sign-in state. Two providers implement it:
// the demo one (data kept in this browser) and the API one (the real backend). Screens cannot tell which.

/** The demo provider answers at once; the API provider answers after the request. Screens `await` either. */
export type Maybe<T> = T | Promise<T>;

export type AccessResult = { ok: true } | { ok: false; error: string };
export type LoginResult = { ok: true; user: AppUser } | { ok: false; error: string };
export type TokenLookup = { ok: true; user: AppUser } | { ok: false; error: string };

export interface UserInput {
  name: string;
  email: string;
  roleIds: string[];
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface AccessContextType {
  /** `api` talks to the backend; `demo` keeps everything in this browser. */
  mode: 'api' | 'demo';
  /** The signed-in person (API mode). Always null in demo mode, where the role switcher decides. */
  session: Session | null;
  /** True while a saved session is being restored after a page reload. */
  restoring: boolean;
  signOut: () => Promise<void>;

  roles: AppRole[];
  users: AppUser[];
  audit: AccessAuditEntry[];
  inviteUser: (actor: AppUser, input: UserInput) => Maybe<AccessResult>;
  updateUser: (actor: AppUser, userId: string, input: UserInput) => Maybe<AccessResult>;
  setUserStatus: (actor: AppUser, userId: string, status: AppUserStatus) => Maybe<AccessResult>;
  resendInvite: (actor: AppUser, userId: string) => Maybe<AccessResult>;
  createRole: (actor: AppUser, input: RoleInput) => Maybe<AccessResult>;
  updateRole: (actor: AppUser, roleId: string, input: RoleInput) => Maybe<AccessResult>;
  deleteRole: (actor: AppUser, roleId: string) => Maybe<AccessResult>;
  // Account security
  authenticate: (email: string, password: string) => Promise<LoginResult>;
  checkLoginAllowed: (userId: string) => AccessResult;
  findInvite: (token: string) => Maybe<TokenLookup>;
  acceptInvite: (token: string, password: string, confirm: string) => Promise<AccessResult>;
  requestPasswordReset: (email: string) => Maybe<{ resetToken?: string }>;
  findReset: (token: string) => Maybe<TokenLookup>;
  completePasswordReset: (token: string, password: string, confirm: string) => Promise<AccessResult>;
  changePassword: (userId: string, current: string, next: string, confirm: string) => Promise<AccessResult>;
  requirePasswordChange: (actor: AppUser, userId: string) => Maybe<AccessResult>;
  unlockUser: (actor: AppUser, userId: string) => Maybe<AccessResult>;
  resetAccessData: () => void;
}

export const AccessContext = createContext<AccessContextType | undefined>(undefined);

export const useAccess = (): AccessContextType => {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useAccess must be used within an AccessProvider');
  }
  return context;
};
