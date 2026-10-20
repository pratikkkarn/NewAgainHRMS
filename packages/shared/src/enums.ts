import { z } from 'zod';

/** Values mirror the Prisma enums in apps/api/prisma/schema.prisma. Keep them in sync. */

export const RoleKey = z.enum([
  'CEO',
  'HR_HEAD',
  'HR_EXECUTIVE',
  'FINANCE_MANAGER',
  'PO_ADMIN',
  'PROJECT_MANAGER',
  'EMPLOYEE',
]);
export type RoleKey = z.infer<typeof RoleKey>;

export const RoleLabel: Record<RoleKey, string> = {
  CEO: 'CEO',
  HR_HEAD: 'HR Head',
  HR_EXECUTIVE: 'HR Executive',
  FINANCE_MANAGER: 'Finance Manager',
  PO_ADMIN: 'PO Admin',
  PROJECT_MANAGER: 'Project Manager',
  EMPLOYEE: 'Employee',
};

export const UserStatus = z.enum(['INVITED', 'ACTIVE', 'LOCKED', 'DISABLED']);
export type UserStatus = z.infer<typeof UserStatus>;

/** "Expiring soon" and "Running low" are daily warning flags, not statuses. */
export const PoStatus = z.enum(['ACTIVE', 'RENEWED', 'EXHAUSTED', 'EXPIRED', 'CLOSED']);
export type PoStatus = z.infer<typeof PoStatus>;

export const PoWarningFlag = z.enum(['EXPIRING_SOON', 'RUNNING_LOW']);
export type PoWarningFlag = z.infer<typeof PoWarningFlag>;

export const GstType = z.enum(['IGST', 'CGST_SGST']);
export type GstType = z.infer<typeof GstType>;

export const InvoiceType = z.enum(['INVOICE', 'CREDIT_NOTE']);
export type InvoiceType = z.infer<typeof InvoiceType>;

export const InvoiceStatus = z.enum(['ISSUED', 'PAID', 'CANCELLED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const ProformaStatus = z.enum(['DRAFT', 'SENT', 'APPROVED', 'INVOICED', 'CANCELLED']);
export type ProformaStatus = z.infer<typeof ProformaStatus>;

export const BillableDaysMethod = z.enum(['CALENDAR', 'WORKING_DAYS', 'MANUAL']);
export type BillableDaysMethod = z.infer<typeof BillableDaysMethod>;

export const EmployeeStatus = z.enum(['CANDIDATE', 'ACTIVE', 'RESIGNED']);
export type EmployeeStatus = z.infer<typeof EmployeeStatus>;

export const PipelineStage = z.enum(['YET_TO_JOIN', 'WILL_JOIN', 'JOINED', 'DROPPED', 'DECLINED']);
export type PipelineStage = z.infer<typeof PipelineStage>;

export const FileScanStatus = z.enum(['PENDING', 'CLEAN', 'INFECTED']);
export type FileScanStatus = z.infer<typeof FileScanStatus>;
