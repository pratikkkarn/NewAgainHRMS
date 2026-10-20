import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Project,
  StatementOfWork,
  Quotation,
  PurchaseOrder,
  Invoice,
  AssignedEmployee,
  POActivityLog,
  CandidateOnboarding,
  EmployeeProfile,
  SalaryStructure,
  TimesheetEntry,
  SystemNotification,
  POStatus,
  InvoiceStatus,
  CandidateStatus,
  TimesheetStatus,
  ProfileChangeRequest,
  UserPreferences,
  POAmendment,
  Assignment,
  ProformaInvoice,
  SOWDocumentItem,
  BillableDaysMethod,
  BillingMilestone,
} from '../types/domain';
import { mergeSOWDocuments } from '../lib/pdfMerge';
import { EmployeeImportRow, POImportRow } from '../lib/dataImport';
import {
  INITIAL_PROJECTS,
  INITIAL_SOWS,
  INITIAL_QUOTATIONS,
  INITIAL_POS,
  INITIAL_CANDIDATES,
  INITIAL_EMPLOYEES,
  INITIAL_TIMESHEETS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PROFILE_REQUESTS,
  INITIAL_ASSIGNMENTS,
  INITIAL_PROFORMA_INVOICES,
} from '../services/mockData';
import { recalculatePOBalances, recalculateProjectBalances, applyPOAmendment, validatePOAmendment } from '../lib/poUtils';
import { useNotification } from './NotificationContext';
import { useRole } from './RoleContext';

const STORAGE_KEYS = {
  PROJECTS: 'primestar_projects',
  SOWS: 'primestar_sows',
  QUOTATIONS: 'primestar_quotations',
  POS: 'primestar_purchase_orders',
  CANDIDATES: 'primestar_candidates',
  EMPLOYEES: 'primestar_employees',
  TIMESHEETS: 'primestar_timesheets',
  NOTIFICATIONS: 'primestar_notifications',
  PROFILE_REQUESTS: 'primestar_profile_requests',
  USER_PREFS: 'primestar_user_preferences',
  CUSTOM_DOCS: 'primestar_custom_documents',
  DELETED_DOC_IDS: 'primestar_deleted_doc_ids',
  ASSIGNMENTS: 'primestar_employee_assignments',
  PROFORMA_INVOICES: 'primestar_proforma_invoices',
};

export const ALL_SYSTEM_STORAGE_KEYS = [
  'primestar_projects',
  'primestar_sows',
  'primestar_quotations',
  'primestar_purchase_orders',
  'primestar_candidates',
  'primestar_employees',
  'primestar_timesheets',
  'primestar_notifications',
  'primestar_profile_requests',
  'primestar_user_preferences',
  'primestar_custom_documents',
  'primestar_deleted_doc_ids',
  'primestar_employee_assignments',
  'primestar_proforma_invoices',
];

export function createVerifiedLocalStorageBackup(): { success: boolean; backupKey?: string; error?: string } {
  try {
    const timestamp = Date.now();
    const backupKey = `primestar_backup_${timestamp}`;
    const snapshot: Record<string, string | null> = {};

    ALL_SYSTEM_STORAGE_KEYS.forEach((k) => {
      snapshot[k] = localStorage.getItem(k);
    });

    const jsonStr = JSON.stringify(snapshot);
    localStorage.setItem(backupKey, jsonStr);

    // Verify backup
    const readBack = localStorage.getItem(backupKey);
    if (!readBack) {
      return { success: false, error: 'Backup verification failed: written snapshot key not found.' };
    }
    const parsed = JSON.parse(readBack);
    const hasAllKeys = ALL_SYSTEM_STORAGE_KEYS.every((k) => k in parsed);
    if (!hasAllKeys) {
      return { success: false, error: 'Backup verification failed: missing key in parsed snapshot.' };
    }

    return { success: true, backupKey };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error creating localStorage backup' };
  }
}

export function migrateLegacyDataIdempotent(): void {
  try {
    const isMigrated = localStorage.getItem('primestar_migration_version') === 'v2';
    if (isMigrated) return;

    // 1. Create verified backup first
    const backupResult = createVerifiedLocalStorageBackup();
    if (!backupResult.success) {
      console.error('Migration aborted: backup creation or verification failed.', backupResult.error);
      return;
    }

    // 2. Migrate Projects: ensure projectManagers array exists
    const rawProjects = loadStoredData<Project[]>(STORAGE_KEYS.PROJECTS, INITIAL_PROJECTS);
    let projectsMigrated = false;
    const nextProjects = rawProjects.map((p) => {
      if (p._migrated_v2) return p;
      projectsMigrated = true;
      const pms = p.projectManagers && p.projectManagers.length > 0 ? p.projectManagers : [p.projectManager || 'Siddharth Mehta'];
      return {
        ...p,
        projectManagers: pms,
        _migrated_v2: true,
      };
    });
    if (projectsMigrated) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(nextProjects));
    }

    // 3. Migrate Purchase Orders & Invoices: derive billingMonth & billingYear if missing
    const rawPOs = loadStoredData<PurchaseOrder[]>(STORAGE_KEYS.POS, INITIAL_POS);
    let posMigrated = false;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const nextPOs = rawPOs.map((po) => {
      let poChanged = false;
      const nextInvoices = po.invoices.map((inv) => {
        if (inv.billingMonth && inv.billingYear) return inv;
        poChanged = true;
        const d = new Date(inv.invoiceDate || '2026-10-01');
        const bMonth = monthNames[d.getMonth()] || 'October';
        const bYear = d.getFullYear() || 2026;
        return {
          ...inv,
          billingMonth: bMonth,
          billingYear: bYear,
          billingPeriod: `${bMonth} ${bYear}`,
        };
      });

      if (poChanged || !po._migrated_v2) {
        posMigrated = true;
        return {
          ...po,
          invoices: nextInvoices,
          _migrated_v2: true,
        };
      }
      return po;
    });

    if (posMigrated) {
      localStorage.setItem(STORAGE_KEYS.POS, JSON.stringify(nextPOs));
    }

    // Mark migration version v2
    localStorage.setItem('primestar_migration_version', 'v2');
  } catch (e) {
    console.error('Error during data migration:', e);
  }
}

function loadStoredData<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      return JSON.parse(item);
    }
  } catch (e) {
    console.error(`Error loading ${key} from localStorage:`, e);
  }
  return fallback;
}

interface DataContextType {
  projects: Project[];
  sows: StatementOfWork[];
  quotations: Quotation[];
  purchaseOrders: PurchaseOrder[];
  candidates: CandidateOnboarding[];
  employees: EmployeeProfile[];
  timesheets: TimesheetEntry[];
  notifications: SystemNotification[];
  assignments: Assignment[];
  proformaInvoices: ProformaInvoice[];

  // PO Actions
  addProject: (project: Omit<Project, 'id' | 'totalPoValue' | 'remainingBalance' | 'assignedHeadcount'>) => Project;
  createPO: (data: {
    poNumber: string;
    projectId: string;
    projectName: string;
    sowNumber?: string;
    quotationNumber?: string;
    poRequester: string;
    startDate: string;
    expiryDate: string;
    amountExclGst: number;
    gstRate: number;
    gstType?: 'CGST_SGST' | 'IGST';
    billingState?: string;
    billingAddress: string;
    shippingAddress: string;
    notes?: string;
    poDocumentName?: string;
  }) => PurchaseOrder;
  updatePO: (poId: string, data: Partial<PurchaseOrder>) => void;
  closePO: (poId: string, reason: string) => void;
  addPOComment: (poId: string, text: string) => void;
  savePOMilestones: (poId: string, milestones: BillingMilestone[], logDetails: string) => void;
  importPurchaseOrders: (rows: POImportRow[]) => number;
  importEmployees: (rows: EmployeeImportRow[]) => number;
  renewPO: (oldPoId: string, newPoNumber: string, newAmountExclGst: number, newStartDate: string, newExpiryDate: string) => PurchaseOrder;
  submitPOAmendment: (
    poId: string,
    amendmentData: Omit<POAmendment, 'id' | 'poId' | 'createdAt' | 'status'> & { status?: 'PENDING' | 'APPROVED' | 'REJECTED' }
  ) => void;
  approvePOAmendment: (poId: string, amendmentId: string) => void;
  addInvoice: (poId: string, invoice: Omit<Invoice, 'id' | 'poId' | 'gstAmount' | 'totalAmountInclGst'>) => void;
  updateInvoiceStatus: (poId: string, invoiceId: string, status: InvoiceStatus, paidAt?: string) => void;
  cancelInvoice: (poId: string, invoiceId: string) => void;
  assignEmployeeToPO: (poId: string, assignment: Omit<AssignedEmployee, 'status'>) => void;
  unassignEmployeeFromPO: (poId: string, employeeId: string) => void;
  replaceEmployeeOnPO: (
    poId: string,
    params: {
      outgoingEmployeeId: string;
      replacementEmployeeId: string;
      effectiveDate: string;
      billingRatePerMonth: number;
      billableDaysMethod?: BillableDaysMethod;
      manualBillableDays?: number;
      replacementAssignedTo?: string;
      reason?: string;
    }
  ) => void;
  addSOW: (sow: Omit<StatementOfWork, 'id'>) => StatementOfWork;
  uploadAndMergeSOW: (poId: string, sowFile: File, notes?: string) => Promise<PurchaseOrder>;
  addQuotation: (quot: Omit<Quotation, 'id'>) => Quotation;

