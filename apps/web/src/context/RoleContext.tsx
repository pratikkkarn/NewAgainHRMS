import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserRole, UserProfile, ROLE_PERMISSIONS, RolePermission, DEMO_USERS, ROLE_EMPLOYEE_ID_MAP } from '../types/roles';
import {
  AppRole,
  AppUser,
  BUILT_IN_ROLE_ID,
  PermissionKey,
  permissionsForUser,
  toScreenPermissions,
} from '../types/access';
import { useAccess } from './AccessContext';

interface RoleContextType {
  currentRole: UserRole;
  currentUser: UserProfile;
  // The logged-in person's record in Users & Roles (their roles, status)
  currentAppUser: AppUser;
  // All role names the person holds, e.g. "Finance Manager, Billing Assistant"
  roleLabel: string;
  permissions: RolePermission;
  permissionKeys: Set<PermissionKey>;
  can: (key: PermissionKey) => boolean;
  switchRole: (role: UserRole) => void;
  loginAs: (user: AppUser) => void;
  updateProfileOverride: (employeeId: string, updatedFields: Partial<UserProfile>) => void;
  allDemoUsers: UserProfile[];
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

// The legacy single "role" (used for display and HR-only flags) is the first built-in role the user holds.
function primaryRole(user: AppUser, _roles: AppRole[]): UserRole {
  const builtIn = Object.entries(BUILT_IN_ROLE_ID) as [UserRole, string][];
  for (const rid of user.roleIds) {
    const match = builtIn.find(([, id]) => id === rid);
    if (match) return match[0];
  }
  return 'Employee';
}

export const RoleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { users, roles, session, mode } = useAccess();
  const apiMode = mode === 'api';
  const [pickedRole, setCurrentRole] = useState<UserRole>('CEO');
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profileOverrides, setProfileOverrides] = useState<Record<string, Partial<UserProfile>>>({});

  // With the backend, who is signed in comes from the server's session. In demo mode it is the role switcher.
  const sessionUser = apiMode ? session?.user : sessionUserId ? users.find((u) => u.id === sessionUserId) : undefined;
  const currentRole: UserRole = apiMode && sessionUser ? primaryRole(sessionUser, roles) : pickedRole;
  const demoUser = DEMO_USERS.find((u) => u.role === currentRole) || DEMO_USERS[0];

  const currentAppUser: AppUser = sessionUser ||
    users.find((u) => u.email.toLowerCase() === demoUser.email.toLowerCase()) || {
      id: demoUser.id,
      name: demoUser.name,
      email: demoUser.email,
      roleIds: [BUILT_IN_ROLE_ID[currentRole]],
      status: 'Active',
    };

  // Demo users keep their sample profile; accounts created in Users & Roles get a minimal one.
  const baseProfile: UserProfile = DEMO_USERS.find(
    (d) => d.email.toLowerCase() === currentAppUser.email.toLowerCase()
  ) || {
    id: currentAppUser.id,
    name: currentAppUser.name,
    email: currentAppUser.email,
    role: currentRole,
    designation: '',
    department: '',
    employeeId: currentAppUser.employeeId,
  };
  const activeEmpId = baseProfile.employeeId || ROLE_EMPLOYEE_ID_MAP[currentRole] || 'PS-001';
  const currentUser: UserProfile = { ...baseProfile, role: currentRole, ...(profileOverrides[activeEmpId] || {}) };

  // Permissions come from the roles assigned in Users & Roles, so editing a role changes the screens.
  // With the backend, permissions come straight from the server, so they are right even for people who cannot list roles.
  const permissionKeys: Set<PermissionKey> =
    apiMode && session ? new Set(session.permissions) : permissionsForUser(currentAppUser, roles);
  const permissions = toScreenPermissions(permissionKeys, ROLE_PERMISSIONS[currentRole]);
  const can = (key: PermissionKey) => permissionKeys.has(key);
  const roleLabel =
    (apiMode && session
      ? session.roleNames.join(', ')
      : currentAppUser.roleIds.map((rid) => roles.find((r) => r.id === rid)?.name).filter(Boolean).join(', ')) ||
    currentRole;

  const switchRole = (newRole: UserRole) => {
    const demo = DEMO_USERS.find((u) => u.role === newRole);
    const account = demo && users.find((u) => u.email.toLowerCase() === demo.email.toLowerCase());
    setCurrentRole(newRole);
    setSessionUserId(account ? account.id : null);
  };

  const loginAs = (user: AppUser) => {
    setCurrentRole(primaryRole(user, roles));
    setSessionUserId(user.id);
  };

  const updateProfileOverride = (employeeId: string, updatedFields: Partial<UserProfile>) => {
    setProfileOverrides((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        ...updatedFields,
      },
    }));
  };

  const allDemoUsers = DEMO_USERS.map((u) => {
    const empId = u.employeeId || ROLE_EMPLOYEE_ID_MAP[u.role] || '';
    const ovr = profileOverrides[empId];
    return ovr ? { ...u, ...ovr } : u;
  });

  return (
    <RoleContext.Provider
      value={{
        currentRole,
        currentUser,
        currentAppUser,
        roleLabel,
        permissions,
        permissionKeys,
        can,
        switchRole,
        loginAs,
        updateProfileOverride,
        allDemoUsers,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = (): RoleContextType => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};
