import { describe, it, expect } from 'vitest';
import { parseLocation, buildUrl, TAB_PATHS, PATH_TO_TAB } from '../routes';
import { normalizeTab, canOpenTab, isKnownTab } from '../navAccess';

describe('Frontend Routes Specification', () => {
  describe('TAB_PATHS & PATH_TO_TAB mappings', () => {
    it('uses standard lowercase plural nouns and hyphens for tab paths', () => {
      expect(TAB_PATHS.dashboard).toBe('/');
      expect(TAB_PATHS.pos).toBe('/pos');
      expect(TAB_PATHS.projects).toBe('/projects');
      expect(TAB_PATHS.invoices).toBe('/invoices');
      expect(TAB_PATHS.proformas).toBe('/proformas');
      expect(TAB_PATHS.documents).toBe('/documents');
      expect(TAB_PATHS.assignments).toBe('/assignments');
      expect(TAB_PATHS.notifications).toBe('/notifications');
      expect(TAB_PATHS.import).toBe('/import');
      expect(TAB_PATHS['alert-settings']).toBe('/alert-settings');
      expect(TAB_PATHS['users-roles']).toBe('/users-roles');
    });

    it('maps legacy path aliases correctly', () => {
      expect(PATH_TO_TAB['/po-tracker']).toBe('pos');
      expect(PATH_TO_TAB['/proforma-invoices']).toBe('proformas');
      expect(PATH_TO_TAB['/data-import']).toBe('import');
    });
  });

  describe('normalizeTab & legacy tab handling', () => {
    it('normalizes legacy tab names to standard AppTabs', () => {
      expect(normalizeTab('po-tracker')).toBe('pos');
      expect(normalizeTab('proforma-invoices')).toBe('proformas');
      expect(normalizeTab('data-import')).toBe('import');
      expect(normalizeTab('pos')).toBe('pos');
    });

    it('validates known tabs and legacy tab aliases', () => {
      expect(isKnownTab('pos')).toBe(true);
      expect(isKnownTab('po-tracker')).toBe(true);
      expect(isKnownTab('unknown-tab')).toBe(false);
    });

    it('correctly maps permission requirements for normalized tabs', () => {
      const hasPoPermission = (key: string) => key === 'po.view';
      expect(canOpenTab('pos', hasPoPermission)).toBe(true);
      expect(canOpenTab('po-tracker', hasPoPermission)).toBe(true);
      expect(canOpenTab('projects', hasPoPermission)).toBe(false);
    });
  });

  describe('parseLocation', () => {
    it('parses root path / as dashboard tab', () => {
      const res = parseLocation('/', '');
      expect(res.tab).toBe('dashboard');
      expect(res.params).toEqual({});
    });

    it('parses /pos and query parameters', () => {
      const res = parseLocation('/pos', '?statusFilter=active&tab=amendments');
      expect(res.tab).toBe('pos');
      expect(res.params.statusFilter).toBe('active');
      expect(res.params.initialTab).toBe('amendments');
    });

    it('parses detail routes with resource IDs (/pos/:id)', () => {
      const res = parseLocation('/pos/PO-2026-001', '');
      expect(res.tab).toBe('pos');
      expect(res.resourceId).toBe('PO-2026-001');
      expect(res.params.poId).toBe('PO-2026-001');
    });

    it('parses detail routes with resource IDs (/projects/:id)', () => {
      const res = parseLocation('/projects/PROJ-88', '?statusFilter=in_progress');
      expect(res.tab).toBe('projects');
      expect(res.resourceId).toBe('PROJ-88');
      expect(res.params.projectId).toBe('PROJ-88');
      expect(res.params.statusFilter).toBe('in_progress');
    });

    it('gracefully handles legacy path /po-tracker and maps to pos', () => {
      const res = parseLocation('/po-tracker/PO-99', '');
      expect(res.tab).toBe('pos');
      expect(res.resourceId).toBe('PO-99');
    });
  });

  describe('buildUrl', () => {
    it('builds basic tab URLs', () => {
      expect(buildUrl('dashboard')).toBe('/');
      expect(buildUrl('pos')).toBe('/pos');
      expect(buildUrl('projects')).toBe('/projects');
      expect(buildUrl('proformas')).toBe('/proformas');
    });

    it('builds detail page URLs with resource ID', () => {
      expect(buildUrl('pos', null, 'PO-100')).toBe('/pos/PO-100');
      expect(buildUrl('projects', null, 'PROJ-55')).toBe('/projects/PROJ-55');
    });

    it('builds query parameters with tab parameter for detail sub-tabs', () => {
      const url = buildUrl('pos', { initialTab: 'amendments', statusFilter: 'active' }, 'PO-100');
      expect(url).toBe('/pos/PO-100?tab=amendments&statusFilter=active');
    });

    it('handles legacy tab input names when building URLs', () => {
      expect(buildUrl('po-tracker')).toBe('/pos');
      expect(buildUrl('proforma-invoices')).toBe('/proformas');
      expect(buildUrl('data-import')).toBe('/import');
    });

    it('builds proforma URLs with poId query param for PO detail navigation', () => {
      expect(buildUrl('proformas', { poId: 'po-101' })).toBe('/proformas?poId=po-101');
      expect(buildUrl('proforma-invoices', { poId: 'po-202' })).toBe('/proformas?poId=po-202');
    });
  });
});
