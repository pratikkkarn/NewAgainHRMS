import { EmployeeProfile, Project, PurchaseOrder } from '../types/domain';

// One-time import of existing POs and employees from Prime Star's spreadsheets.
// Excel files are saved as CSV first (File → Save As → CSV UTF-8).

// ─── CSV PARSING ─────────────────────────────────────────────

// RFC 4180 style: commas, quoted fields, "" for a quote inside quotes, CRLF or LF line ends.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // strip the BOM Excel adds

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

// Turns rows into objects keyed by template column, matching headers loosely ("PO Number" = "po_number").
export function rowsToRecords(rows: string[][], columns: ImportColumn[]): { records: Record<string, string>[]; missingColumns: string[] } {
  if (rows.length === 0) return { records: [], missingColumns: columns.filter((c) => c.required).map((c) => c.label) };
  const header = rows[0].map(normalizeHeader);
  const indexOf = (c: ImportColumn) => header.indexOf(normalizeHeader(c.label));
  const missingColumns = columns.filter((c) => c.required && indexOf(c) === -1).map((c) => c.label);
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    columns.forEach((c) => {
      const idx = indexOf(c);
      rec[c.key] = idx === -1 ? '' : (r[idx] || '').trim();
    });
    return rec;
  });
  return { records, missingColumns };
}

// ─── TEMPLATES ───────────────────────────────────────────────

export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  example: string;
}

export const PO_COLUMNS: ImportColumn[] = [
  { key: 'poNumber', label: 'PO Number', required: true, example: 'PO/2026/HP/0101' },
  { key: 'projectCode', label: 'Project Code', required: true, example: 'PRJ-HDFC-01' },
  { key: 'requester', label: 'PO Requester', required: true, example: 'Anita Rao' },
  { key: 'startDate', label: 'Start Date', required: true, example: '2026-04-01' },
  { key: 'expiryDate', label: 'End Date', required: true, example: '2027-03-31' },
  { key: 'amountExclGst', label: 'Amount Excl GST', required: true, example: '1200000' },
  { key: 'gstRate', label: 'GST Rate', required: false, example: '18' },
  { key: 'sowNumber', label: 'SOW Number', required: false, example: 'SOW/HP/2026/07' },
  { key: 'billingAddress', label: 'Billing Address', required: true, example: 'HP India, Bengaluru' },
  { key: 'shippingAddress', label: 'Shipping Address', required: false, example: 'HP India, Bengaluru' },
  { key: 'notes', label: 'Notes', required: false, example: 'Imported from tracker sheet' },
];

export const EMPLOYEE_COLUMNS: ImportColumn[] = [
  { key: 'employeeId', label: 'Employee ID', required: true, example: 'PS-201' },
  { key: 'name', label: 'Full Name', required: true, example: 'Kiran Kumar' },
  { key: 'email', label: 'Email', required: true, example: 'kiran.kumar@primestarconsulting.com' },
  { key: 'phone', label: 'Phone', required: false, example: '+91 98450 12345' },
  { key: 'designation', label: 'Designation', required: true, example: 'Senior Data Engineer' },
  { key: 'department', label: 'Department', required: false, example: 'Technology Consulting' },
  { key: 'joiningDate', label: 'Joining Date', required: true, example: '2025-06-02' },
  { key: 'location', label: 'Location', required: false, example: 'Bengaluru' },
  { key: 'managerName', label: 'Manager', required: false, example: 'Siddharth Mehta' },
];

export function templateCsv(columns: ImportColumn[]): string {
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [columns.map((c) => quote(c.label)).join(','), columns.map((c) => quote(c.example)).join(',')].join('\n');
}

// ─── VALIDATION ──────────────────────────────────────────────

export interface RowResult<T> {
  rowNumber: number; // spreadsheet row, counting the header as row 1
  record: Record<string, string>;
  value?: T; // set when the row is valid
  errors: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts 2026-04-01, 01/04/2026 and 01-04-2026 (day first, as used in India). Returns YYYY-MM-DD or null.
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  let iso: string | null = null;
  if (DATE_RE.test(v)) iso = v;
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(iso) ? iso : null;
}

// Accepts 1200000, 12,00,000 and ₹12,00,000.
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export interface POImportRow {
  poNumber: string;
  projectId: string;
  projectName: string;
  poRequester: string;
  startDate: string;
  expiryDate: string;
  amountExclGst: number;
  gstRate: number;
  sowNumber?: string;
  billingAddress: string;
  shippingAddress: string;
  notes?: string;
}

