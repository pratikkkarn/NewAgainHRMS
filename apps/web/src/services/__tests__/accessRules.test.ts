import { describe, it, expect } from 'vitest';
import {
  AppUser,
  CEO_ROLE_ID,
  DEFAULT_ROLES,
  DEFAULT_USERS,
  HR_HEAD_ROLE_ID,
  permissionsForUser,
  toScreenPermissions,
} from '../../types/access';
import { ROLE_PERMISSIONS } from '../../types/roles';
import {
  checkCanDeleteRole,
  checkCanEditRole,
  checkCanEditUser,
  checkRoleAssignment,
  checkRoleName,
  checkStatusChange,
  checkUserDetails,
} from '../../lib/accessRules';

const roles = DEFAULT_ROLES;
const users = DEFAULT_USERS;
const byRole = (roleId: string) => users.find((u) => u.roleIds.includes(roleId) && u.status === 'Active')!;

const ceo = byRole(CEO_ROLE_ID);
const hrHead = byRole(HR_HEAD_ROLE_ID);
const poAdmin = byRole('role-po-admin');
const finance = byRole('role-finance-manager');

describe('Users & Roles access rules', () => {
  describe('1. Who can manage users', () => {
    it('allows CEO and HR Head to edit other users, but no one to edit themselves', () => {
      expect(checkCanEditUser(ceo, poAdmin, roles)).toBeNull();
      expect(checkCanEditUser(hrHead, poAdmin, roles)).toBeNull();
      expect(checkCanEditUser(ceo, ceo, roles)).toMatch(/own access/);
      expect(checkCanEditUser(hrHead, hrHead, roles)).toMatch(/own access/);
    });

    it('blocks roles without user.manage, and blocks HR Head from editing a CEO', () => {
      expect(checkCanEditUser(poAdmin, finance, roles)).toMatch(/permission/);
      expect(checkCanEditUser(hrHead, ceo, roles)).toMatch(/Only a CEO/);
    });
  });

  describe('2. Role assignment', () => {
    it('requires at least one role', () => {
      expect(checkRoleAssignment(ceo, null, [], users)).toMatch(/at least one/);
    });

    it('only lets a CEO hand out the CEO role', () => {
      expect(checkRoleAssignment(hrHead, poAdmin, [CEO_ROLE_ID], users)).toMatch(/Only a CEO/);
      expect(checkRoleAssignment(ceo, poAdmin, [CEO_ROLE_ID], users)).toBeNull();
    });

    it('never removes the CEO role from the last active CEO', () => {
      const secondCeo: AppUser = { ...ceo, id: 'usr-ceo-2', email: 'ceo2@x.com' };
      expect(checkRoleAssignment(secondCeo, ceo, ['role-po-admin'], users)).toMatch(/last active CEO/);
      expect(checkRoleAssignment(secondCeo, ceo, ['role-po-admin'], [...users, secondCeo])).toBeNull();
    });
  });

  describe('3. Disabling users', () => {
    it('never disables the last active CEO', () => {
      const secondCeo: AppUser = { ...ceo, id: 'usr-ceo-2', email: 'ceo2@x.com' };
      expect(checkStatusChange(secondCeo, ceo, 'Disabled', users, roles)).toMatch(/last active CEO/);
      expect(checkStatusChange(secondCeo, ceo, 'Disabled', [...users, secondCeo], roles)).toBeNull();
    });

    it('gives a disabled user no permissions at all', () => {
      const disabled: AppUser = { ...poAdmin, status: 'Disabled' };
      expect(permissionsForUser(disabled, roles).size).toBe(0);
    });
  });

  describe('4. Editing and deleting roles', () => {
    it('keeps the CEO role locked for everyone', () => {
      const ceoRole = roles.find((r) => r.id === CEO_ROLE_ID)!;
      expect(checkCanEditRole(ceo, ceoRole, roles)).toMatch(/locked/);
    });

    it('lets only a CEO change the HR Head role', () => {
      const hrRole = roles.find((r) => r.id === HR_HEAD_ROLE_ID)!;
      expect(checkCanEditRole(hrHead, hrRole, roles)).toMatch(/Only a CEO/);
      expect(checkCanEditRole(ceo, hrRole, roles)).toBeNull();
    });

    it('lets HR Head edit other built-in roles', () => {
      const poRole = roles.find((r) => r.id === 'role-po-admin')!;
      expect(checkCanEditRole(hrHead, poRole, roles)).toBeNull();
      expect(checkCanEditRole(poAdmin, poRole, roles)).toMatch(/permission/);
    });

    it('never deletes built-in roles, or custom roles that are still assigned', () => {
      const poRole = roles.find((r) => r.id === 'role-po-admin')!;
      expect(checkCanDeleteRole(ceo, poRole, roles, users)).toMatch(/Built-in/);

      const custom = { ...poRole, id: 'role-custom', name: 'Billing Assistant', builtIn: false };
      const withHolder: AppUser = { ...finance, roleIds: ['role-custom'] };
      expect(checkCanDeleteRole(ceo, custom, [...roles, custom], [...users, withHolder])).toMatch(/still have/);
      expect(checkCanDeleteRole(ceo, custom, [...roles, custom], users)).toBeNull();
    });
  });

  describe('5. Validation', () => {
    it('rejects duplicate emails and role names, case-insensitively', () => {
      expect(checkUserDetails('New Person', ceo.email.toUpperCase(), users)).toMatch(/already exists/);
      expect(checkUserDetails('New Person', 'not-an-email', users)).toMatch(/valid email/);
      expect(checkUserDetails('New Person', 'new.person@primestar.com', users)).toBeNull();
      expect(checkRoleName('po admin', roles)).toMatch(/already exists/);
      expect(checkRoleName('Billing Assistant', roles)).toBeNull();
    });
  });

  describe('6. Screen permissions follow the roles', () => {
    it('matches the architecture matrix for PO screens', () => {
      const screen = (u: AppUser, role: keyof typeof ROLE_PERMISSIONS) =>
        toScreenPermissions(permissionsForUser(u, roles), ROLE_PERMISSIONS[role]);

      expect(screen(poAdmin, 'PO Admin')).toMatchObject({ canManagePOs: true, canManageInvoices: true });
      expect(screen(finance, 'Finance Manager')).toMatchObject({
        canViewPODashboard: true,
        canManagePOs: false,
        canManageInvoices: false,
        canViewAuditLogs: true,
      });
      expect(screen(hrHead, 'HR Head')).toMatchObject({ canManageUserRoles: true, canManagePOs: false });
    });

    it('combines permissions when a user holds several roles', () => {
      const both: AppUser = { ...finance, roleIds: ['role-finance-manager', 'role-po-admin'] };
      const keys = permissionsForUser(both, roles);
      expect(keys.has('audit.view')).toBe(true);
      expect(keys.has('po.create')).toBe(true);
    });
  });
});