  // Proforma Invoice Actions
  addProformaInvoice: (proforma: Omit<ProformaInvoice, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'versions'>) => ProformaInvoice;
  updateProformaInvoice: (id: string, updates: Partial<ProformaInvoice>, createNewVersion?: boolean) => void;
  deleteProformaInvoice: (id: string) => void;
  shareProformaInvoice: (id: string, recipientEmail: string, notes?: string) => { success: boolean; mode: 'sent' | 'draft_fallback'; message: string; mailtoUrl?: string };

  // Employee Assignment Actions
  addAssignment: (assignment: Omit<Assignment, 'id'>) => Assignment;
  updateAssignment: (id: string, updatedFields: Partial<Assignment>) => void;
  terminateAssignment: (id: string, effectiveTerminationDate: string, reason: string) => void;
  updateEmployeeEmail: (employeeId: string, email: string) => void;

  // Candidate / Onboarding Actions
  inviteCandidate: (candidateData: {
    candidateName: string;
    email: string;
    phone: string;
    designation: string;
    proposedDepartment: string;
    offeredCtc: number;
    joiningDate: string;
    isExperienced: boolean;
    assignedHr?: string;
  }) => CandidateOnboarding;
  updateCandidateOnboarding: (token: string, data: Partial<CandidateOnboarding>) => void;
  editCandidateDetails: (candidateId: string, updatedFields: Partial<CandidateOnboarding>) => void;
  cancelCandidateOnboarding: (candidateId: string, reason?: string) => void;
  reviewCandidateForm: (candidateId: string, action: 'approve' | 'return_for_correction', hrComments: string) => void;
  releaseOfferLetter: (candidateId: string) => void;
  confirmCandidateJoining: (candidateId: string) => void;
  completeOnboarding: (candidateId: string) => void;
  updateCandidateChecklist: (candidateId: string, checklistState: Record<string, 'Pending' | 'Verified' | 'Waived'>) => void;

  // Employee & Profile Actions
  profileRequests: ProfileChangeRequest[];
  userPreferences: UserPreferences;
  createProfileChangeRequest: (data: {
    employeeId: string;
    employeeName: string;
    fieldName: string;
    fieldKey: string;
    currentValue: string;
    proposedValue: string;
    reason: string;
  }) => ProfileChangeRequest;
  reviewProfileChangeRequest: (requestId: string, action: 'approve' | 'reject', reviewerComments: string) => void;
  updateEmployeeProfile: (employeeId: string, updatedFields: Partial<EmployeeProfile>) => void;
  updateUserPreferences: (prefs: Partial<UserPreferences>) => void;
  updateSalaryStructure: (employeeId: string, updatedStructure: Partial<SalaryStructure>) => void;

  // Timesheet Actions
  submitTimesheet: (timesheetId: string) => void;
  approveTimesheet: (timesheetId: string, comments?: string) => void;
  rejectTimesheet: (timesheetId: string, reason: string) => void;
  requestUnlockTimesheet: (timesheetId: string, reason: string) => void;
  approveUnlockTimesheet: (timesheetId: string, comments?: string) => void;
  rejectUnlockTimesheet: (timesheetId: string, reason: string) => void;
  bulkApproveTimesheets: (timesheetIds: string[]) => void;
  bulkRejectTimesheets: (timesheetIds: string[], reason: string) => void;
  createTimesheet: (entryData: Omit<TimesheetEntry, 'id'>) => void;

