import { describe, expect, it } from 'vitest';
import {
  checkCanDeleteRole,
  checkCanDisable,
  checkCanEditRole,
  checkCanEditUser,
  checkRoleAssignment,
  findUnknownPermissions,
  type RuleRole,
  type RuleUser,
} from './accessRules.js';
import { ChangePasswordBody, CreateUserBody, LoginBody, Password } from './auth.js';
import { ROLE_DEFAULTS } from './permissions.js';

const user = (id: string, roleKeys: string[], status: RuleUser['status'] = 'ACTIVE'): RuleUser => ({
  id,
  status,
  roleKeys,
  permissions: new Set(roleKeys.flatMap((key) => (ROLE_DEFAULTS as Record<string, readonly string[]>)[key] ?? [])),
});

const ceo = user('ceo', ['CEO']);
const hrHead = user('hr', ['HR_HEAD']);
const poAdmin = user('po', ['PO_ADMIN']);

describe('passwords', () => {
  it('accepts a strong password and lists every missing rule on a weak one', () => {
    expect(Password.safeParse('Strong@123').success).toBe(true);
    const weak = Password.safeParse('abc');
    expect(weak.success).toBe(false);
    expect(JSON.stringify(weak.error?.issues)).toMatch(/at least 8 characters.*uppercase.*number.*special/);
  });

  it('rejects a very long password before it reaches argon2', () => {
    expect(Password.safeParse('Aa1!' + 'x'.repeat(200)).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('lowercases and trims emails', () => {
    expect(LoginBody.parse({ email: '  CEO@PrimeStar.Test ', password: 'x' }).email).toBe('ceo@primestar.test');
  });

  it('requires at least one role when creating a user', () => {
    expect(CreateUserBody.safeParse({ name: 'A', email: 'a@b.co', roleIds: [] }).success).toBe(false);
  });

  it('checks the new password on change-password', () => {
    expect(ChangePasswordBody.safeParse({ currentPassword: 'old', newPassword: 'weak' }).success).toBe(false);
  });
});

describe('who may change whom', () => {
  it('blocks editing your own access', () => {
    expect(checkCanEditUser(hrHead, hrHead)).toMatch(/own access/);
  });

  it('only a CEO can change a CEO', () => {
    expect(checkCanEditUser(hrHead, ceo)).toMatch(/Only a CEO/);
    expect(checkCanEditUser(user('ceo2', ['CEO']), ceo)).toBeNull();
  });

  it('needs the user.manage permission', () => {
    expect(checkCanEditUser(poAdmin, hrHead)).toMatch(/permission/);
  });

  it('only a CEO can hand out the CEO role', () => {
    expect(checkRoleAssignment(hrHead, poAdmin, ['CEO'], [ceo, hrHead, poAdmin])).toMatch(/Only a CEO/);
    expect(checkRoleAssignment(ceo, poAdmin, ['CEO'], [ceo, hrHead, poAdmin])).toBeNull();
  });

  it('keeps the last active CEO and HR Head', () => {
    const users = [ceo, hrHead, poAdmin];
    expect(checkRoleAssignment(hrHead, ceo, ['PO_ADMIN'], users)).toMatch(/last active CEO/);
    expect(checkCanDisable(ceo, hrHead, users)).toMatch(/last active HR Head/);
    expect(checkCanDisable(ceo, hrHead, [...users, user('hr2', ['HR_HEAD'])])).toBeNull();
  });

  it('allows removing the CEO role when another active CEO exists', () => {
    const second = user('ceo2', ['CEO']);
    expect(checkRoleAssignment(second, ceo, ['PO_ADMIN'], [ceo, second])).toBeNull();
  });

  it('does not count a disabled CEO as a spare', () => {
    const disabled = user('ceo2', ['CEO'], 'DISABLED');
    expect(checkRoleAssignment(user('x', ['CEO']), ceo, ['PO_ADMIN'], [ceo, disabled])).toMatch(/last active CEO/);
  });
});

describe('roles', () => {
  const role = (key: string, over: Partial<RuleRole> = {}): RuleRole => ({
    id: key,
    key,
    name: key,
    isSystem: false,
    isLocked: false,
    ...over,
  });

  it('never lets anyone edit a locked role', () => {
    expect(checkCanEditRole(ceo, role('CEO', { isLocked: true, isSystem: true }))).toMatch(/locked/);
  });

  it('only a CEO can change the HR Head role, and nobody edits a role they hold', () => {
    expect(checkCanEditRole(hrHead, role('HR_HEAD', { isSystem: true }))).toMatch(/Only a CEO/);
    const custom = user('c', ['PO_ADMIN', 'CUSTOM']);
    custom.permissions = new Set(['role.manage']);
    expect(checkCanEditRole(custom, role('CUSTOM'))).toMatch(/yourself/);
  });

  it('refuses to delete built-in roles or roles still in use', () => {
    expect(checkCanDeleteRole(ceo, role('PO_ADMIN', { isSystem: true }), 0)).toMatch(/Built-in/);
    expect(checkCanDeleteRole(ceo, role('CUSTOM'), 3)).toMatch(/3 user/);
    expect(checkCanDeleteRole(ceo, role('CUSTOM'), 0)).toBeNull();
  });

  it('rejects unknown permission names', () => {
    expect(findUnknownPermissions(['po.view', 'po.vieww'])).toEqual(['po.vieww']);
  });
});
