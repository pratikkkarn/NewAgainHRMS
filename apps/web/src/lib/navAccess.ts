import { PermissionKey } from '../types/access';

// One source of truth for which page needs which permission.
// The sidebar hides pages with it, and App refuses to render them without it,
// so a page cannot be opened through a link or a dashboard card either.

export type AppTab =
  | 'dashboard'
  | 'pos'
  | 'projects'
  | 'invoices'
  | 'proformas'
  | 'documents'
  | 'assignments'
  | 'notifications'
  | 'import'
  | 'alert-settings'
  | 'users-roles';

// Legacy tab aliases mapping to standard AppTab names
export const LEGACY_TAB_MAP: Record<string, AppTab> = {
  'po-tracker': 'pos',
  'proforma-invoices': 'proformas',
  'data-import': 'import',
};

// A page opens when the user has ANY of the listed permissions; an empty list means everyone.
export const TAB_ACCESS: Record<AppTab, PermissionKey[]> = {
  dashboard: [],
  pos: ['po.view'],
  projects: ['project.view'],
  invoices: ['invoice.view'],
  proformas: ['proforma.view'],
  documents: ['document.view'],
  assignments: ['assignment.edit'],
  notifications: ['po.view'],
  import: ['po.create', 'user.manage'],
  'alert-settings': ['settings.manage'],
  'users-roles': ['user.manage', 'role.manage', 'audit.view'],
};

export function normalizeTab(tab: string): AppTab {
  if (tab in LEGACY_TAB_MAP) return LEGACY_TAB_MAP[tab];
  if (tab in TAB_ACCESS) return tab as AppTab;
  return 'dashboard';
}

export function isKnownTab(tab: string): boolean {
  return tab in TAB_ACCESS || tab in LEGACY_TAB_MAP;
}

export function canOpenTab(tab: string, has: (key: PermissionKey) => boolean): boolean {
  if (!isKnownTab(tab)) return false;
  const normalized = normalizeTab(tab);
  const needed = TAB_ACCESS[normalized];
  return needed.length === 0 || needed.some(has);
}

export function getValidatedReturnTab(returnToInput?: string, fallback: AppTab = 'pos'): AppTab {
  if (!returnToInput || typeof returnToInput !== 'string') return fallback;
  // Reject external URLs or protocol handlers
  if (returnToInput.includes('://') || returnToInput.startsWith('//')) {
    return fallback;
  }
  const clean = returnToInput.trim().replace(/^\/+/, '');
  return isKnownTab(clean) ? normalizeTab(clean) : fallback;
}