  // Notification actions
  markNotificationRead: (id: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Execute idempotent migration and backup on startup
  useEffect(() => {
    migrateLegacyDataIdempotent();
  }, []);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    migrateLegacyDataIdempotent();
    const raw = loadStoredData<PurchaseOrder[]>(STORAGE_KEYS.POS, INITIAL_POS);
    return raw.map((po) => recalculatePOBalances(po));
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const rawProjects = loadStoredData<Project[]>(STORAGE_KEYS.PROJECTS, INITIAL_PROJECTS);
    const initialPOs = loadStoredData<PurchaseOrder[]>(STORAGE_KEYS.POS, INITIAL_POS).map(recalculatePOBalances);
    return recalculateProjectBalances(rawProjects, initialPOs);
  });

  const [sows, setSows] = useState<StatementOfWork[]>(() =>
    loadStoredData<StatementOfWork[]>(STORAGE_KEYS.SOWS, INITIAL_SOWS)
  );
  const [quotations, setQuotations] = useState<Quotation[]>(() =>
    loadStoredData<Quotation[]>(STORAGE_KEYS.QUOTATIONS, INITIAL_QUOTATIONS)
  );
  const [candidates, setCandidates] = useState<CandidateOnboarding[]>(() =>
    loadStoredData<CandidateOnboarding[]>(STORAGE_KEYS.CANDIDATES, INITIAL_CANDIDATES)
  );
  const [employees, setEmployees] = useState<EmployeeProfile[]>(() =>
    loadStoredData<EmployeeProfile[]>(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES)
  );
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>(() =>
    loadStoredData<TimesheetEntry[]>(STORAGE_KEYS.TIMESHEETS, INITIAL_TIMESHEETS)
  );
  const [notifications, setNotifications] = useState<SystemNotification[]>(() =>
    loadStoredData<SystemNotification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS)
  );
  const [profileRequests, setProfileRequests] = useState<ProfileChangeRequest[]>(() =>
    loadStoredData<ProfileChangeRequest[]>(STORAGE_KEYS.PROFILE_REQUESTS, INITIAL_PROFILE_REQUESTS)
  );
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(() =>
    loadStoredData<UserPreferences>(STORAGE_KEYS.USER_PREFS, {
      emailNotifications: true,
      smsNotifications: false,
      dateFormat: 'DD/MM/YYYY',
      currencyFormat: 'INR (₹)',
    })
  );

  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    loadStoredData<Assignment[]>(STORAGE_KEYS.ASSIGNMENTS, INITIAL_ASSIGNMENTS)
  );

  const [proformaInvoices, setProformaInvoices] = useState<ProformaInvoice[]>(() =>
    loadStoredData<ProformaInvoice[]>(STORAGE_KEYS.PROFORMA_INVOICES, INITIAL_PROFORMA_INVOICES)
  );

  const { showToast } = useNotification();
  const { currentUser, updateProfileOverride } = useRole();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    } catch (e) {
      console.error('Error saving assignments to localStorage:', e);
    }
  }, [assignments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFORMA_INVOICES, JSON.stringify(proformaInvoices));
    } catch (e) {
      console.error('Error saving proforma invoices to localStorage:', e);
    }
  }, [proformaInvoices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.POS, JSON.stringify(purchaseOrders));
    } catch (e) {
      console.error('Error saving purchase orders to localStorage:', e);
    }
  }, [purchaseOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch (e) {
      console.error('Error saving projects to localStorage:', e);
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SOWS, JSON.stringify(sows));
    } catch (e) {
      console.error('Error saving sows to localStorage:', e);
    }
  }, [sows]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.QUOTATIONS, JSON.stringify(quotations));
    } catch (e) {
      console.error('Error saving quotations to localStorage:', e);
    }
  }, [quotations]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(candidates));
    } catch (e) {
      console.error('Error saving candidates to localStorage:', e);
    }
  }, [candidates]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    } catch (e) {
      console.error('Error saving employees to localStorage:', e);
    }
  }, [employees]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TIMESHEETS, JSON.stringify(timesheets));
    } catch (e) {
      console.error('Error saving timesheets to localStorage:', e);
    }
  }, [timesheets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    } catch (e) {
      console.error('Error saving notifications to localStorage:', e);
    }
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE_REQUESTS, JSON.stringify(profileRequests));
    } catch (e) {
      console.error('Error saving profile requests to localStorage:', e);
    }
  }, [profileRequests]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify(userPreferences));
    } catch (e) {
      console.error('Error saving user preferences to localStorage:', e);
    }
  }, [userPreferences]);

  // Helper to sync PO balances & project totals
  const updatePOsState = (updater: (prev: PurchaseOrder[]) => PurchaseOrder[]) => {
    setPurchaseOrders((prev) => {
      const nextPOs = updater(prev);
      setProjects((prevProj) => recalculateProjectBalances(prevProj, nextPOs));
      return nextPOs;
    });
  };

  const addProject = (data: Omit<Project, 'id' | 'totalPoValue' | 'remainingBalance' | 'assignedHeadcount'>): Project => {
    const pms = data.projectManagers && data.projectManagers.length > 0 ? data.projectManagers : [data.projectManager || 'Siddharth Mehta'];
    const newProj: Project = {
      ...data,
      projectManager: data.projectManager || pms[0],
      projectManagers: pms,
      id: `proj-${Date.now()}`,
      assignedHeadcount: 0,
      totalPoValue: 0,
      remainingBalance: 0,
      _migrated_v2: true,
    };
    setProjects((prev) => [newProj, ...prev]);
    showToast('Project Created', `Project "${data.name}" added successfully.`);
    return newProj;
  };

  const createPO = (data: {
    poNumber: string;
    projectId: string;
    projectName: string;
    sowNumber?: string;
    quotationNumber?: string;
    poRequester: string;
    startDate: string;
    expiryDate: string;
    amountExclGst: number;
    gstRate: number;
    gstType?: 'CGST_SGST' | 'IGST';
    billingState?: string;
    billingAddress: string;
    shippingAddress: string;
    notes?: string;
    poDocumentName?: string;
  }): PurchaseOrder => {
    const amountInclGst = data.amountExclGst * (1 + data.gstRate / 100);

    const newPORaw: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: data.poNumber,
      projectId: data.projectId,
      projectName: data.projectName,
      sowNumber: data.sowNumber,
      quotationNumber: data.quotationNumber,
      poRequester: data.poRequester,
      startDate: data.startDate,
      expiryDate: data.expiryDate,
      amountExclGst: data.amountExclGst,
      gstRate: data.gstRate,
      gstType: data.gstType,
      billingState: data.billingState,
      amountInclGst,
      invoicedExclGst: 0,
      creditNotesExclGst: 0,
      remainingBalanceExclGst: data.amountExclGst,
      billingAddress: data.billingAddress,
      shippingAddress: data.shippingAddress,
      notes: data.notes,
      poDocumentName: data.poDocumentName,
      status: 'Active',
      invoices: [],
      assignedEmployees: [],
      activityLogs: [
        {
          id: `act-${Date.now()}`,
          poId: `po-${Date.now()}`,
          timestamp: new Date().toLocaleString('en-IN'),
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'PO Created',
          details: `Created Purchase Order ${data.poNumber} for ₹${data.amountExclGst.toLocaleString('en-IN')} (Excl GST)`,
        },
      ],
    };

    const finalPO = recalculatePOBalances(newPORaw);
    setPurchaseOrders((prev) => [finalPO, ...prev]);

    // Recalculate Project totals
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id === data.projectId) {
          return {
            ...proj,
            totalPoValue: proj.totalPoValue + data.amountExclGst,
            remainingBalance: proj.remainingBalance + data.amountExclGst,
          };
        }
        return proj;
      })
    );

    showToast('PO Created Successfully', `Purchase Order ${data.poNumber} registered.`);
    return finalPO;
  };

  const updatePO = (poId: string, data: Partial<PurchaseOrder>) => {
    setPurchaseOrders((prev) =>
      prev.map((po) => {
        if (po.id === poId) {
          const updated = { ...po, ...data };
          return recalculatePOBalances(updated);
        }
        return po;
      })
    );
    showToast('PO Updated', 'Purchase order details updated successfully.');
  };

  const activity = (poId: string, action: string, details: string): POActivityLog => ({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    poId,
    timestamp: new Date().toLocaleString('en-IN'),
    userName: currentUser.name,
    userRole: currentUser.role,
    action,
    details,
  });

  // Option B in the PO lifecycle: an admin closes a PO that will not be renewed.
  const closePO = (poId: string, reason: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    updatePOsState((prev) =>
      prev.map((p) =>
        p.id === poId
          ? {
              ...p,
              status: 'Closed',
              closedReason: reason,
              closedAt: new Date().toISOString(),
              activityLogs: [...p.activityLogs, activity(poId, 'PO Closed', `Closed without renewal. Reason: ${reason}`)],
            }
          : p
      )
    );
    showToast('PO Closed', `${po.poNumber} was closed.`);
  };

  const addPOComment = (poId: string, text: string) => {
    updatePOsState((prev) =>
      prev.map((p) =>
        p.id === poId
          ? {
              ...p,
              comments: [
                ...(p.comments || []),
                {
                  id: `cmt-${Date.now()}`,
                  userName: currentUser.name,
                  userRole: currentUser.role,
                  text,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : p
      )
    );
  };

  const uploadAndMergeSOW = async (
    poId: string,
    sowFile: File,
    notes?: string
  ): Promise<PurchaseOrder> => {
    const targetPo = purchaseOrders.find((p) => p.id === poId);
    if (!targetPo) throw new Error('Target PO not found');

    let existingSource: Blob | Uint8Array | ArrayBuffer | string | null = targetPo.mergedSowFileData || null;

    const mergeResult = await mergeSOWDocuments(
      existingSource,
      sowFile,
      sowFile.name,
      targetPo.sowNumber
    );

    const timestamp = new Date().toISOString();
    const currentUserName = currentUser.name || 'PO Admin';

    const existingList = targetPo.sowDocuments || [];
    const updatedList: SOWDocumentItem[] = [...existingList];

    if (updatedList.length === 0) {
      updatedList.push({
        id: `sow-orig-${targetPo.id}`,
        filename: targetPo.sowNumber ? `${targetPo.sowNumber.replace(/[\/\\]/g, '_')}.pdf` : 'Statement_of_Work_Document.pdf',
        uploadedAt: targetPo.startDate || '2025-01-01',
        uploadedBy: targetPo.poRequester || 'System',
        documentType: 'Original',
        sowNumber: targetPo.sowNumber || 'SOW-HDFC-2025-001',
        fileUrl: '/Statement_of_Work_Document.pdf',
        notes: 'Initial primary statement of work document.',
        versionNumber: 1,
      });
    }

    const fileBuf = await sowFile.arrayBuffer();
    updatedList.push({
      id: `sow-add-${Date.now()}`,
      filename: sowFile.name,
      uploadedAt: timestamp,
      uploadedBy: currentUserName,
      fileSize: sowFile.size,
      documentType: 'Additional',
      notes: notes || 'Additional SOW addendum uploaded.',
      fileData: new Uint8Array(fileBuf),
      versionNumber: updatedList.length + 1,
    });

    updatedList.push({
      id: `sow-merged-${Date.now()}`,
      filename: mergeResult.mergedFilename,
      uploadedAt: timestamp,
      uploadedBy: currentUserName,
      fileSize: mergeResult.mergedBlob.size,
      documentType: 'Merged',
      notes: `Combined master SOW including ${sowFile.name}.`,
      fileData: mergeResult.mergedUint8Array,
      versionNumber: updatedList.length + 1,
    });

    let updatedPo: PurchaseOrder = targetPo;

    updatePOsState((prev) =>
      prev.map((p) => {
        if (p.id === poId) {
          updatedPo = {
            ...p,
            sowDocuments: updatedList,
            mergedSowDocumentName: mergeResult.mergedFilename,
            mergedSowFileData: mergeResult.mergedUint8Array,
            mergedSowUpdatedAt: timestamp,
            activityLogs: [
              ...p.activityLogs,
              activity(
                poId,
                'SOW Document Merged',
                `Uploaded '${sowFile.name}' and merged into '${mergeResult.mergedFilename}' (${mergeResult.numPages} pages).`
              ),
            ],
          };
          return updatedPo;
        }
        return p;
      })
    );

    showToast(
      'SOW Document Merged',
      `Successfully uploaded and merged '${sowFile.name}' into the master SOW document.`
    );

    return updatedPo;
  };

  const savePOMilestones = (poId: string, milestones: BillingMilestone[], logDetails: string) => {
    updatePOsState((prev) =>
      prev.map((p) =>
        p.id === poId
          ? {
              ...p,
              billingMilestones: milestones,
              activityLogs: [...p.activityLogs, activity(poId, 'Billing Milestones Updated', logDetails)],
            }
          : p
      )
    );
  };

  const importPurchaseOrders = (rows: POImportRow[]): number => {
    const stamp = Date.now();
    const imported = rows.map((r, i) => {
      const id = `po-imp-${stamp}-${i}`;
      return recalculatePOBalances({
        id,
        poNumber: r.poNumber,
        projectId: r.projectId,
        projectName: r.projectName,
        sowNumber: r.sowNumber,
        poRequester: r.poRequester,
        startDate: r.startDate,
        expiryDate: r.expiryDate,
        amountExclGst: r.amountExclGst,
        gstRate: r.gstRate,
        amountInclGst: r.amountExclGst * (1 + r.gstRate / 100),
        invoicedExclGst: 0,
        creditNotesExclGst: 0,
        remainingBalanceExclGst: r.amountExclGst,
        billingAddress: r.billingAddress,
        shippingAddress: r.shippingAddress,
        notes: r.notes,
        status: 'Active',
        invoices: [],
        assignedEmployees: [],
        activityLogs: [activity(id, 'PO Imported', `Imported from spreadsheet for ₹${r.amountExclGst.toLocaleString('en-IN')} (Excl GST)`)],
      });
    });
    updatePOsState((prev) => [...imported, ...prev]);
    showToast('POs Imported', `${imported.length} purchase order(s) added.`);
    return imported.length;
  };

  const importEmployees = (rows: EmployeeImportRow[]): number => {
    const stamp = Date.now();
    const imported: EmployeeProfile[] = rows.map((r, i) => ({
      id: `emp-imp-${stamp}-${i}`,
      employeeId: r.employeeId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      designation: r.designation,
      department: r.department,
      joiningDate: r.joiningDate,
      managerName: r.managerName,
      projectName: 'Bench / Unassigned',
      location: r.location,
      // Salary is out of scope for Phase 1; HR fills it in later.
      salaryStructure: {
        id: `sal-imp-${stamp}-${i}`,
        employeeId: r.employeeId,
        employeeName: r.name,
        designation: r.designation,
        annualCtc: 0,
        basicMonthly: 0,
        hraMonthly: 0,
        conveyanceMonthly: 0,
        specialAllowanceMonthly: 0,
        projectAllowanceMonthly: 0,
        grossMonthly: 0,
        pfDeductionMonthly: 0,
        professionalTaxMonthly: 0,
        tdsDeductionMonthly: 0,
        totalDeductionsMonthly: 0,
        netTakeHomeMonthly: 0,
        effectiveDate: r.joiningDate,
      },
    }));
    setEmployees((prev) => [...prev, ...imported]);
    showToast('Employees Imported', `${imported.length} employee(s) added and ready to tag to POs.`);
    return imported.length;
  };

  const renewPO = (
    oldPoId: string,
    newPoNumber: string,
    newAmountExclGst: number,
    newStartDate: string,
    newExpiryDate: string
  ): PurchaseOrder => {
    const oldPo = purchaseOrders.find((p) => p.id === oldPoId);
    if (!oldPo) throw new Error('Original PO not found');

    // Create successor PO
    const amountInclGst = newAmountExclGst * (1 + oldPo.gstRate / 100);
    const newPOId = `po-${Date.now()}`;

    const successorPoRaw: PurchaseOrder = {
      id: newPOId,
      poNumber: newPoNumber,
      projectId: oldPo.projectId,
      projectName: oldPo.projectName,
      sowId: oldPo.sowId,
      sowNumber: oldPo.sowNumber,
      poRequester: currentUser.name,
      startDate: newStartDate,
      expiryDate: newExpiryDate,
      amountExclGst: newAmountExclGst,
      gstRate: oldPo.gstRate,
      amountInclGst,
      invoicedExclGst: 0,
      creditNotesExclGst: 0,
      remainingBalanceExclGst: newAmountExclGst,
      billingAddress: oldPo.billingAddress,
      shippingAddress: oldPo.shippingAddress,
      notes: `Renewed successor PO of ${oldPo.poNumber}`,
      status: 'Active',
      renewedFromPoNumber: oldPo.poNumber,
      invoices: [],
      assignedEmployees: [...oldPo.assignedEmployees],
      activityLogs: [
        {
          id: `act-${Date.now()}`,
          poId: newPOId,
          timestamp: new Date().toLocaleString('en-IN'),
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'PO Renewed Successor',
          details: `Created as renewed successor to ${oldPo.poNumber}`,
        },
      ],
    };

    const finalSuccessor = recalculatePOBalances(successorPoRaw);

    // Update old PO as 'Renewed' and link to successor PO
    setPurchaseOrders((prev) =>
      prev.map((p) => {
        if (p.id === oldPoId) {
          const updatedOldPo: PurchaseOrder = {
            ...p,
            status: 'Renewed',
            renewedToPoNumber: newPoNumber,
            activityLogs: [
              ...p.activityLogs,
              {
                id: `act-${Date.now()}-old`,
                poId: oldPoId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'PO Renewed',
                details: `PO renewed into successor PO ${newPoNumber}`,
              },
            ],
          };
          return updatedOldPo;
        }
        return p;
      })
    );

    setPurchaseOrders((prev) => [finalSuccessor, ...prev]);
    showToast('PO Renewed', `New PO ${newPoNumber} created as renewal for ${oldPo.poNumber}`);
    return finalSuccessor;
  };

  const submitPOAmendment = (
    poId: string,
    amendmentData: Omit<POAmendment, 'id' | 'poId' | 'createdAt' | 'status'> & { status?: 'PENDING' | 'APPROVED' | 'REJECTED' }
  ) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    // Validate if status is APPROVED
    if (amendmentData.status === 'APPROVED' || !amendmentData.status) {
      const validation = validatePOAmendment(po, amendmentData.revisedValueExclGst);
      if (!validation.valid) {
        showToast('Amendment Validation Failed', validation.error || 'Invalid amendment value', 'error');
        throw new Error(validation.error);
      }
    }

    const updatedPo = applyPOAmendment(
      po,
      { ...amendmentData, status: amendmentData.status || 'APPROVED' },
      { name: currentUser.name, role: currentUser.role }
    );

    updatePOsState((prev) => prev.map((p) => (p.id === poId ? updatedPo : p)));
    showToast('PO Value Amended', `PO ${po.poNumber} contractual value revised to ₹${amendmentData.revisedValueExclGst.toLocaleString('en-IN')}`);
  };

  const approvePOAmendment = (poId: string, amendmentId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po || !po.amendments) return;

    const targetAmend = po.amendments.find((a) => a.id === amendmentId);
    if (!targetAmend) return;

    const validation = validatePOAmendment(po, targetAmend.revisedValueExclGst);
    if (!validation.valid) {
      showToast('Cannot Approve Amendment', validation.error || 'Validation failed', 'error');
      return;
    }

    const updatedAmendments = po.amendments.map((a) =>
      a.id === amendmentId
        ? {
            ...a,
            status: 'APPROVED' as const,
            approvedBy: currentUser.name,
            approvedAt: new Date().toLocaleString('en-IN'),
          }
        : a
    );

    const revisedAmountExclGst = targetAmend.revisedValueExclGst;
    const revisedAmountInclGst = revisedAmountExclGst * (1 + po.gstRate / 100);

    const updatedPoRaw: PurchaseOrder = {
      ...po,
      amountExclGst: revisedAmountExclGst,
      amountInclGst: revisedAmountInclGst,
      amendments: updatedAmendments,
      activityLogs: [
        {
          id: `act-${Date.now()}`,
          poId: po.id,
          timestamp: new Date().toLocaleString('en-IN'),
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'PO Value Amended',
          details: `Approved PO contractual value revision from ₹${targetAmend.originalValueExclGst.toLocaleString('en-IN')} to ₹${revisedAmountExclGst.toLocaleString('en-IN')}`,
        },
        ...(po.activityLogs || []),
      ],
    };

    const finalPo = recalculatePOBalances(updatedPoRaw);
    updatePOsState((prev) => prev.map((p) => (p.id === poId ? finalPo : p)));
    showToast('Amendment Approved', `Revised PO contractual value applied to ${po.poNumber}`);
  };

  const addAssignment = (assignmentData: Omit<Assignment, 'id'>): Assignment => {
    const newAsgn: Assignment = {
      ...assignmentData,
      id: `asgn-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setAssignments((prev) => [newAsgn, ...prev]);
    showToast('Assignment Created', `Assigned ${assignmentData.employeeName} to ${assignmentData.projectName}`);
    return newAsgn;
  };

  const updateAssignment = (id: string, updatedFields: Partial<Assignment>) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updatedFields, updatedAt: new Date().toISOString() } : a))
    );
    showToast('Assignment Updated', 'Employee assignment updated successfully.');
  };

  const terminateAssignment = (id: string, effectiveTerminationDate: string, reason: string) => {
    const target = assignments.find((a) => a.id === id);
    if (!target) return;

    const updatedRecord: Assignment = {
      ...target,
      status: 'Terminated',
      assignedTo: effectiveTerminationDate,
      effectiveTerminationDate,
      terminationReason: reason,
      updatedAt: new Date().toISOString(),
    };

    setAssignments((prev) => prev.map((a) => (a.id === id ? updatedRecord : a)));

    // Also update PO's assignedEmployees status if linked
    if (target.poId) {
      updatePOsState((prev) =>
        prev.map((p) => {
          if (p.id === target.poId) {
            const updatedEmployees = p.assignedEmployees.map((e) =>
              e.employeeId === target.employeeId ? { ...e, status: 'Unassigned' as const, assignedTo: effectiveTerminationDate } : e
            );
            return {
              ...p,
              assignedEmployees: updatedEmployees,
              activityLogs: [
                {
                  id: `act-${Date.now()}`,
                  poId: p.id,
                  timestamp: new Date().toLocaleString('en-IN'),
                  userName: currentUser.name,
                  userRole: currentUser.role,
                  action: 'Employee Allocation Terminated',
                  details: `Terminated allocation for ${target.employeeName} effective ${effectiveTerminationDate}. Reason: ${reason}`,
                },
                ...(p.activityLogs || []),
              ],
            };
          }
          return p;
        })
      );
    }

    showToast('Allocation Terminated', `Ended ${target.employeeName}'s allocation effective ${effectiveTerminationDate}`);
  };

  const addInvoice = (
    poId: string,
    invoiceData: Omit<Invoice, 'id' | 'poId' | 'gstAmount' | 'totalAmountInclGst'>
  ) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    const gstAmount = invoiceData.amountExclGst * (invoiceData.gstRate / 100);
    const totalAmountInclGst = invoiceData.amountExclGst + gstAmount;

    const d = new Date(invoiceData.invoiceDate || Date.now());
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const bMonth = invoiceData.billingMonth || monthNames[d.getMonth()] || 'October';
    const bYear = invoiceData.billingYear || d.getFullYear() || 2026;
    const bPeriod = invoiceData.billingPeriod || `${bMonth} ${bYear}`;

    const newInvoice: Invoice = {
      ...invoiceData,
      id: `inv-${Date.now()}`,
      poId,
      billingMonth: bMonth,
      billingYear: bYear,
      billingPeriod: bPeriod,
      gstAmount,
      totalAmountInclGst,
    };

    updatePOsState((prev) =>
      prev.map((p) => {
        if (p.id === poId) {
          const updatedInvoices = [...p.invoices, newInvoice];
          const logText = invoiceData.isCreditNote
            ? `Credit Note ${invoiceData.invoiceNumber} added for ₹${invoiceData.amountExclGst.toLocaleString('en-IN')}`
            : `Invoice ${invoiceData.invoiceNumber} issued for ₹${invoiceData.amountExclGst.toLocaleString('en-IN')}`;
          const overrideLog = invoiceData.overrideReason
            ? [
                activity(
                  poId,
                  'Balance Override',
                  `Invoice ${invoiceData.invoiceNumber} exceeds the remaining balance of ₹${p.remainingBalanceExclGst.toLocaleString('en-IN')}. Reason: ${invoiceData.overrideReason}`
                ),
              ]
            : [];

          const updatedPo = {
            ...p,
            invoices: updatedInvoices,
            activityLogs: [
              ...p.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: invoiceData.isCreditNote ? 'Credit Note Added' : 'Invoice Issued',
                details: logText,
              },
              ...overrideLog,
            ],
          };
          return recalculatePOBalances(updatedPo);
        }
        return p;
      })
    );

    showToast('Invoice Saved', `Invoice ${invoiceData.invoiceNumber} recorded for PO ${po.poNumber}.`);
  };

  const updateInvoiceStatus = (poId: string, invoiceId: string, status: InvoiceStatus, paidAt?: string) => {
    updatePOsState((prev) =>
      prev.map((p) => {
        if (p.id === poId) {
          const updatedInvoices = p.invoices.map((inv) =>
            inv.id === invoiceId
              ? status === 'Paid'
                ? { ...inv, status, paidAt: paidAt || new Date().toISOString().split('T')[0], paidBy: currentUser.name }
                : { ...inv, status, paidAt: undefined, paidBy: undefined }
              : inv
          );
          const invObj = p.invoices.find((i) => i.id === invoiceId);
          const updatedPo = {
            ...p,
            invoices: updatedInvoices,
            activityLogs: [
              ...p.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Invoice Status Updated',
                details:
                  status === 'Paid'
                    ? `Invoice ${invObj?.invoiceNumber || invoiceId} marked Paid on ${paidAt || 'today'}.`
                    : `Invoice ${invObj?.invoiceNumber || invoiceId} status changed to ${status}.`,
              },
            ],
          };
          return recalculatePOBalances(updatedPo);
        }
        return p;
      })
    );
    showToast('Invoice Updated', `Status changed to ${status}.`);
  };

  const cancelInvoice = (poId: string, invoiceId: string) => {
    updatePOsState((prev) =>
      prev.map((p) => {
        if (p.id === poId) {
          const updatedInvoices = p.invoices.map((inv) =>
            inv.id === invoiceId ? { ...inv, status: 'Cancelled' as const } : inv
          );
          const invObj = p.invoices.find((i) => i.id === invoiceId);
          const updatedPo = {
            ...p,
            invoices: updatedInvoices,
            activityLogs: [
              ...p.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Invoice Cancelled',
                details: `Invoice ${invObj?.invoiceNumber || invoiceId} was cancelled. Balance restored.`,
              },
            ],
          };
          return recalculatePOBalances(updatedPo);
        }
        return p;
      })
    );
    showToast('Invoice Cancelled', 'Cancelled invoice does not reduce remaining PO balance.');
  };

  const assignEmployeeToPO = (poId: string, assignment: Omit<AssignedEmployee, 'status'>) => {
    const today = new Date().toISOString().split('T')[0];
    const isExpired = Boolean(assignment.assignedTo && today > assignment.assignedTo);
    const newAssigned: AssignedEmployee = {
      ...assignment,
      status: isExpired ? 'Inactive' : 'Active',
      billableDaysMethod: assignment.billableDaysMethod || 'calendar',
      manualBillableDays: assignment.billableDaysMethod === 'manual' ? assignment.manualBillableDays : undefined,
    };
    setPurchaseOrders((prev) =>
      prev.map((po) => {
        if (po.id === poId) {
          // Check if already assigned
          const exists = po.assignedEmployees.some((e) => e.employeeId === assignment.employeeId);
          const updatedAssigned = exists
            ? po.assignedEmployees.map((e) => (e.employeeId === assignment.employeeId ? newAssigned : e))
            : [...po.assignedEmployees, newAssigned];

          return {
            ...po,
            assignedEmployees: updatedAssigned,
            activityLogs: [
              ...po.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Employee Tagged',
                details: `Assigned ${assignment.employeeName} (${assignment.designation}) to PO ${po.poNumber}`,
              },
            ],
          };
        }
        return po;
      })
    );
    showToast('Employee Assigned', `${assignment.employeeName} tagged to PO.`);
  };

  const unassignEmployeeFromPO = (poId: string, employeeId: string) => {
    setPurchaseOrders((prev) =>
      prev.map((po) => {
        if (po.id === poId) {
          const emp = po.assignedEmployees.find((e) => e.employeeId === employeeId);
          return {
            ...po,
            assignedEmployees: po.assignedEmployees.filter((e) => e.employeeId !== employeeId),
            activityLogs: [
              ...po.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Employee Untagged',
                details: `Untagged ${emp?.employeeName || employeeId} from PO ${po.poNumber}`,
              },
            ],
          };
        }
        return po;
      })
    );
    showToast('Employee Removed', 'Employee untagged from PO.');
  };

  const replaceEmployeeOnPO = (
    poId: string,
    params: {
      outgoingEmployeeId: string;
      replacementEmployeeId: string;
      effectiveDate: string;
      billingRatePerMonth: number;
      billableDaysMethod?: BillableDaysMethod;
      manualBillableDays?: number;
      replacementAssignedTo?: string;
      reason?: string;
    }
  ) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) {
      showToast('Error', 'Purchase Order not found', 'error');
      return;
    }

    const outgoing = po.assignedEmployees.find((e) => e.employeeId === params.outgoingEmployeeId);
    if (!outgoing) {
      showToast('Error', 'Outgoing employee is not assigned to this PO', 'error');
      return;
    }

    const replacementProfile = employees.find((e) => e.employeeId === params.replacementEmployeeId);
    const replacementName = replacementProfile?.name || params.replacementEmployeeId;
    const replacementDesignation = replacementProfile?.designation || outgoing.designation;
    const replacementEmail = replacementProfile?.email;

    const repAssignedTo = params.replacementAssignedTo || outgoing.assignedTo || po.expiryDate;
    const today = new Date().toISOString().split('T')[0];
    const isRepExpired = Boolean(repAssignedTo && today > repAssignedTo);

    // 1. Update outgoing employee record: keep historically, set status to Inactive and assignedTo to effectiveDate
    const updatedEmployees = po.assignedEmployees.map((e) => {
      if (e.employeeId === params.outgoingEmployeeId) {
        return {
          ...e,
          assignedTo: params.effectiveDate,
          status: 'Inactive' as const,
          replacedByEmployeeId: params.replacementEmployeeId,
          replacementDate: params.effectiveDate,
        };
      }
      return e;
    });

    // 2. Add or update replacement employee record
    const replacementExists = updatedEmployees.some((e) => e.employeeId === params.replacementEmployeeId);
    const replacementRecord: AssignedEmployee = {
      employeeId: params.replacementEmployeeId,
      employeeName: replacementName,
      designation: replacementDesignation,
      billingRatePerMonth: params.billingRatePerMonth,
      assignedFrom: params.effectiveDate,
      assignedTo: repAssignedTo,
      status: isRepExpired ? 'Inactive' : 'Active',
      billableDaysMethod: params.billableDaysMethod || 'calendar',
      manualBillableDays: params.billableDaysMethod === 'manual' ? params.manualBillableDays : undefined,
      email: replacementEmail,
    };

    const finalAssignedEmployees = replacementExists
      ? updatedEmployees.map((e) => (e.employeeId === params.replacementEmployeeId ? replacementRecord : e))
      : [...updatedEmployees, replacementRecord];

    // 3. Update PO and log activity
    setPurchaseOrders((prev) =>
      prev.map((p) => {
        if (p.id === poId) {
          return {
            ...p,
            assignedEmployees: finalAssignedEmployees,
            activityLogs: [
              ...p.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId,
                timestamp: new Date().toLocaleString('en-IN'),
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Employee Replaced on PO',
                details: `Replaced ${outgoing.employeeName} (${outgoing.employeeId}) with ${replacementName} (${params.replacementEmployeeId}) effective ${params.effectiveDate}. Outgoing assignment ended; historical invoices and proformas preserved. ${params.reason ? `Reason: ${params.reason}` : ''}`,
              },
            ],
          };
        }
        return p;
      })
    );

    // 4. Update project Assignment records if present
    setAssignments((prev) => {
      const updated = prev.map((a) => {
        if (a.poId === poId && a.employeeId === params.outgoingEmployeeId && a.status === 'Active') {
          return {
            ...a,
            assignedTo: params.effectiveDate,
            status: 'Terminated' as const,
            effectiveTerminationDate: params.effectiveDate,
            terminationReason: params.reason || `Replaced by ${replacementName}`,
            updatedAt: new Date().toISOString(),
          };
        }
        return a;
      });

      const repAsgnExists = updated.some((a) => a.poId === poId && a.employeeId === params.replacementEmployeeId);
      if (!repAsgnExists) {
        const newAsgn: Assignment = {
          id: `asgn-${Date.now()}`,
          employeeId: params.replacementEmployeeId,
          employeeName: replacementName,
          designation: replacementDesignation,
          department: replacementProfile?.department,
          projectId: po.projectId,
          projectName: po.projectName,
          poId: po.id,
          poNumber: po.poNumber,
          assignedFrom: params.effectiveDate,
          assignedTo: repAssignedTo,
          allocationPercentage: 100,
          billingRatePerMonth: params.billingRatePerMonth,
          billableDaysMethod: params.billableDaysMethod || 'calendar',
          manualBillableDays: params.manualBillableDays,
          status: isRepExpired ? 'Inactive' : 'Active',
          notes: `Replacement for ${outgoing.employeeName} effective ${params.effectiveDate}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [newAsgn, ...updated];
      }
      return updated;
    });

    showToast(
      'Employee Replacement Applied',
      `Replaced ${outgoing.employeeName} with ${replacementName} effective ${params.effectiveDate}.`
    );
  };

  const addProformaInvoice = (
    data: Omit<ProformaInvoice, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'versions'>
  ): ProformaInvoice => {
    const gstRate = data.gstRate ?? 18;
    const gstAmount = data.gstAmount ?? Math.round(data.amountExclGst * (gstRate / 100));
    const totalAmountInclGst = data.totalAmountInclGst ?? (data.amountExclGst + gstAmount);
    const now = new Date().toISOString();
    const formattedNow = new Date().toLocaleString('en-IN');

    const newProforma: ProformaInvoice = {
      ...data,
      id: `prof-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      gstRate,
      gstAmount,
      totalAmountInclGst,
      status: data.status || 'Draft',
      version: 1,
      versions: [
        {
          version: 1,
          updatedAt: formattedNow,
          updatedBy: currentUser.name,
          amountExclGst: data.amountExclGst,
          gstAmount,
          totalAmountInclGst,
          notes: data.notes || 'Initial draft version',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    setProformaInvoices((prev) => [newProforma, ...prev]);

    // Financial isolation: PO remaining balance and invoiced total are NOT mutated by creating proformas!
    setPurchaseOrders((prev) =>
      prev.map((p) => {
        if (p.id === data.poId) {
          return {
            ...p,
            activityLogs: [
              ...p.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId: data.poId,
                timestamp: formattedNow,
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Proforma Invoice Created',
                details: `Draft Proforma ${newProforma.proformaNumber} generated for ${data.employeeName} (₹${data.amountExclGst.toLocaleString('en-IN')}). PO balance remains unaffected.`,
              },
            ],
          };
        }
        return p;
      })
    );

    showToast('Proforma Created', `Proforma Invoice ${newProforma.proformaNumber} saved as Draft.`);
    return newProforma;
  };

  const updateProformaInvoice = (id: string, updates: Partial<ProformaInvoice>, createNewVersion = false) => {
    setProformaInvoices((prev) =>
      prev.map((prof) => {
        if (prof.id !== id) return prof;

        const formattedNow = new Date().toLocaleString('en-IN');
        const now = new Date().toISOString();
        const amtExcl = updates.amountExclGst ?? prof.amountExclGst;
        const rate = updates.gstRate ?? prof.gstRate;
        const gstAmt = updates.gstAmount ?? Math.round(amtExcl * (rate / 100));
        const totalAmt = updates.totalAmountInclGst ?? (amtExcl + gstAmt);

        const shouldBumpVersion = createNewVersion || (prof.status !== 'Draft' && (updates.amountExclGst !== undefined || updates.lineItems !== undefined));
        const nextVersion = shouldBumpVersion ? prof.version + 1 : prof.version;

        const updatedVersions = shouldBumpVersion
          ? [
              ...prof.versions,
              {
                version: nextVersion,
                updatedAt: formattedNow,
                updatedBy: currentUser.name,
                amountExclGst: amtExcl,
                gstAmount: gstAmt,
                totalAmountInclGst: totalAmt,
                notes: updates.notes || `Revision v${nextVersion}`,
              },
            ]
          : prof.versions;

        return {
          ...prof,
          ...updates,
          amountExclGst: amtExcl,
          gstRate: rate,
          gstAmount: gstAmt,
          totalAmountInclGst: totalAmt,
          version: nextVersion,
          versions: updatedVersions,
          updatedAt: now,
        };
      })
    );
    showToast('Proforma Updated', `Proforma Invoice record updated successfully.`);
  };

  const deleteProformaInvoice = (id: string) => {
    setProformaInvoices((prev) => prev.filter((p) => p.id !== id));
    showToast('Proforma Deleted', 'Proforma invoice removed.');
  };

  const shareProformaInvoice = (id: string, recipientEmail: string, notes?: string) => {
    const prof = proformaInvoices.find((p) => p.id === id);
    if (!prof) {
      showToast('Error', 'Proforma Invoice not found', 'error');
      return { success: false, mode: 'draft_fallback' as const, message: 'Proforma not found' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail.trim())) {
      showToast('Invalid Email', 'Please provide a valid recipient email address', 'error');
      return { success: false, mode: 'draft_fallback' as const, message: 'Invalid email address' };
    }

    const formattedNow = new Date().toLocaleString('en-IN');
    const now = new Date().toISOString();

    setProformaInvoices((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              status: p.status === 'Draft' ? 'Sent' : p.status,
              recipientEmail: recipientEmail.trim(),
              sentAt: now,
              notes: notes ? (p.notes ? `${p.notes} | ${notes}` : notes) : p.notes,
              updatedAt: now,
            }
          : p
      )
    );

    // Audit log
    setPurchaseOrders((prev) =>
      prev.map((po) => {
        if (po.id === prof.poId) {
          return {
            ...po,
            activityLogs: [
              ...po.activityLogs,
              {
                id: `act-${Date.now()}`,
                poId: po.id,
                timestamp: formattedNow,
                userName: currentUser.name,
                userRole: currentUser.role,
                action: 'Proforma Invoice Shared',
                details: `Proforma Invoice ${prof.proformaNumber} (v${prof.version}) prepared for ${prof.employeeName} to recipient ${recipientEmail.trim()} via Draft/Preview fallback (Local delivery mode: No external outbound SMTP service configured).`,
              },
            ],
          };
        }
        return po;
      })
    );

    const subject = encodeURIComponent(`Proforma Invoice ${prof.proformaNumber} — ${prof.projectName}`);
    const body = encodeURIComponent(
      `Dear ${prof.employeeName},\n\nPlease review attached Proforma Invoice ${prof.proformaNumber} for period ${prof.billingPeriodStart} to ${prof.billingPeriodEnd}.\nTotal Amount: INR ${prof.totalAmountInclGst.toLocaleString('en-IN')}.\n\nRegards,\nPrime Star Finance & Billing Team`
    );
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail.trim())}?subject=${subject}&body=${body}`;

    showToast(
      'Proforma Shared (Draft Fallback)',
      `Recipient confirmed (${recipientEmail.trim()}). Prepared draft dispatch fallback.`
    );

    return {
      success: true,
      mode: 'draft_fallback' as const,
      message: `Proforma document ready. Recipient confirmed as ${recipientEmail.trim()}. Generated draft email link and PDF attachment preview.`,
      mailtoUrl,
    };
  };

  const updateEmployeeEmail = (employeeId: string, email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showToast('Invalid Email', 'Please provide a valid email format.', 'error');
      return;
    }

    setEmployees((prev) =>
      prev.map((e) => (e.employeeId === employeeId ? { ...e, email: email.trim() } : e))
    );

    setPurchaseOrders((prev) =>
      prev.map((po) => ({
        ...po,
        assignedEmployees: po.assignedEmployees.map((ae) =>
          ae.employeeId === employeeId ? { ...ae, email: email.trim() } : ae
        ),
      }))
    );

    showToast('Email Updated', `Updated email address for ${employeeId}.`);
  };

  const addSOW = (sowData: Omit<StatementOfWork, 'id'>): StatementOfWork => {
    const newSow: StatementOfWork = { ...sowData, id: `sow-${Date.now()}` };
    setSows((prev) => [newSow, ...prev]);
    showToast('SOW Added', `Statement of Work ${sowData.sowNumber} recorded.`);
    return newSow;
  };

  const addQuotation = (quotData: Omit<Quotation, 'id'>): Quotation => {
    const newQuot: Quotation = { ...quotData, id: `quot-${Date.now()}` };
    setQuotations((prev) => [newQuot, ...prev]);
    showToast('Quotation Added', `Quotation ${quotData.quotationNumber} recorded.`);
    return newQuot;
  };

  // Candidate / Onboarding Actions
  const inviteCandidate = (data: {
    candidateName: string;
    email: string;
    phone: string;
    designation: string;
    proposedDepartment: string;
    offeredCtc: number;
    joiningDate: string;
    isExperienced: boolean;
    assignedHr?: string;
  }): CandidateOnboarding => {
    const token = `token-${Math.random().toString(36).substring(2, 9)}`;
    const newCand: CandidateOnboarding = {
      id: `cand-${Date.now()}`,
      token,
      candidateName: data.candidateName,
      email: data.email,
      phone: data.phone,
      residentialAddress: '',
      designation: data.designation,
      proposedDepartment: data.proposedDepartment,
      offeredCtc: data.offeredCtc,
      joiningDate: data.joiningDate,
      assignedHr: data.assignedHr || 'Priya Sharma (HR Lead)',
      status: 'Invite Sent',
      invitationSentAt: new Date().toLocaleString('en-IN'),
      isExperienced: data.isExperienced,
      hasAcceptedDeclaration: false,
      educationList: [],
      employmentList: [],
      references: [],
      emergencyContacts: [],
      identityDocs: {},
    };

    setCandidates((prev) => [newCand, ...prev]);
    showToast('Candidate Invitation Generated', `Personal onboarding link ready for ${data.candidateName}.`);
    return newCand;
  };

  const updateCandidateOnboarding = (token: string, data: Partial<CandidateOnboarding>) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.token === token) {
          return { ...c, ...data };
        }
        return c;
      })
    );
  };

  const editCandidateDetails = (candidateId: string, updatedFields: Partial<CandidateOnboarding>) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, ...updatedFields } : c))
    );
    showToast('Candidate Record Updated', 'Candidate details saved successfully.');
  };

  const cancelCandidateOnboarding = (candidateId: string, reason?: string) => {
    const cand = candidates.find((c) => c.id === candidateId);
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              status: 'Declined',
              hrComments: reason ? `Cancelled/Archived: ${reason}` : c.hrComments,
            }
          : c
      )
    );
    showToast(
      'Onboarding Cancelled',
      `Candidate ${cand?.candidateName || candidateId} marked as Declined / Cancelled.`,
      'warning'
    );
  };

  const reviewCandidateForm = (
    candidateId: string,
    action: 'approve' | 'return_for_correction',
    hrComments: string
  ) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const newStatus: CandidateStatus =
            action === 'approve' ? 'Under HR Review' : 'Returned for Correction';
          return {
            ...c,
            status: newStatus,
            reviewedAt: new Date().toLocaleString('en-IN'),
            hrComments,
          };
        }
        return c;
      })
    );

    if (action === 'approve') {
      showToast('Form HR Reviewed', 'Candidate form marked as verified.');
    } else {
      showToast('Form Returned to Candidate', 'Form unlocked for candidate correction.', 'warning');
    }
  };

  const releaseOfferLetter = (candidateId: string) => {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;
    if (!cand.joiningDate) {
      showToast('Offer Hold', 'Joining date must be confirmed before releasing offer letter.', 'error');
      return;
    }

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'Offer Released' } : c))
    );
    showToast('Offer Letter Released', `Offer letter generated and sent to ${cand.candidateName}.`);
  };

  const confirmCandidateJoining = (candidateId: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'Joining Confirmed' } : c))
    );
    showToast('Joining Confirmed', 'Candidate marked as Joining Confirmed.');
  };

  const updateCandidateChecklist = (
    candidateId: string,
    checklistState: Record<string, 'Pending' | 'Verified' | 'Waived'>
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, checklistState } : c))
    );
  };

  const completeOnboarding = (candidateId: string) => {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    // Check if employee record already exists by email or name
    const existingEmp = employees.find(
      (e) =>
        e.email.toLowerCase() === cand.email.toLowerCase() ||
        e.name.toLowerCase() === cand.candidateName.toLowerCase()
    );

    let assignedEmpId = '';

    if (existingEmp) {
      assignedEmpId = existingEmp.employeeId;
      // Update existing employee record
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === existingEmp.id
            ? {
                ...e,
                designation: cand.designation || e.designation,
                department: cand.proposedDepartment || e.department,
                joiningDate: cand.joiningDate || e.joiningDate,
                phone: cand.phone || e.phone,
                panNumber: cand.identityDocs?.panNumber || e.panNumber,
                aadhaarNumber: cand.identityDocs?.aadhaarNumber || e.aadhaarNumber,
              }
            : e
        )
      );
    } else {
      // Generate new EmployeeProfile
      const newEmpIdNum = 120 + employees.length + 1;
      assignedEmpId = `PS-${newEmpIdNum}`;
      const newEmployee: EmployeeProfile = {
        id: `emp-${Date.now()}`,
        employeeId: assignedEmpId,
        name: cand.candidateName,
        email: cand.email,
        phone: cand.phone,
        designation: cand.designation,
        department: cand.proposedDepartment,
        joiningDate: cand.joiningDate || new Date().toISOString().split('T')[0],
        managerName: 'Priya Sundaram (HR Head)',
        projectName: 'Bench / Unassigned',
        location: 'Bengaluru (HQ)',
        panNumber: cand.identityDocs?.panNumber || '',
        aadhaarNumber: cand.identityDocs?.aadhaarNumber || '',
        salaryStructure: {
          id: `sal-${Date.now()}`,
          employeeId: assignedEmpId,
          employeeName: cand.candidateName,
          designation: cand.designation,
          annualCtc: cand.offeredCtc,
          basicMonthly: Math.round((cand.offeredCtc * 0.5) / 12),
          hraMonthly: Math.round((cand.offeredCtc * 0.2) / 12),
          conveyanceMonthly: 1600,
          specialAllowanceMonthly: Math.round((cand.offeredCtc * 0.25) / 12),
          projectAllowanceMonthly: 0,
          grossMonthly: Math.round(cand.offeredCtc / 12),
          pfDeductionMonthly: 1800,
          professionalTaxMonthly: 200,
          tdsDeductionMonthly: Math.round((cand.offeredCtc * 0.1) / 12),
          totalDeductionsMonthly: Math.round((cand.offeredCtc * 0.1) / 12) + 2000,
          netTakeHomeMonthly: Math.round(cand.offeredCtc / 12) - (Math.round((cand.offeredCtc * 0.1) / 12) + 2000),
          effectiveDate: cand.joiningDate || new Date().toISOString().split('T')[0],
        },
      };

      setEmployees((prev) => [...prev, newEmployee]);
    }

    // Mark candidate as Joined
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: 'Joined' } : c))
    );

    showToast(
      'Onboarding Completed!',
      `Candidate ${cand.candidateName} onboarded as Employee ${assignedEmpId}.`
    );
  };

  // Salary actions
  const updateSalaryStructure = (employeeId: string, updatedStructure: Partial<SalaryStructure>) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.employeeId === employeeId || emp.id === employeeId) {
          const current = emp.salaryStructure;
          const merged = { ...current, ...updatedStructure };

          // Recalculate gross and deductions
          const grossMonthly =
            (merged.basicMonthly || 0) +
            (merged.hraMonthly || 0) +
            (merged.conveyanceMonthly || 0) +
            (merged.specialAllowanceMonthly || 0) +
            (merged.projectAllowanceMonthly || 0);

          const totalDeductionsMonthly =
            (merged.pfDeductionMonthly || 0) +
            (merged.professionalTaxMonthly || 0) +
            (merged.tdsDeductionMonthly || 0);

          const netTakeHomeMonthly = grossMonthly - totalDeductionsMonthly;

          return {
            ...emp,
            salaryStructure: {
              ...merged,
              grossMonthly,
              totalDeductionsMonthly,
              netTakeHomeMonthly,
            },
          };
        }
        return emp;
      })
    );
    showToast('Salary Structure Updated', 'Employee compensation structure saved.');
  };

  // Timesheet actions
  const submitTimesheet = (timesheetId: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (ts.id !== timesheetId) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Submitted' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
        };
        return {
          ...ts,
          status: 'Submitted',
          submittedAt: timestamp,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Timesheet Submitted', 'Timesheet locked and sent to Project Manager for approval.');
  };

  const approveTimesheet = (timesheetId: string, comments?: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (ts.id !== timesheetId) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Approved' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments,
        };
        return {
          ...ts,
          status: 'Approved',
          approverName: currentUser.name,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Timesheet Approved', 'Timesheet status updated to Approved.');
  };

  const rejectTimesheet = (timesheetId: string, reason: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (ts.id !== timesheetId) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Rejected' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments: reason,
        };
        return {
          ...ts,
          status: 'Rejected',
          rejectionReason: reason,
          approverName: currentUser.name,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Timesheet Returned', 'Timesheet returned to employee for revision.', 'warning');
  };

  const requestUnlockTimesheet = (timesheetId: string, reason: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (ts.id !== timesheetId) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Unlock Requested' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments: reason,
        };
        return {
          ...ts,
          status: 'Unlock Requested',
          unlockReason: reason,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Unlock Requested', 'Unlock request sent to Manager for approval.');
  };

  const approveUnlockTimesheet = (timesheetId: string, comments?: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (ts.id !== timesheetId) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Unlock Approved' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments,
        };
        return {
          ...ts,
          status: 'Draft',
          unlockReason: undefined,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Timesheet Unlocked', 'Timesheet unlocked and set to Draft for edits.');
  };

  const rejectUnlockTimesheet = (timesheetId: string, reason: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (ts.id !== timesheetId) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Unlock Rejected' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments: reason,
        };
        return {
          ...ts,
          status: ts.submittedAt ? 'Submitted' : 'Approved',
          unlockReason: undefined,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Unlock Declined', 'Unlock request declined. Timesheet remains locked.', 'warning');
  };

  const bulkApproveTimesheets = (timesheetIds: string[]) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (!timesheetIds.includes(ts.id)) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Approved' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments: 'Approved in bulk action',
        };
        return {
          ...ts,
          status: 'Approved',
          approverName: currentUser.name,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Bulk Approval Complete', `${timesheetIds.length} timesheets approved.`);
  };

  const bulkRejectTimesheets = (timesheetIds: string[], reason: string) => {
    const timestamp = new Date().toLocaleString('en-IN');
    setTimesheets((prev) =>
      prev.map((ts) => {
        if (!timesheetIds.includes(ts.id)) return ts;
        const newLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: 'Rejected' as const,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          comments: reason,
        };
        return {
          ...ts,
          status: 'Rejected',
          rejectionReason: reason,
          approverName: currentUser.name,
          auditTrail: [...(ts.auditTrail || []), newLog],
        };
      })
    );
    showToast('Bulk Rejection Complete', `${timesheetIds.length} timesheets returned for revision.`, 'warning');
  };

  const createTimesheet = (entryData: Omit<TimesheetEntry, 'id'>) => {
    const timestamp = new Date().toLocaleString('en-IN');
    const newId = `ts-${Date.now()}`;
    const initialLog = {
      id: `aud-${Date.now()}`,
      timestamp,
      action: 'Created' as const,
      actorName: currentUser.name,
      actorRole: currentUser.role,
    };

    const newTimesheet: TimesheetEntry = {
      ...entryData,
      id: newId,
      auditTrail: [initialLog],
    };

    setTimesheets((prev) => [newTimesheet, ...prev]);
    showToast('Timesheet Created', `Timesheet for ${newTimesheet.employeeName} logged successfully.`);
  };

  // Profile Change Request Actions
  const createProfileChangeRequest = (data: {
    employeeId: string;
    employeeName: string;
    fieldName: string;
    fieldKey: string;
    currentValue: string;
    proposedValue: string;
    reason: string;
  }): ProfileChangeRequest => {
    const newReq: ProfileChangeRequest = {
      id: `pcr-${Date.now()}`,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterRole: currentUser.role,
      employeeId: data.employeeId,
      employeeName: data.employeeName,
      fieldName: data.fieldName,
      fieldKey: data.fieldKey,
      currentValue: data.currentValue,
      proposedValue: data.proposedValue,
      reason: data.reason,
      submittedAt: new Date().toLocaleString('en-IN'),
      status: 'Pending',
    };

    setProfileRequests((prev) => [newReq, ...prev]);

    // Also add to system notifications for HR
    setNotifications((prev) => [
      {
        id: `notif-pcr-${Date.now()}`,
        title: 'Profile Change Request Pending',
        message: `${data.employeeName} requested to update ${data.fieldName} to "${data.proposedValue}".`,
        type: 'info',
        timestamp: new Date().toLocaleString('en-IN'),
        isRead: false,
        link: '/admin/profile-requests',
      },
      ...prev,
    ]);

    showToast('Change Request Submitted', `Profile change request submitted for HR review.`);
    return newReq;
  };

  const reviewProfileChangeRequest = (
    requestId: string,
    action: 'approve' | 'reject',
    reviewerComments: string
  ) => {
    const req = profileRequests.find((r) => r.id === requestId);
    if (!req) return;

    if (action === 'approve') {
      // 1. Update official profile in master application state
      updateEmployeeProfile(req.employeeId, {
        [req.fieldKey]: req.proposedValue,
      });

      // 2. Mark request as Approved
      setProfileRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'Approved' as const,
                reviewedBy: `${currentUser.name} (${currentUser.role})`,
                reviewedAt: new Date().toLocaleString('en-IN'),
                reviewerComments,
              }
            : r
        )
      );

      showToast(
        'Request Approved',
        `Approved change for ${req.employeeName}. Official profile updated with "${req.proposedValue}".`
      );
    } else {
      // Reject request -> official profile remains unchanged
      setProfileRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'Rejected' as const,
                reviewedBy: `${currentUser.name} (${currentUser.role})`,
                reviewedAt: new Date().toLocaleString('en-IN'),
                reviewerComments,
              }
            : r
        )
      );

      showToast(
        'Request Rejected',
        `Rejected change request for ${req.employeeName}. Official profile left unchanged.`,
        'warning'
      );
    }
  };

  const updateEmployeeProfile = (employeeId: string, updatedFields: Partial<EmployeeProfile>) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.employeeId === employeeId || emp.id === employeeId) {
          return { ...emp, ...updatedFields };
        }
        return emp;
      })
    );

    // Sync RoleContext active user profile override
    updateProfileOverride(employeeId, {
      name: updatedFields.name,
      email: updatedFields.email,
      designation: updatedFields.designation,
      department: updatedFields.department,
    });

    // Cascade name or designation changes across associated data views
    if (updatedFields.name || updatedFields.designation) {
      if (updatedFields.name) {
        setTimesheets((prev) =>
          prev.map((ts) =>
            ts.employeeId === employeeId ? { ...ts, employeeName: updatedFields.name! } : ts
          )
        );
      }

      setPurchaseOrders((prev) =>
        prev.map((po) => ({
          ...po,
          assignedEmployees: po.assignedEmployees.map((ae) => {
            if (ae.employeeId === employeeId) {
              return {
                ...ae,
                employeeName: updatedFields.name || ae.employeeName,
                designation: updatedFields.designation || ae.designation,
              };
            }
            return ae;
          }),
        }))
      );
    }

    showToast(
      'Profile Updated',
      `Official employee profile for ${employeeId} updated by ${currentUser.name} (${currentUser.role}).`
    );
  };

  const updateUserPreferences = (prefs: Partial<UserPreferences>) => {
    setUserPreferences((prev) => ({ ...prev, ...prefs }));
    showToast('Preferences Saved', 'User account preferences updated.');
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  return (
    <DataContext.Provider
      value={{
        projects,
        sows,
        quotations,
        purchaseOrders,
        candidates,
        employees,
        timesheets,
        notifications,
        profileRequests,
        userPreferences,
        assignments,
        proformaInvoices,
        addProject,
        createPO,
        updatePO,
        closePO,
        addPOComment,
        savePOMilestones,
        importPurchaseOrders,
        importEmployees,
        renewPO,
        submitPOAmendment,
        approvePOAmendment,
        addInvoice,
        updateInvoiceStatus,
        cancelInvoice,
        assignEmployeeToPO,
        unassignEmployeeFromPO,
        replaceEmployeeOnPO,
        addProformaInvoice,
        updateProformaInvoice,
        deleteProformaInvoice,
        shareProformaInvoice,
        updateEmployeeEmail,
        addSOW,
        uploadAndMergeSOW,
        addQuotation,
        addAssignment,
        updateAssignment,
        terminateAssignment,
        inviteCandidate,
        updateCandidateOnboarding,
        editCandidateDetails,
        cancelCandidateOnboarding,
        reviewCandidateForm,
        releaseOfferLetter,
        confirmCandidateJoining,
        completeOnboarding,
        updateCandidateChecklist,
        updateSalaryStructure,
        submitTimesheet,
        approveTimesheet,
        rejectTimesheet,
        requestUnlockTimesheet,
        approveUnlockTimesheet,
        rejectUnlockTimesheet,
        bulkApproveTimesheets,
        bulkRejectTimesheets,
        createTimesheet,
        createProfileChangeRequest,
        reviewProfileChangeRequest,
        updateEmployeeProfile,
        updateUserPreferences,
        markNotificationRead,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
