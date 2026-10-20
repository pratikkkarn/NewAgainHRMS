import { AppTab, normalizeTab, TAB_ACCESS } from './navAccess';

export const TAB_PATHS: Record<AppTab, string> = {
  dashboard: '/',
  pos: '/pos',
  projects: '/projects',
  invoices: '/invoices',
  proformas: '/proformas',
  documents: '/documents',
  assignments: '/assignments',
  notifications: '/notifications',
  import: '/import',
  'alert-settings': '/alert-settings',
  'users-roles': '/users-roles',
};

// Inverse map for pathname -> AppTab
export const PATH_TO_TAB: Record<string, AppTab> = {
  '/': 'dashboard',
  '/pos': 'pos',
  '/projects': 'projects',
  '/invoices': 'invoices',
  '/proformas': 'proformas',
  '/documents': 'documents',
  '/assignments': 'assignments',
  '/notifications': 'notifications',
  '/import': 'import',
  '/alert-settings': 'alert-settings',
  '/users-roles': 'users-roles',
  // Legacy paths
  '/po-tracker': 'pos',
  '/proforma-invoices': 'proformas',
  '/data-import': 'import',
};

export interface NavParams {
  statusFilter?: string;
  projectFilter?: string;
  poId?: string;
  projectId?: string;
  invoiceId?: string;
  proformaId?: string;
  documentId?: string;
  userId?: string;
  roleId?: string;
  highlightEmployeeId?: string;
  initialTab?: string;
  typeFilter?: string;
  search?: string;
  page?: string | number;
  sort?: string;
  [key: string]: any;
}

export const QUERY_KEYS = {
  STATUS_FILTER: 'statusFilter',
  PROJECT_FILTER: 'projectFilter',
  PO_ID: 'poId',
  HIGHLIGHT_EMPLOYEE_ID: 'highlightEmployeeId',
  INITIAL_TAB: 'tab',
  TYPE_FILTER: 'typeFilter',
  SEARCH: 'q',
  SORT: 'sort',
  PAGE: 'page',
} as const;

export interface ParsedRoute {
  tab: AppTab;
  params: NavParams;
  resourceId?: string;
}

/**
 * Parses the current location pathname and search string into tab, params, and resource ID.
 */
export function parseLocation(pathname: string, search: string): ParsedRoute {
  // Normalize double slashes or trailing slashes (except root)
  let cleanPath = pathname.trim();
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    cleanPath = cleanPath.slice(0, -1);
  }

  const searchParams = new URLSearchParams(search);
  const params: NavParams = {};

  // Parse standard query params
  searchParams.forEach((value, key) => {
    if (key === 'invite' || key === 'reset') return; // Auth tokens handled separately
    if (key === 'tab') {
      params.initialTab = value;
    } else {
      params[key] = value;
    }
  });

  // Extract path parts e.g. ["pos", "po-123"]
  const parts = cleanPath.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { tab: 'dashboard', params };
  }

  const baseSegment = `/${parts[0]}`;
  const rawTab = PATH_TO_TAB[baseSegment];
  const tab = rawTab ? normalizeTab(rawTab) : 'dashboard';

  let resourceId: string | undefined = undefined;
  if (parts.length > 1) {
    resourceId = parts[1];
    // Assign resource ID to the appropriate param field based on tab context
    if (tab === 'pos') params.poId = resourceId;
    if (tab === 'projects') params.projectId = resourceId;
    if (tab === 'invoices') params.invoiceId = resourceId;
    if (tab === 'proformas') params.proformaId = resourceId;
    if (tab === 'documents') params.documentId = resourceId;
    if (tab === 'users-roles') params.userId = resourceId;
  } else if (params.poId) {
    resourceId = params.poId;
  }

  return { tab, params, resourceId };
}

/**
 * Builds a standardized URL path with query string given a tab, parameters, and optional resource ID.
 */
export function buildUrl(tabInput: string, params?: NavParams | null, resourceId?: string): string {
  const tab = normalizeTab(tabInput);
  let basePath = TAB_PATHS[tab] || '/';

  const resId = resourceId || (params?.poId && tab === 'pos' ? params.poId : undefined);
  if (resId && !basePath.endsWith(`/${resId}`)) {
    basePath = `${basePath}/${encodeURIComponent(resId)}`;
  }

  const searchParams = new URLSearchParams();

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      // Skip IDs already embedded in pathname
      if (resId && (key === 'poId' || key === 'projectId' || key === 'invoiceId' || key === 'proformaId' || key === 'documentId' || key === 'userId')) {
        return;
      }

      if (key === 'initialTab') {
        searchParams.set('tab', String(value));
      } else {
        searchParams.set(key, String(value));
      }
    });
  }

  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
