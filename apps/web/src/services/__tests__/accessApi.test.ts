import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_ID } from '../../types/access';
import {
  ApiRole,
  ApiUser,
  mergeRolePermissions,
  screenRoleId,
  serverRoleId,
  SYSTEM_ROLE_ID,
  toAppRole,
  toAppUser,
  toSession,
  tokenFromLink,
} from '../../lib/accessApi';

const apiRole = (over: Partial<ApiRole> = {}): ApiRole => ({
  id: '0192a000-0000-7000-8000-000000000001',
  key: 'PO_ADMIN',
  name: 'PO Admin',
  description: 'Creates POs',
  permissions: ['po.view', 'po.create', 'onboarding.edit'],
  isSystem: true,
  isLocked: false,
  userCount: 2,
  ...over,
});

const apiUser = (over: Partial<ApiUser> = {}): ApiUser => ({
  id: '0192a000-0000-7000-8000-0000000000aa',
  name: 'Kavita Nair',
  email: 'kavita@primestar.test',
  status: 'ACTIVE',
  employeeId: null,
  roles: [{ id: '0192a000-0000-7000-8000-000000000001', key: 'PO_ADMIN', name: 'PO Admin' }],
  lockedUntil: null,
  inviteExpiresAt: null,
  mustChangePassword: false,
  createdAt: '2026-10-18T10:00:00.000Z',
  ...over,
});

describe('role ids', () => {
  it('give the built-in roles the ids the screens already use', () => {
    expect(SYSTEM_ROLE_ID).toEqual({
      CEO: BUILT_IN_ROLE_ID['CEO'],
      HR_HEAD: BUILT_IN_ROLE_ID['HR Head'],
      HR_EXECUTIVE: BUILT_IN_ROLE_ID['HR Executive'],
      FINANCE_MANAGER: BUILT_IN_ROLE_ID['Finance Manager'],
      PO_ADMIN: BUILT_IN_ROLE_ID['PO Admin'],
      PROJECT_MANAGER: BUILT_IN_ROLE_ID['Project Manager'],
      EMPLOYEE: BUILT_IN_ROLE_ID['Employee'],
    });
  });

  it('keep the server id for custom roles, and map back both ways', () => {
    const custom = apiRole({ id: 'srv-custom-1', key: 'CUSTOM_AB12CD34', isSystem: false });
    expect(screenRoleId(custom)).toBe('srv-custom-1');
    const roles = [apiRole(), custom];
    expect(serverRoleId('role-po-admin', roles)).toBe(apiRole().id);
    expect(serverRoleId('srv-custom-1', roles)).toBe('srv-custom-1');
  });
});

describe('toAppRole', () => {
  it('hides permissions that have no screen yet and carries the flags', () => {
    const role = toAppRole(apiRole({ isLocked: true }));
    expect(role).toMatchObject({ id: 'role-po-admin', builtIn: true, locked: true });
    expect(role.permissions).toEqual(['po.view', 'po.create']);
  });

  it('turns a missing description into an empty string', () => {
    expect(toAppRole(apiRole({ description: null })).description).toBe('');
  });
});

describe('toAppUser', () => {
  it('maps statuses, treating a locked account as active with a lock time', () => {
    expect(toAppUser(apiUser()).status).toBe('Active');
    expect(toAppUser(apiUser({ status: 'DISABLED' })).status).toBe('Disabled');
    expect(toAppUser(apiUser({ status: 'INVITED' })).status).toBe('Invited');
    const locked = toAppUser(apiUser({ status: 'ACTIVE', lockedUntil: '2026-10-18T11:00:00.000Z' }));
    expect(locked).toMatchObject({ status: 'Active', lockedUntil: '2026-10-18T11:00:00.000Z' });
  });

  it('attaches an invite link only to invited users who have one', () => {
    const invited = apiUser({ status: 'INVITED', inviteExpiresAt: '2026-10-25T10:00:00.000Z' });
    expect(toAppUser(invited, { [invited.id]: 'tok-123' })).toMatchObject({
      inviteToken: 'tok-123',
      invitedAt: invited.createdAt,
      inviteExpiresAt: '2026-10-25T10:00:00.000Z',
    });
    expect(toAppUser(invited).inviteToken).toBeUndefined();
    expect(toAppUser(apiUser(), { [apiUser().id]: 'stale' }).inviteToken).toBeUndefined();
  });

  it('never carries passwords or hashes', () => {
    expect(JSON.stringify(toAppUser(apiUser()))).not.toMatch(/passwordHash/);
  });
});

describe('toSession', () => {
  it('keeps server permissions the screens know and the role names for display', () => {
    const session = toSession({
      id: 'u1',
      name: 'Rajesh Sharma',
      email: 'ceo@primestar.test',
      employeeId: null,
      roles: [{ id: 'r1', key: 'CEO', name: 'CEO' }],
      permissions: ['po.view', 'user.manage', 'payslip.view'],
      mustChangePassword: true,
    });
    expect(session.permissions).toEqual(['po.view', 'user.manage']);
    expect(session.roleNames).toEqual(['CEO']);
    expect(session.user).toMatchObject({ roleIds: ['role-ceo'], status: 'Active', mustChangePassword: true });
    expect(session.user.passwordHash).toBeTruthy();
  });
});

describe('mergeRolePermissions', () => {
  it('keeps permissions the editor cannot show, so saving a role does not wipe them', () => {
    const merged = mergeRolePermissions(['po.view', 'onboarding.edit', 'payslip.view'], ['po.view', 'po.create']);
    expect(merged).toEqual(['onboarding.edit', 'payslip.view', 'po.create', 'po.view']);
  });

  it('removes a permission the editor unticked', () => {
    expect(mergeRolePermissions(['po.view', 'po.create'], ['po.view'])).toEqual(['po.view']);
  });
});

describe('tokenFromLink', () => {
  it('reads the token from invite and reset links', () => {
    expect(tokenFromLink('http://localhost:3000/?invite=abc_DEF-123', 'invite')).toBe('abc_DEF-123');
    expect(tokenFromLink('http://localhost:3000/?reset=zzz', 'reset')).toBe('zzz');
    expect(tokenFromLink('http://localhost:3000/?reset=zzz', 'invite')).toBeUndefined();
    expect(tokenFromLink(undefined, 'invite')).toBeUndefined();
    expect(tokenFromLink('not a url', 'invite')).toBeUndefined();
  });
});
