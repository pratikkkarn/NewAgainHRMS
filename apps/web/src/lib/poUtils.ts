import { PurchaseOrder, Project, Invoice, POAmendment } from '../types/domain';
import { getDaysRemainingCalendar } from './utils';

export interface POCounts {
  taxInvoiceCount: number;
  creditNoteCount: number;
  cancelledCount: number;
  totalLedgerCount: number;
}

/**
 * Calculates standardized invoice and credit note counts for a Purchase Order.
 * Tax invoices are counted separately from credit notes.
 */
export const getPOCounts = (po: PurchaseOrder): POCounts => {
  const taxInvoiceCount = po.invoices.filter((i) => !i.isCreditNote && i.status !== 'Cancelled').length;
  const creditNoteCount = po.invoices.filter((i) => i.isCreditNote && i.status !== 'Cancelled').length;
  const cancelledCount = po.invoices.filter((i) => i.status === 'Cancelled').length;
  const totalLedgerCount = po.invoices.length;

  return {
    taxInvoiceCount,
    creditNoteCount,
    cancelledCount,
    totalLedgerCount,
  };
};

/**
 * Recalculates PO financial balances based strictly on PO-specific invoices & credit notes.
 * Status rules:
 * - 'Issued' or 'Paid': Active transactions. Mutate net invoiced totals and PO balance.
 * - 'Pending': Draft/unapproved. Zero financial effect until approved/issued.
 * - 'Cancelled': Voided. Zero financial effect.
 *
 * Formula:
 * - Gross Invoiced (excl GST) = sum of all active tax invoices (!isCreditNote && (status === 'Issued' || status === 'Paid'))
 * - Credit Notes (excl GST) = sum of all active credit notes (isCreditNote && (status === 'Issued' || status === 'Paid'))
 * - Remaining PO Balance (excl GST) = Current Approved PO Amount - Gross Invoiced + Credit Notes
 */
export const recalculatePOBalances = (po: PurchaseOrder): PurchaseOrder => {
  let invoicedExclGst = 0;
  let creditNotesExclGst = 0;

  po.invoices.forEach((inv) => {
    // Only Issued or Paid invoices/credit notes affect active financial totals
    if (inv.status === 'Issued' || inv.status === 'Paid') {
      if (inv.isCreditNote) {
        creditNotesExclGst += Math.abs(inv.amountExclGst);
      } else {
        invoicedExclGst += Math.abs(inv.amountExclGst);
      }
    }
  });

  const remainingBalanceExclGst = Math.max(0, po.amountExclGst - invoicedExclGst + creditNotesExclGst);

  let status = po.status;
  if (status !== 'Renewed' && status !== 'Closed') {
    if (remainingBalanceExclGst === 0) {
      status = 'Fully Utilized';
    } else if (remainingBalanceExclGst / po.amountExclGst <= 0.15) {
      status = 'Low Balance';
    } else {
      const diffDays = getDaysRemainingCalendar(po.expiryDate);
      if (diffDays !== null) {
        if (diffDays < 0) {
          status = 'Expired';
        } else if (diffDays <= 60) {
          status = 'Expiring Soon';
        } else {
          status = 'Active';
        }
      }
    }
  }

  const originalAmountExclGst =
    po.originalAmountExclGst !== undefined ? po.originalAmountExclGst : po.amountExclGst;

  return {
    ...po,
    originalAmountExclGst,
    amendments: po.amendments || [],
    invoicedExclGst,
    creditNotesExclGst,
    remainingBalanceExclGst,
    status,
  };
};

/**
 * Validates whether a proposed PO value amendment conflicts with existing issued invoices.
 * Safeguard:
 * - Proposed revised value cannot be less than active issued invoices total (Issued or Paid).
 * - Proposed value must be greater than zero.
 */
