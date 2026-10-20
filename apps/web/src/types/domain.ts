export type POStatus =
  | 'Active'
  | 'Expiring Soon'
  | 'Low Balance'
  | 'Expired'
  | 'Fully Utilized'
  | 'Renewed'
  | 'Closed';

export type InvoiceStatus = 'Issued' | 'Paid' | 'Pending' | 'Cancelled';

export type CandidateStatus =
  | 'Invite Sent'
  | 'In Progress'
  | 'Submitted'
  | 'Under HR Review'
  | 'Returned for Correction'
  | 'Offer Released'
  | 'Joining Confirmed'
  | 'Joined'
  | 'Declined';

export type TimesheetStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Rejected'
  | 'Unlock Requested';

export interface Project {
  id: string;
  name: string;
  clientName: string;
  code: string;
  projectManager: string; // Primary PM (backward compatible)
  projectManagers?: string[]; // Multi-manager array
  startDate: string;
  endDate: string;
  status: 'Active' | 'Completed' | 'On Hold';
  assignedHeadcount: number;
  totalPoValue: number;
  remainingBalance: number;
  _migrated_v2?: boolean;
}

export interface SOWDocumentItem {
  id: string;
  filename: string;
  uploadedAt: string;
  uploadedBy: string;
  fileSize?: number;
  documentType: 'Original' | 'Additional' | 'Merged';
  sowNumber?: string;
  notes?: string;
  fileData?: Blob | Uint8Array;
  fileUrl?: string;
  versionNumber?: number;
}

export interface StatementOfWork {
  id: string;
  sowNumber: string;
  title: string;
  clientName: string;
  effectiveDate: string;
  expiryDate: string;
  totalValueExclGst: number;
  documentName?: string;
  documentUrl?: string;
  status: 'Active' | 'Expired' | 'Superseded';
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  sowNumber: string;
  date: string;
  amountExclGst: number;
  gstRate: number; // e.g. 18
  amountInclGst: number;
  notes: string;
  documentName?: string;
  status: 'Approved' | 'Pending' | 'Rejected';
}

export interface InvoiceEmployeeContribution {
  employeeId: string;
  employeeName: string;
  designation?: string;
  assignmentId?: string;
  monthlyBillingRate: number;
  allocationPercentage?: number;
  assignedFrom?: string;
  assignedTo?: string;
  eligibleDaysWorked: number;
  totalDaysInMonth: number;
  calculatedAmount: number;
  attributedAmount: number;
  isOverridden?: boolean;
  overrideReason?: string;
}

export interface Invoice {
  id: string;
  poId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingMonth?: string; // E.g. "October"
  billingYear?: number; // E.g. 2026
  billingPeriod?: string; // E.g. "October 2026"
  amountExclGst: number;
  gstRate: number;
  gstAmount: number;
  totalAmountInclGst: number;
  status: InvoiceStatus;
  // Set when the invoice is marked Paid (decision: Paid status + paid date only)
  paidAt?: string; // YYYY-MM-DD
  paidBy?: string;
  isCreditNote?: boolean;
  // Set when CEO / PO Admin allowed an invoice larger than the remaining balance
  overrideReason?: string;
  notes?: string;
  documentName?: string;
  documentUrl?: string;
  fileData?: Blob | Uint8Array;
  employeeIds?: string[];
  employeeNames?: string[];
  employeeId?: string;
  employeeName?: string;
  employeeContributions?: InvoiceEmployeeContribution[];
}

export type AssignmentStatus = 'Active' | 'Ending Soon' | 'Completed' | 'On Hold' | 'Terminated' | 'Unassigned' | 'Inactive';

export type BillableDaysMethod = 'calendar' | 'working_days' | 'manual';

export interface AssignedEmployee {
  employeeId: string;
  employeeName: string;
  designation: string;
  billingRatePerMonth: number;
  assignedFrom: string;
  assignedTo: string;
  status: 'Active' | 'Inactive' | 'Unassigned';
  billableDaysMethod?: BillableDaysMethod;
  manualBillableDays?: number;
  email?: string;
  replacedByEmployeeId?: string;
  replacementDate?: string;
}