export function validatePORows(
  records: Record<string, string>[],
  projects: Project[],
  existingPOs: PurchaseOrder[]
): RowResult<POImportRow>[] {
  const seen = new Set<string>();
  return records.map((rec, i) => {
    const errors: string[] = [];
    PO_COLUMNS.filter((c) => c.required && !rec[c.key]).forEach((c) => errors.push(`${c.label} is required.`));

    const project = projects.find((p) => p.code.toLowerCase() === rec.projectCode.toLowerCase());
    if (rec.projectCode && !project) errors.push(`Project code "${rec.projectCode}" does not exist. Create the project first.`);

    const start = rec.startDate ? parseDate(rec.startDate) : null;
    const end = rec.expiryDate ? parseDate(rec.expiryDate) : null;
    if (rec.startDate && !start) errors.push('Start Date must be a date like 2026-04-01 or 01/04/2026.');
    if (rec.expiryDate && !end) errors.push('End Date must be a date like 2027-03-31 or 31/03/2027.');
    if (start && end && end <= start) errors.push('End Date must be after Start Date.');

    const amount = rec.amountExclGst ? parseAmount(rec.amountExclGst) : null;
    if (rec.amountExclGst && (amount === null || amount <= 0)) errors.push('Amount Excl GST must be a positive number.');

    const gst = rec.gstRate ? Number(rec.gstRate.replace('%', '')) : 18;
    if (isNaN(gst) || gst < 0 || gst > 28) errors.push('GST Rate must be between 0 and 28.');

    const key = rec.poNumber.toLowerCase();
    if (rec.poNumber && project) {
      const clash = existingPOs.some((po) => po.poNumber.toLowerCase() === key && po.projectId === project.id);
      if (clash) errors.push(`PO ${rec.poNumber} already exists for this project.`);
    }
    if (rec.poNumber && seen.has(key)) errors.push(`PO ${rec.poNumber} appears more than once in this file.`);
    if (rec.poNumber) seen.add(key);

    const ok = errors.length === 0 && project && start && end && amount !== null;
    return {
      rowNumber: i + 2,
      record: rec,
      errors,
      value: ok
        ? {
            poNumber: rec.poNumber,
            projectId: project!.id,
            projectName: project!.name,
            poRequester: rec.requester,
            startDate: start!,
            expiryDate: end!,
            amountExclGst: amount!,
            gstRate: gst,
            sowNumber: rec.sowNumber || undefined,
            billingAddress: rec.billingAddress,
            shippingAddress: rec.shippingAddress || rec.billingAddress,
            notes: rec.notes || undefined,
          }
        : undefined,
    };
  });
}

export interface EmployeeImportRow {
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  joiningDate: string;
  location: string;
  managerName: string;
}

export function validateEmployeeRows(
  records: Record<string, string>[],
  existing: EmployeeProfile[]
): RowResult<EmployeeImportRow>[] {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  return records.map((rec, i) => {
    const errors: string[] = [];
    EMPLOYEE_COLUMNS.filter((c) => c.required && !rec[c.key]).forEach((c) => errors.push(`${c.label} is required.`));

    if (rec.email && !EMAIL_RE.test(rec.email)) errors.push('Email is not a valid address.');
    const joining = rec.joiningDate ? parseDate(rec.joiningDate) : null;
    if (rec.joiningDate && !joining) errors.push('Joining Date must be a date like 2025-06-02 or 02/06/2025.');

    const id = rec.employeeId.toLowerCase();
    const email = rec.email.toLowerCase();
    if (rec.employeeId && existing.some((e) => e.employeeId.toLowerCase() === id)) {
      errors.push(`Employee ID ${rec.employeeId} already exists.`);
    }
    if (rec.email && existing.some((e) => e.email.toLowerCase() === email)) {
      errors.push(`An employee with ${rec.email} already exists.`);
    }
    if (rec.employeeId && seenIds.has(id)) errors.push(`Employee ID ${rec.employeeId} appears more than once in this file.`);
    if (rec.email && seenEmails.has(email)) errors.push(`${rec.email} appears more than once in this file.`);
    if (rec.employeeId) seenIds.add(id);
    if (rec.email) seenEmails.add(email);

    return {
      rowNumber: i + 2,
      record: rec,
      errors,
      value:
        errors.length === 0 && joining
          ? {
              employeeId: rec.employeeId,
              name: rec.name,
              email: rec.email,
              phone: rec.phone,
              designation: rec.designation,
              department: rec.department || 'Unassigned',
              joiningDate: joining,
              location: rec.location || 'Bengaluru',
              managerName: rec.managerName || '',
            }
          : undefined,
    };
  });
}
