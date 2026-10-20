import { z } from 'zod';

/** Lockout, token and link lifetimes. Mirrors the Architecture doc, section 12. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const INVITE_VALID_DAYS = 7;
export const RESET_VALID_MINUTES = 60;
export const ACCESS_TOKEN_MINUTES = 15;
export const REFRESH_TOKEN_DAYS = 7;
/** A rotated refresh token still works for this long, so two tabs refreshing together aren't logged out. */
export const REFRESH_GRACE_SECONDS = 30;

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'digit', label: 'One number', test: (pw) => /\d/.test(pw) },
  { id: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function failedPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password));
}

/** The upper bound stops a huge password from being used to burn CPU in argon2. */
export const Password = z
  .string()
  .max(128, 'Password is too long')
  .superRefine((password, ctx) => {
    const failed = failedPasswordRules(password);
    if (failed.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Password needs: ${failed.map((rule) => rule.label.toLowerCase()).join(', ')}.`,
      });
    }
  });

/** Emails are stored lowercase. */
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));

export const LoginBody = z.object({ email: Email, password: z.string().min(1).max(128) });
export type LoginBody = z.infer<typeof LoginBody>;

export const RefreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
export type RefreshBody = z.infer<typeof RefreshBody>;

export const ForgotPasswordBody = z.object({ email: Email });
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>;

export const TokenPasswordBody = z.object({ token: z.string().min(20).max(200), password: Password });
export type TokenPasswordBody = z.infer<typeof TokenPasswordBody>;

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: Password,
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;

export const CreateUserBody = z.object({
  name: z.string().trim().min(1, 'Full name is required.').max(120),
  email: Email,
  roleIds: z.array(z.uuid()).min(1, 'Pick at least one role.'),
  employeeId: z.uuid().optional(),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const UpdateUserBody = z.object({
  name: z.string().trim().min(1, 'Full name is required.').max(120).optional(),
  email: Email.optional(),
  roleIds: z.array(z.uuid()).min(1, 'Pick at least one role.').optional(),
});
export type UpdateUserBody = z.infer<typeof UpdateUserBody>;

export const CreateRoleBody = z.object({
  name: z.string().trim().min(1, 'Role name is required.').max(60),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleBody = z.infer<typeof CreateRoleBody>;

export const UpdateRoleBody = CreateRoleBody.partial();
export type UpdateRoleBody = z.infer<typeof UpdateRoleBody>;

/** What `GET /me` and the login response return. */
export const SessionUser = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  employeeId: z.uuid().nullable(),
  roles: z.array(z.object({ id: z.uuid(), key: z.string(), name: z.string() })),
  permissions: z.array(z.string()),
  mustChangePassword: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUser>;

export const AccessAuditAction = z.enum([
  'System setup',
  'User invited',
  'Invite resent',
  'User updated',
  'Roles changed',
  'User disabled',
  'User enabled',
  'Role created',
  'Role updated',
  'Role deleted',
  'Invite accepted',
  'Password changed',
  'Password reset',
  'Password change required',
  'Account locked',
  'Account unlocked',
  'Login succeeded',
  'Login failed',
]);
export type AccessAuditAction = z.infer<typeof AccessAuditAction>;