export type ProformaStatus = 'Draft' | 'Sent' | 'Approved' | 'Invoiced' | 'Cancelled';

export interface ProformaLineItem {
  id: string;
  description: string;
  quantity: number; // e.g. Days or 1
  rate: number;
  amount: number;
  hsnSac?: string;
}

export interface ProformaVersion {
  version: number;
  updatedAt: string;
  updatedBy: string;
  amountExclGst: number;
  gstAmount: number;
  totalAmountInclGst: number;
  notes?: string;
}

export interface ProformaInvoice {
  id: string;
  proformaNumber: string;
  poId: string;
  poNumber: string;
  projectId: string;
  projectName: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  designation: string;
  billingMonth: string;
  billingYear: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billableDaysMethod?: BillableDaysMethod;
  billableDays?: number;
  amountExclGst: number;
  gstRate: number;
  gstAmount: number;
  totalAmountInclGst: number;
  status: ProformaStatus;
  version: number;
  versions: ProformaVersion[];
  lineItems: ProformaLineItem[];
  notes?: string;
  recipientEmail?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Matches the main repo's Assignment model. poId is optional: work without a PO is allowed
// and shown as "Unbilled: no PO" until a PO is linked.
export interface Assignment {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  department?: string;
  projectId: string;
  projectName: string;
  poId?: string;
  poNumber?: string;
  projectManager?: string; // Assigned manager for grouping
  assignedFrom: string;
  assignedTo: string;
  allocationPercentage: number; // e.g. 100, 50
  allocatedHoursPerMonth?: number; // Calculated hours e.g. 160 * (alloc / 100)
  billingRatePerMonth?: number;
  status: AssignmentStatus;
  effectiveTerminationDate?: string;
  terminationReason?: string;
  billableDaysMethod?: BillableDaysMethod;
  manualBillableDays?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface POActivityLog {
  id: string;
  poId: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string; // e.g. "Invoice Issued", "PO Created", "Renewed", "PO Value Amended"
  details: string;
}

export interface POAmendment {
  id: string;
  poId: string;
  originalValueExclGst: number;
  revisedValueExclGst: number;
  changeType: 'REDUCTION' | 'INCREASE';
  changeAmountExclGst: number;
  effectiveDate: string;
  reason: string;
  documentRef?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  approvedBy?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface POComment {
  id: string;
  userName: string;
  userRole: string;
  text: string;
  createdAt: string; // ISO timestamp
}

export type MilestoneStatus = 'Upcoming' | 'Invoiced' | 'Cancelled';

export interface BillingMilestone {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  amountExclGst: number;
  status: MilestoneStatus;
  invoiceNumber?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  projectId: string;
  projectName: string;
  sowId?: string;
  sowNumber?: string;
  quotationId?: string;
  quotationNumber?: string;
  poRequester: string;
  startDate: string;
  expiryDate: string;
  amountExclGst: number; // Current approved PO contractual value
  originalAmountExclGst?: number; // Original PO contractual value
  amendments?: POAmendment[]; // Contractual value revision history
  gstRate: number; // e.g. 18%
  // Pre-filled from the billing state: same state as Prime Star → CGST + SGST, otherwise IGST
  gstType?: 'CGST_SGST' | 'IGST';
  billingState?: string;
  amountInclGst: number;
  invoicedExclGst: number;
  creditNotesExclGst: number;
  remainingBalanceExclGst: number;
  billingAddress: string;
  shippingAddress: string;
  notes?: string;
  status: POStatus;
  poDocumentName?: string;
  renewedFromPoNumber?: string; // Successor relationship
  renewedToPoNumber?: string;
  invoices: Invoice[];
  assignedEmployees: AssignedEmployee[];
  activityLogs: POActivityLog[];
  comments?: POComment[];
  billingMilestones?: BillingMilestone[];
  closedReason?: string;
  closedAt?: string;
  sowDocuments?: SOWDocumentItem[];
  mergedSowDocumentName?: string;
  mergedSowFileData?: Blob | Uint8Array;
  mergedSowUpdatedAt?: string;
  _migrated_v2?: boolean;
}

export interface SalaryComponent {
  componentName: string;
  monthly: number;
  annual: number;
  isDeduction: boolean;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  annualCtc: number;
  basicMonthly: number;
  hraMonthly: number;
  conveyanceMonthly: number;
  specialAllowanceMonthly: number;
  projectAllowanceMonthly: number;
  grossMonthly: number;
  pfDeductionMonthly: number;
  professionalTaxMonthly: number;
  tdsDeductionMonthly: number;
  totalDeductionsMonthly: number;
  netTakeHomeMonthly: number;
  effectiveDate: string;
}

export interface CandidateEducation {
  qualification: string;
  institution: string;
  boardOrUniversity: string;
  yearOfPassing: number;
  percentageOrCgpa: string;
  documentName?: string;
  documentStatus?: 'Pending' | 'Verified' | 'Correction Required';
}

export interface CandidateEmployment {
  companyName: string;
  designation: string;
  startDate: string;
  endDate: string;
  lastDrawnCtc: number;
  reasonForLeaving: string;
  relievingLetterDoc?: string;
  payslipDocs?: string[];
  documentStatus?: 'Pending' | 'Verified' | 'Correction Required';
}

export interface CandidateReference {
  name: string;
  contactNumber: string;
  email: string;
  designationOrRelation: string;
  type: 'Professional' | 'Personal';
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface CandidateOnboarding {
  id: string;
  token: string;
  candidateName: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  residentialAddress: string;
  designation: string;
  proposedDepartment: string;
  offeredCtc: number;
  joiningDate: string;
  status: CandidateStatus;
  invitationSentAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  hrComments?: string;
  assignedHr?: string;
  isExperienced: boolean;
  educationList: CandidateEducation[];
  employmentList: CandidateEmployment[];
  references: CandidateReference[];
  emergencyContacts: EmergencyContact[];
  identityDocs: {
    aadhaarNumber?: string;
    aadhaarDoc?: string;
    panNumber?: string;
    panDoc?: string;
    passportNumber?: string;
    passportDoc?: string;
    photoDoc?: string;
  };
  hasAcceptedDeclaration: boolean;
  checklistState?: Record<string, 'Pending' | 'Verified' | 'Waived'>;
}

export interface EmployeeProfile {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  joiningDate: string;
  managerName: string;
  projectName: string;
  location: string;
  bankAccountDetails?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  salaryStructure: SalaryStructure;
}

export interface DailyTimesheet {
  date: string;
  hoursSpent: number;
  taskDescription: string;
  category: 'Project Delivery' | 'Internal Operations' | 'Client Meeting' | 'Training' | 'Leave';
}

export interface TimesheetAuditLog {
  id: string;
  timestamp: string;
  action: 'Created' | 'Submitted' | 'Approved' | 'Rejected' | 'Unlock Requested' | 'Unlock Approved' | 'Unlock Rejected';
  actorName: string;
  actorRole?: string;
  comments?: string;
}

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  designation?: string;
  periodStartDate: string;
  periodEndDate: string;
  projectName: string;
  totalHours: number;
  status: TimesheetStatus;
  submittedAt?: string;
  approverName?: string;
  rejectionReason?: string;
  unlockReason?: string;
  dailyLogs: DailyTimesheet[];
  auditTrail?: TimesheetAuditLog[];
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'expiry' | 'low_balance' | 'onboarding' | 'timesheet' | 'info';
  timestamp: string;
  isRead: boolean;
  link?: string;
}

export type ProfileChangeRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface ProfileChangeRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  employeeId: string;
  employeeName: string;
  fieldName: string;
  fieldKey: keyof EmployeeProfile | string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  submittedAt: string;
  status: ProfileChangeRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerComments?: string;
}

export interface UserPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  currencyFormat: 'INR (₹)' | 'USD ($)' | 'EUR (€)';
}
