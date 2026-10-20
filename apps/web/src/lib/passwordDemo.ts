// Password helpers for demo mode (no backend yet).
// The real system hashes with argon2id on the server; nothing here is a
// substitute for that. It only lets the screens behave like the real flows.

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const INVITE_VALID_DAYS = 7;
export const RESET_VALID_MINUTES = 60;

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'digit', label: 'One number', test: (pw) => /\d/.test(pw) },
  { id: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function failedPasswordRules(pw: string): PasswordRule[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw));
}

export function checkNewPassword(pw: string, confirm: string): string | null {
  const failed = failedPasswordRules(pw);
  if (failed.length > 0) return `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.`;
  if (pw !== confirm) return 'The two passwords do not match.';
  return null;
}

export async function hashPassword(email: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`primestar-demo:${email.toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function minutesUntil(iso: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 60_000));
}

export function isLocked(lockedUntil: string | undefined, now = new Date()): boolean {
  return !!lockedUntil && new Date(lockedUntil).getTime() > now.getTime();
}

export function linkWithParam(param: 'invite' | 'reset', token: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${param}=${encodeURIComponent(token)}`;
}