export const validatePOAmendment = (
  po: PurchaseOrder,
  proposedValueExclGst: number
): { valid: boolean; error?: string; activeInvoicedTotal: number } => {
  const recalculated = recalculatePOBalances(po);
  const activeInvoicedTotal = recalculated.invoicedExclGst;

  if (isNaN(proposedValueExclGst) || proposedValueExclGst <= 0) {
    return {
      valid: false,
      error: 'Proposed revised PO contractual value must be a valid number greater than zero.',
      activeInvoicedTotal,
    };
  }

  if (proposedValueExclGst < activeInvoicedTotal) {
    return {
      valid: false,
      error: `Cannot approve PO value amendment to ₹${proposedValueExclGst.toLocaleString(
        'en-IN'
      )}. Active issued invoices total ₹${activeInvoicedTotal.toLocaleString(
        'en-IN'
      )}, which exceeds the proposed revised PO value.`,
      activeInvoicedTotal,
    };
  }

  return { valid: true, activeInvoicedTotal };
};

/**
 * Applies an approved PO amendment to a Purchase Order record safely.
 * Updates current approved contractual value, recalculates GST, records amendment history, and adds activity log.
 */
export const applyPOAmendment = (
  po: PurchaseOrder,
  amendmentInput: Omit<POAmendment, 'id' | 'poId' | 'createdAt' | 'status'> & {
    poId?: string;
    requestedBy?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  },
  approverUser?: { name: string; role: string }
): PurchaseOrder => {
  const validation = validatePOAmendment(po, amendmentInput.revisedValueExclGst);
  if (!validation.valid && amendmentInput.status === 'APPROVED') {
    throw new Error(validation.error || 'Cannot approve amendment due to financial validation failure.');
  }

  const amendmentId = `amend-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nowStr = new Date().toLocaleString('en-IN');

  const amendmentRecord: POAmendment = {
    ...amendmentInput,
    poId: po.id,
    requestedBy: amendmentInput.requestedBy || approverUser?.name || 'Authorized User',
    id: amendmentId,
    createdAt: amendmentInput.effectiveDate || new Date().toISOString().split('T')[0],
    status: amendmentInput.status || 'APPROVED',
    approvedBy: amendmentInput.status === 'APPROVED' ? approverUser?.name || 'System Approver' : undefined,
    approvedAt: amendmentInput.status === 'APPROVED' ? nowStr : undefined,
  };

  const existingOriginal = po.originalAmountExclGst !== undefined ? po.originalAmountExclGst : po.amountExclGst;
  const currentAmendments = po.amendments || [];
  const updatedAmendments = [amendmentRecord, ...currentAmendments];

  if (amendmentRecord.status === 'APPROVED') {
    const revisedAmountExclGst = amendmentInput.revisedValueExclGst;
    const revisedAmountInclGst = revisedAmountExclGst * (1 + po.gstRate / 100);

    const logDetails = `PO Contractual Value amended from ₹${amendmentInput.originalValueExclGst.toLocaleString(
      'en-IN'
    )} to ₹${revisedAmountExclGst.toLocaleString('en-IN')} (${amendmentInput.changeType} of ₹${amendmentInput.changeAmountExclGst.toLocaleString(
      'en-IN'
    )}). Reason: ${amendmentInput.reason}`;

    const updatedPoRaw: PurchaseOrder = {
      ...po,
      amountExclGst: revisedAmountExclGst,
      amountInclGst: revisedAmountInclGst,
      originalAmountExclGst: existingOriginal,
      amendments: updatedAmendments,
      activityLogs: [
        {
          id: `act-${Date.now()}`,
          poId: po.id,
          timestamp: nowStr,
          userName: approverUser?.name || 'Authorized Approver',
          userRole: approverUser?.role || 'Admin',
          action: 'PO Value Amended',
          details: logDetails,
        },
        ...(po.activityLogs || []),
      ],
    };

    return recalculatePOBalances(updatedPoRaw);
  } else {
    // Recorded as PENDING or REJECTED
    return {
      ...po,
      originalAmountExclGst: existingOriginal,
      amendments: updatedAmendments,
    };
  }
};

/**
 * Validates whether a new tax invoice amount exceeds the available PO balance.
 */
export const validateNewInvoiceAmount = (po: PurchaseOrder, newAmountExclGst: number): { valid: boolean; error?: string } => {
  const recalculated = recalculatePOBalances(po);
  if (newAmountExclGst <= 0) {
    return { valid: false, error: 'Invoice amount must be greater than zero.' };
  }
  if (newAmountExclGst > recalculated.remainingBalanceExclGst) {
    return {
      valid: false,
      error: `Invoice amount (₹${newAmountExclGst.toLocaleString('en-IN')}) exceeds available remaining PO balance (₹${recalculated.remainingBalanceExclGst.toLocaleString('en-IN')}).`,
    };
  }
  return { valid: true };
};

/**
 * Validates whether a new credit note is eligible based on gross active previously invoiced tax totals for the PO.
 * Rule: Eligible Amount to Credit = Gross Active Tax Invoiced - Existing Active Credit Notes.
 * Credit notes are NOT rejected simply because the remaining PO balance is low or zero.
 */
export const validateNewCreditNoteAmount = (po: PurchaseOrder, creditAmountExclGst: number): { valid: boolean; error?: string } => {
  const recalculated = recalculatePOBalances(po);
  if (creditAmountExclGst <= 0) {
    return { valid: false, error: 'Credit note amount must be greater than zero.' };
  }
  const eligibleAmount = recalculated.invoicedExclGst - recalculated.creditNotesExclGst;
  if (eligibleAmount <= 0) {
    return { valid: false, error: 'No active previously invoiced amounts exist on this PO to issue a credit note against.' };
  }
  if (creditAmountExclGst > eligibleAmount) {
    return {
      valid: false,
      error: `Credit note amount (₹${creditAmountExclGst.toLocaleString('en-IN')}) exceeds eligible net invoiced amount (₹${eligibleAmount.toLocaleString('en-IN')}).`,
    };
  }
  return { valid: true };
};

/**
 * Recalculates Project financial totals based on PO-specific active purchase orders.
 */
export const recalculateProjectBalances = (projects: Project[], purchaseOrders: PurchaseOrder[]): Project[] => {
  return projects.map((proj) => {
    const projPOs = purchaseOrders.filter((p) => p.projectId === proj.id);
    const totalPoValue = projPOs.reduce((sum, p) => sum + (p.amountExclGst || 0), 0);
    const remainingBalance = projPOs.reduce((sum, p) => sum + (p.remainingBalanceExclGst || 0), 0);
    return {
      ...proj,
      totalPoValue,
      remainingBalance,
    };
  });
};


/**
 * An invoice larger than the remaining balance is blocked, unless the user may override
 * (CEO / PO Admin) and gives a written reason of at least 10 characters.
 * Returns an error message, or null when the invoice may be saved.
 */
export const checkInvoiceOverride = (
  po: PurchaseOrder,
  amountExclGst: number,
  canOverride: boolean,
  reason: string
): string | null => {
  if (amountExclGst <= po.remainingBalanceExclGst) return null;
  const over = `Invoice amount (₹${amountExclGst.toLocaleString('en-IN')}) exceeds the remaining PO balance (₹${po.remainingBalanceExclGst.toLocaleString('en-IN')}).`;
  if (!canOverride) return `${over} Reduce the amount or add a credit note. Only the CEO or a PO Admin can override.`;
  if (reason.trim().length < 10) return `${over} To override, give a reason of at least 10 characters.`;
  return null;
};

/** Checks a new billing milestone against its PO. Returns an error message or null. */
export const checkMilestone = (po: PurchaseOrder, title: string, dueDate: string, amount: number): string | null => {
  if (!title.trim()) return 'Give the milestone a name.';
  if (!dueDate) return 'Pick a due date.';
  if (dueDate < po.startDate || dueDate > po.expiryDate) {
    return `The due date must fall within the PO period (${po.startDate} to ${po.expiryDate}).`;
  }
  if (!(amount > 0)) return 'The amount must be greater than zero.';
  return null;
};
