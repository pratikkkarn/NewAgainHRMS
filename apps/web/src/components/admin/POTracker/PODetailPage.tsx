import React, { useState, useEffect } from 'react';
import { PurchaseOrder, Invoice } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { Badge, Button, Card, Modal } from '../../common/UIComponents';
import { formatINR, formatDate, getDaysRemainingCalendar, getExpiryCountdownLabel } from '../../../lib/utils';
import { getPOCounts } from '../../../lib/poUtils';
import { downloadDocument, getDocumentSource } from '../../../lib/documentDownloader';
import { PdfViewer } from '../../common/PdfViewer';
import {
  FileText,
  DollarSign,
  Users,
  RefreshCw,
  Clock,
  Plus,
  Trash2,
  Download,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Building2,
  FileSpreadsheet,
  Ban,
  Flag,
  MessageSquare,
  Lock,
} from 'lucide-react';
import { POInvoiceModal } from './POInvoiceModal';
import { SOWUploadMergeModal } from './SOWUploadMergeModal';
import { Layers, FileUp, Paperclip, History } from 'lucide-react';
import { PORenewalModal } from './PORenewalModal';
import { POEmployeeAssignModal } from './POEmployeeAssignModal';
import { POAmendModal } from './POAmendModal';
import { POEmployeeReplaceModal } from './POEmployeeReplaceModal';
import { TerminateAssignmentModal } from '../Assignments/TerminateAssignmentModal';
import { POForecastPanel } from './POForecastPanel';
import { POMilestonesPanel } from './POMilestonesPanel';
import { POCommentsPanel } from './POCommentsPanel';
import { POCloseModal } from './POCloseModal';
import { renewalGapDays } from '../../../lib/poForecast';

import { getValidatedReturnTab } from '../../../lib/navAccess';

interface PODetailPageProps {
  po: PurchaseOrder;
  onBack: () => void;
  highlightEmployeeId?: string;
  initialTab?: string;
  onNavigate?: (tab: string, params?: any) => void;
  returnTo?: string;
  returnParams?: any;
}

export const PODetailPage: React.FC<PODetailPageProps> = ({
  po,
  onBack,
  highlightEmployeeId,
  initialTab,
  onNavigate,
  returnTo,
  returnParams,
}) => {
  const { cancelInvoice, updateInvoiceStatus, unassignEmployeeFromPO, purchaseOrders } = useData();
  const { permissions, can } = useRole();
  const isOpenPO = po.status !== 'Renewed' && po.status !== 'Closed';

  const [activeTab, setActiveTab] = useState<
    'overview' | 'documents' | 'invoices' | 'milestones' | 'employees' | 'renewal' | 'comments' | 'audit'
  >((initialTab as any) || 'overview');
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  // Marking an invoice Paid asks for the date it was paid
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [paidDate, setPaidDate] = useState('');

  // Gaps between this PO and the one it renewed, or the one that renewed it (work without a PO).
  const predecessor = po.renewedFromPoNumber
    ? purchaseOrders.find((p) => p.poNumber === po.renewedFromPoNumber && p.projectId === po.projectId)
    : undefined;
  const successor = po.renewedToPoNumber
    ? purchaseOrders.find((p) => p.poNumber === po.renewedToPoNumber && p.projectId === po.projectId)
    : undefined;
  const gapBefore = predecessor ? renewalGapDays(predecessor, po) : 0;
  const gapAfter = successor ? renewalGapDays(po, successor) : 0;
  const [highlightedEmpId, setHighlightedEmpId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as any);
    }
    if (highlightEmployeeId) {
      setActiveTab('employees');
      setHighlightedEmpId(highlightEmployeeId);

      const scrollTimer = setTimeout(() => {
        const el = document.getElementById(`po-emp-row-${highlightEmployeeId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const clearTimer = setTimeout(() => {
        setHighlightedEmpId(null);
      }, 2500);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [highlightEmployeeId, initialTab]);

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedEmployeeToEdit, setSelectedEmployeeToEdit] = useState<string | undefined>(undefined);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [selectedEmployeeToReplace, setSelectedEmployeeToReplace] = useState<any | null>(null);
  const [amendModalOpen, setAmendModalOpen] = useState(false);
  const [sowMergeModalOpen, setSowMergeModalOpen] = useState(false);
  const [selectedTerminateAssignment, setSelectedTerminateAssignment] = useState<any | null>(null);
  const [untagConfirmEmp, setUntagConfirmEmp] = useState<{ employeeId: string; employeeName: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    type: 'sow' | 'po' | 'quotation' | 'invoice' | 'generic';
    invoice?: Invoice;
    fileData?: Blob | Uint8Array;
  } | null>(null);
  const [docSource, setDocSource] = useState<{
    url?: string;
    file?: Blob;
    isRealFile: boolean;
  } | null>(null);

  useEffect(() => {
    if (!previewDoc) {
      setDocSource(null);
      return;
    }

    const source = getDocumentSource({
      filename: previewDoc.name,
      documentType: previewDoc.type,
      po,
      sowNumber: po.sowNumber,
      quotationNumber: po.quotationNumber,
      invoiceNumber: previewDoc.invoice?.invoiceNumber,
      invoice: previewDoc.invoice,
      file: previewDoc.fileData || previewDoc.invoice?.fileData,
    });

    setDocSource(source);
  }, [previewDoc, po]);

  const daysLeft = getDaysRemainingCalendar(po.expiryDate);
  const counts = getPOCounts(po);

  const validatedReturn = getValidatedReturnTab(returnTo, 'pos');
  let returnLabel = '← Back to PO Tracker';
  if (validatedReturn === 'notifications') {
    returnLabel = '← Back to Notifications';
  } else if (validatedReturn === 'dashboard') {
    returnLabel = '← Back to Dashboard';
  } else if (validatedReturn === 'projects') {
    returnLabel = '← Back to Projects';
  } else if (validatedReturn === 'invoices') {
    returnLabel = '← Back to Invoices';
  } else if (validatedReturn === 'proformas') {
    returnLabel = '← Back to Proforma Invoices';
  }

  const handleReturnClick = () => {
    if (onNavigate) {
      if (validatedReturn === 'pos') {
        onNavigate('pos', {
          statusFilter: returnParams?.statusFilter,
          projectFilter: returnParams?.projectFilter,
          expiryFilter: returnParams?.expiryFilter,
          search: returnParams?.search || returnParams?.q,
        });
      } else {
        onNavigate(validatedReturn, returnParams);
      }
    } else {
      onBack();
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={handleReturnClick}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              {returnLabel}
            </button>
            <span className="text-slate-300">|</span>
            <Badge status={po.status} />
            {daysLeft !== null && daysLeft <= 60 && daysLeft >= 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                {getExpiryCountdownLabel(po.expiryDate)}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-mono">{po.poNumber}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
            <span>Project: <strong className="text-slate-800 font-semibold">{po.projectName}</strong></span>
            <span>·</span>
            <span>PO Requester: <strong className="text-slate-800 font-semibold">{po.poRequester}</strong></span>
            <span>·</span>
            <div className="flex items-center gap-1">
              <span className="font-medium text-slate-600">Assigned Workforce:</span>
              {po.assignedEmployees && po.assignedEmployees.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {po.assignedEmployees.map((e) => (
                    <span key={e.employeeId} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold text-[10px]">
                      {e.employeeName} ({e.employeeId})
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400 italic">None tagged</span>
              )}
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigate && (
            <Button
              variant="outline"
              size="sm"
              icon={<FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />}
              onClick={() => onNavigate('proformas', { poId: po.id })}
            >
              Open Proforma Invoices
            </Button>
          )}

          {can('invoice.create') && isOpenPO && (
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setInvoiceModalOpen(true)}
            >
              Add Invoice
            </Button>
          )}

          {can('assignment.edit') && isOpenPO && (
            <Button
              variant="outline"
              size="sm"
              icon={<Users className="w-3.5 h-3.5" />}
              onClick={() => setAssignModalOpen(true)}
            >
              Tag Employee
            </Button>
          )}

          {can('po.edit') && isOpenPO && (
            <Button
              variant="outline"
              size="sm"
              icon={<DollarSign className="w-3.5 h-3.5" />}
              onClick={() => setAmendModalOpen(true)}
            >
              Amend PO Value
            </Button>
          )}

          {can('po.close') && isOpenPO && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600"
              icon={<Ban className="w-3.5 h-3.5" />}
              onClick={() => setCloseModalOpen(true)}
            >
              Close PO
            </Button>
          )}

          {can('po.renew') && isOpenPO && (
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => setRenewalModalOpen(true)}
            >
              Renew PO
            </Button>
          )}
        </div>
      </div>

      {po.status === 'Closed' && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs">
          <Lock className="w-4 h-4 shrink-0 mt-px" />
          <span>
            <strong>Closed{po.closedAt ? ` on ${formatDate(po.closedAt.split('T')[0])}` : ''}.</strong>{' '}
            {po.closedReason || 'No reason recorded.'} It is read-only now.
          </span>
        </div>
      )}

      {(gapBefore > 0 || gapAfter > 0) && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            {gapBefore > 0 && (
              <>
                <strong>{gapBefore}-day gap</strong> between {po.renewedFromPoNumber} ending and this PO starting.{' '}
              </>
            )}
            {gapAfter > 0 && (
              <>
                <strong>{gapAfter}-day gap</strong> between this PO ending and {po.renewedToPoNumber} starting.{' '}
              </>
            )}
            Work done in that period is not covered by a PO.
          </span>
        </div>
      )}

      {/* STATS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
            PO Value (Excl. GST)
          </span>
          <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
            {formatINR(po.amountExclGst)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Incl. GST ({po.gstRate}%): {formatINR(po.amountInclGst)}
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
            Invoiced (Excl. GST)
          </span>
          <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
            {formatINR(po.invoicedExclGst)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            {counts.taxInvoiceCount} Invoices Issued
          </span>
        </Card>

        <Card className="p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
            Credit Notes
          </span>
          <span className="text-lg font-bold font-mono text-emerald-700 tabular-nums">
            {formatINR(po.creditNotesExclGst)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            {counts.creditNoteCount} Credit Note(s) (Restores Balance)
          </span>
        </Card>

        <Card className="p-4 bg-indigo-50/50 border-indigo-200">
          <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wider block mb-1">
            Remaining PO Balance
          </span>
          <span className="text-xl font-black font-mono text-indigo-900 tabular-nums">
            {formatINR(po.remainingBalanceExclGst)}
          </span>
          <span className="text-[11px] text-indigo-700 font-medium block mt-1">
            {((po.remainingBalanceExclGst / po.amountExclGst) * 100).toFixed(1)}% Available
          </span>
        </Card>
      </div>

      {/* TABS HEADER */}
      <div className="border-b border-slate-200 bg-white rounded-xl px-4 shadow-2xs">
        <nav className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: Building2 },
            { id: 'documents', label: 'Documents', icon: FileSpreadsheet },
            {
              id: 'invoices',
              label: `Invoices (${po.invoices.length})`,
              icon: DollarSign,
            },
            {
              id: 'milestones',
              label: `Milestones (${(po.billingMilestones || []).length})`,
              icon: Flag,
            },
            {
              id: 'employees',
              label: `Employees (${po.assignedEmployees.length})`,
              icon: Users,
            },
            { id: 'renewal', label: 'Renewals', icon: RefreshCw },
            {
              id: 'comments',
              label: `Comments (${(po.comments || []).length})`,
              icon: MessageSquare,
            },
            {
              id: 'audit',
              label: `Audit log (${po.activityLogs.length})`,
              icon: Clock,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB CONTENT AREAS */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && <POForecastPanel po={po} />}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
              Purchase Order Metadata & Rules
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">PO Number</span>
                <span className="font-semibold text-slate-900 font-mono">{po.poNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Project Name</span>
                <span className="font-semibold text-slate-900">{po.projectName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">SOW Reference</span>
                <span className="font-medium text-slate-800 font-mono">
                  {po.sowNumber || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Quotation Reference</span>
                <span className="font-medium text-slate-800 font-mono">
                  {po.quotationNumber || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Start Date</span>
                <span className="font-medium text-slate-800">{formatDate(po.startDate)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Expiry Date</span>
                <span className="font-medium text-slate-800">{formatDate(po.expiryDate)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">PO Requester</span>
                <span className="font-semibold text-slate-800">{po.poRequester}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Assigned Workforce</span>
                {po.assignedEmployees && po.assignedEmployees.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {po.assignedEmployees.map((e) => (
                      <span key={e.employeeId} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-semibold">
                        {e.employeeName} ({e.employeeId})
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="font-medium text-slate-400 italic">No employees tagged</span>
                )}
              </div>
              <div>
                <span className="text-slate-500 block">GST</span>
                <span className="font-medium text-slate-800">
                  {po.gstRate}%{' '}
                  {po.gstType === 'IGST'
                    ? 'IGST'
                    : po.gstType === 'CGST_SGST'
                    ? `(CGST ${po.gstRate / 2}% + SGST ${po.gstRate / 2}%)`
                    : ''}
                </span>
                {po.billingState && <span className="block text-[11px] text-slate-500">Place of supply: {po.billingState}</span>}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Notes & Conditions
              </span>
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                {po.notes || 'No special conditions attached to this PO.'}
              </p>
            </div>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
              Addresses & Contacts
            </h3>

            <div>
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Billing Address
              </span>
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {po.billingAddress}
              </p>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Shipping Address
              </span>
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                {po.shippingAddress}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* 2. DOCUMENTS & SOW CHAIN TAB */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <Card className="space-y-6">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 mb-0.5">
                Document Chain: SOW → PO → Quotation
              </h3>
              <p className="text-xs text-slate-500">
                Centralized document records and merged SOW addendums linked to this purchase order.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* SOW RECORD */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      01. Statement of Work
                    </span>
                    <Badge status="Active" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 font-mono">
                    {po.sowNumber || 'SOW-HDFC-2025-001'}
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {po.mergedSowDocumentName ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        Master Merged PDF Active ({po.sowDocuments?.length || 2} files combined)
                      </span>
                    ) : (
                      'Primary statement of work governing project scope & deliverables.'
                    )}
                  </p>
                  {po.mergedSowDocumentName && (
                    <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-[10px] text-emerald-900 font-mono truncate">
                      <strong>Active Master:</strong> {po.mergedSowDocumentName}
                    </div>
                  )}
                </div>

                <div className="pt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() =>
                      setPreviewDoc({
                        name: po.mergedSowDocumentName || 'Statement_of_Work_Document.pdf',
                        type: 'sow',
                        fileData: po.mergedSowFileData,
                      })
                    }
                  >
                    View SOW
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download className="w-3.5 h-3.5" />}
                    onClick={() =>
                      downloadDocument({
                        filename: po.mergedSowDocumentName || 'Statement_of_Work_Document.pdf',
                        documentType: 'sow',
                        po,
                        sowNumber: po.sowNumber,
                        file: po.mergedSowFileData,
                      })
                    }
                  >
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<FileUp className="w-3.5 h-3.5" />}
                    onClick={() => setSowMergeModalOpen(true)}
                  >
                    Merge SOW
                  </Button>
                </div>
              </div>

              {/* PO RECORD */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                      02. Purchase Order
                    </span>
                    <Badge status={po.status} />
                  </div>
                  <h4 className="text-xs font-bold text-indigo-900 font-mono">{po.poNumber}</h4>
                  <p className="text-[11px] text-indigo-800 mt-1">
                    Official signed PO document uploaded by PO Admin.
                  </p>
                </div>

                <div className="pt-3 flex items-center gap-2 border-t border-indigo-100 mt-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() =>
                      setPreviewDoc({
                        name: po.poDocumentName || `${po.poNumber.replace(/\//g, '_')}.pdf`,
                        type: 'po',
                      })
                    }
                  >
                    View PO
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download className="w-3.5 h-3.5" />}
                    onClick={() =>
                      downloadDocument({
                        filename: po.poDocumentName || `${po.poNumber.replace(/\//g, '_')}.pdf`,
                        documentType: 'po',
                        po,
                      })
                    }
                  >
                    Download
                  </Button>
                </div>
              </div>

              {/* QUOTATION RECORD */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      03. Quotation
                    </span>
                    <Badge status="Approved" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 font-mono">
                    {po.quotationNumber || 'QUOT-PS-2025-089'}
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Commercial quotation approved by client Finance.
                  </p>
                </div>

                <div className="pt-3 flex items-center gap-2 border-t border-slate-200/80 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() =>
                      setPreviewDoc({ name: 'Commercial_Quotation_Signed.pdf', type: 'quotation' })
                    }
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download className="w-3.5 h-3.5" />}
                    onClick={() =>
                      downloadDocument({
                        filename: 'Commercial_Quotation_Signed.pdf',
                        documentType: 'quotation',
                        po,
                        quotationNumber: po.quotationNumber,
                      })
                    }
                  >
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* SOW DOCUMENT HISTORY & MERGE AUDIT TRAIL */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>SOW Document Vault & Merged History</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Detailed list of original SOW, uploaded addendums, and combined master PDF files.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<FileUp className="w-3.5 h-3.5" />}
                onClick={() => setSowMergeModalOpen(true)}
              >
                Upload Additional SOW
              </Button>
            </div>

            {(!po.sowDocuments || po.sowDocuments.length === 0) ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-bold text-slate-800">Primary Statement of Work (SOW) Attached</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Filename: <strong className="font-mono text-slate-700">{po.sowNumber || 'SOW-HDFC-2025-001'}.pdf</strong>
                </p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<FileUp className="w-3.5 h-3.5" />}
                    onClick={() => setSowMergeModalOpen(true)}
                  >
                    Upload Additional SOW to Merge
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Doc Type</th>
                      <th className="p-3">Filename</th>
                      <th className="p-3">Uploaded Date</th>
                      <th className="p-3">Uploaded By</th>
                      <th className="p-3">File Size</th>
                      <th className="p-3">Notes / Description</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {po.sowDocuments.map((docItem) => (
                      <tr key={docItem.id} className={docItem.documentType === 'Merged' ? 'bg-emerald-50/40 hover:bg-emerald-50/70 font-medium' : 'hover:bg-slate-50'}>
                        <td className="p-3">
                          {docItem.documentType === 'Original' ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded">
                              Original SOW
                            </span>
                          ) : docItem.documentType === 'Additional' ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                              Addendum / Additional
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Master Merged PDF
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-900">{docItem.filename}</td>
                        <td className="p-3 text-slate-600">{formatDate(docItem.uploadedAt)}</td>
                        <td className="p-3 text-slate-700 font-medium">{docItem.uploadedBy}</td>
                        <td className="p-3 text-slate-500 font-mono">
                          {docItem.fileSize ? `${(docItem.fileSize / 1024).toFixed(1)} KB` : '—'}
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate">{docItem.notes || '—'}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Eye className="w-3.5 h-3.5" />}
                              onClick={() =>
                                setPreviewDoc({
                                  name: docItem.filename,
                                  type: 'sow',
                                  fileData: docItem.fileData,
                                })
                              }
                            >
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Download className="w-3.5 h-3.5" />}
                              onClick={() =>
                                downloadDocument({
                                  filename: docItem.filename,
                                  documentType: 'sow',
                                  po,
                                  file: docItem.fileData,
                                })
                              }
                            >
                              Download
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 3. INVOICES & BALANCE TAB */}
      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* BALANCE BREAKDOWN STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Total PO Commitment (Excl. GST)
              </span>
              <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                {formatINR(po.amountExclGst)}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                Incl. GST ({po.gstRate}%): {formatINR(po.amountInclGst)}
              </span>
            </Card>

            <Card className="p-4 border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Invoiced (Excl. GST)
              </span>
              <span className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                {formatINR(po.invoicedExclGst)}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                {counts.taxInvoiceCount} Invoices Issued
              </span>
            </Card>

            <Card className="p-4 border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Credit Notes (Excl. GST)
              </span>
              <span className="text-lg font-bold font-mono text-emerald-700 tabular-nums">
                + {formatINR(po.creditNotesExclGst)}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                {counts.creditNoteCount} Credit Notes (Restores Balance)
              </span>
            </Card>

            <Card className="p-4 bg-indigo-50/60 border-indigo-200">
              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block mb-1">
                Remaining PO Balance (Excl. GST)
              </span>
              <span className="text-xl font-black font-mono text-indigo-900 tabular-nums">
                {formatINR(po.remainingBalanceExclGst)}
              </span>
              <div className="w-full bg-indigo-200/80 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((po.amountExclGst - po.remainingBalanceExclGst) / po.amountExclGst) * 100
                      )
                    )}%`,
                  }}
                ></div>
              </div>
              <span className="text-[10px] text-indigo-700 font-semibold block mt-1">
                {(((po.amountExclGst - po.remainingBalanceExclGst) / po.amountExclGst) * 100).toFixed(1)}% Billed · {((po.remainingBalanceExclGst / po.amountExclGst) * 100).toFixed(1)}% Available
              </span>
            </Card>
          </div>

          {/* INVOICES & CREDIT NOTES DATA TABLE */}
          <Card className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Invoices & Credit Notes Master Ledger</h3>
                <p className="text-xs text-slate-500">
                  Calculates remaining balance in real-time. Cancelled invoices do not reduce balance.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onNavigate && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />}
                    onClick={() => onNavigate('proformas', { poId: po.id })}
                  >
                    Open Proforma Invoices
                  </Button>
                )}
                {permissions.canManageInvoices && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => setInvoiceModalOpen(true)}
                  >
                    Add Invoice
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Invoice / Credit Note No.</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Assigned Employee(s)</th>
                    <th className="p-3">Dates (Issue / Due)</th>
                    <th className="p-3">Billing Period</th>
                    <th className="p-3 text-right">Excl. GST</th>
                    <th className="p-3 text-right font-mono">GST ({po.gstRate}%)</th>
                    <th className="p-3 text-right font-bold">Total Incl. GST</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Document & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {po.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">
                        No invoices or credit notes issued yet for this PO.
                      </td>
                    </tr>
                  ) : (
                    po.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-900 block">{inv.invoiceNumber}</span>
                          {inv.notes && (
                            <span className="text-[11px] text-slate-500 block max-w-xs truncate">
                              {inv.notes}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {inv.isCreditNote ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Credit Note
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Tax Invoice
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {inv.employeeNames && inv.employeeNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {inv.employeeNames.map((name) => (
                                <span key={name} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold text-[10px]">
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : inv.employeeName ? (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold text-[10px]">
                              {inv.employeeName}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          <span className="block font-medium">{formatDate(inv.invoiceDate)}</span>
                          {inv.dueDate && (
                            <span className="text-[10px] text-slate-400 block">Due: {formatDate(inv.dueDate)}</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {formatDate(inv.billingPeriodStart)} – {formatDate(inv.billingPeriodEnd)}
                        </td>
                        <td className="p-3 text-right font-mono font-medium text-slate-900 tabular-nums">
                          {formatINR(inv.amountExclGst)}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500 tabular-nums">
                          {formatINR(inv.gstAmount || inv.amountExclGst * (inv.gstRate / 100))}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-900 tabular-nums">
                          {formatINR(inv.totalAmountInclGst || inv.amountExclGst * (1 + inv.gstRate / 100))}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <Badge status={inv.status} />
                            {inv.status === 'Paid' && inv.paidAt && (
                              <span className="text-[11px] text-slate-500 whitespace-nowrap">Paid {formatDate(inv.paidAt)}</span>
                            )}
                            {permissions.canManageInvoices && inv.status !== 'Cancelled' && (
                              <select
                                value={inv.status}
                                onChange={(e) => {
                                  const next = e.target.value as Invoice['status'];
                                  if (next === 'Paid') {
                                    setPaidDate(new Date().toISOString().split('T')[0]);
                                    setPayingInvoice(inv);
                                  } else {
                                    updateInvoiceStatus(po.id, inv.id, next);
                                  }
                                }}
                                className="text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-700 font-medium cursor-pointer"
                              >
                                <option value="Issued">Issued</option>
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Eye className="w-3.5 h-3.5" />}
                              onClick={() =>
                                setPreviewDoc({
                                  name: inv.documentName || `${inv.invoiceNumber.replace(/\//g, '_')}.pdf`,
                                  type: 'invoice',
                                  invoice: inv,
                                })
                              }
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Download className="w-3.5 h-3.5" />}
                              onClick={() =>
                                downloadDocument({
                                  filename: inv.documentName || `${inv.invoiceNumber.replace(/\//g, '_')}.pdf`,
                                  documentType: 'invoice',
                                  po,
                                  invoice: inv,
                                  invoiceNumber: inv.invoiceNumber,
                                  file: inv.fileData,
                                })
                              }
                            >
                              PDF
                            </Button>
                            {inv.status !== 'Cancelled' && permissions.canManageInvoices && (
                              <button
                                onClick={() => cancelInvoice(po.id, inv.id)}
                                className="text-red-600 hover:text-red-800 text-[11px] font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                title="Cancel invoice and restore balance"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* 4. ASSIGNED EMPLOYEES TAB */}
      {activeTab === 'employees' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Assigned Workforce to PO</h3>
              <p className="text-xs text-slate-500">
                Employees tagged to this PO for delivery, timesheet allocation & billing.
              </p>
            </div>
            {permissions.canAssignEmployeesToPO && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setSelectedEmployeeToEdit(undefined);
                  setAssignModalOpen(true);
                }}
              >
                Tag Employee
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Employee ID</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3 text-right">Billing Rate / Mo</th>
                  <th className="p-3">Assignment Period</th>
                  <th className="p-3">Billable Method</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {po.assignedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400">
                      No employees tagged to this PO yet.
                    </td>
                  </tr>
                ) : (
                  po.assignedEmployees.map((emp) => {
                    const today = new Date().toISOString().split('T')[0];
                    const isExpired = Boolean(emp.assignedTo && today > emp.assignedTo);
                    const isInactive = emp.status === 'Inactive' || emp.status === 'Unassigned' || isExpired;

                    const methodLabel =
                      emp.billableDaysMethod === 'working_days'
                        ? 'Working Days'
                        : emp.billableDaysMethod === 'manual'
                        ? `Manual (${emp.manualBillableDays || 0}d)`
                        : 'Calendar Days';

                    return (
                      <tr
                        key={emp.employeeId}
                        id={`po-emp-row-${emp.employeeId}`}
                        className={`transition-all duration-500 ${
                          highlightedEmpId === emp.employeeId
                            ? 'bg-purple-100/90 ring-2 ring-purple-500 border-purple-400 font-medium animate-pulse shadow-sm'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 font-semibold text-slate-900">{emp.employeeName}</td>
                        <td className="p-3 font-mono text-slate-600">{emp.employeeId}</td>
                        <td className="p-3 text-slate-600">{emp.designation}</td>
                        <td className="p-3 text-right font-mono font-medium text-slate-900 tabular-nums">
                          {formatINR(emp.billingRatePerMonth)}
                        </td>
                        <td className="p-3 text-slate-600">
                          {formatDate(emp.assignedFrom)} – {formatDate(emp.assignedTo)}
                        </td>
                        <td className="p-3 text-slate-600">
                          <span className="text-[10px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {methodLabel}
                          </span>
                        </td>
                        <td className="p-3">
                          {isInactive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Inactive (Expired)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                if (onNavigate) {
                                  onNavigate('proforma-invoices', {
                                    poId: po.id,
                                    highlightEmployeeId: emp.employeeId,
                                  });
                                }
                              }}
                              className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold cursor-pointer flex items-center gap-1 bg-indigo-50/80 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                              title="View Proformas for this employee"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                              <span>View Proformas</span>
                            </button>

                            {permissions.canAssignEmployeesToPO && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedEmployeeToEdit(emp.employeeId);
                                    setAssignModalOpen(true);
                                  }}
                                  className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedEmployeeToReplace(emp);
                                    setReplaceModalOpen(true);
                                  }}
                                  className="text-amber-600 hover:text-amber-800 text-xs font-semibold cursor-pointer"
                                  title="Replace employee on this PO"
                                >
                                  Replace
                                </button>
                                <button
                                  onClick={() => setUntagConfirmEmp({ employeeId: emp.employeeId, employeeName: emp.employeeName })}
                                  className="text-red-600 hover:text-red-800 text-xs font-medium cursor-pointer"
                                >
                                  Untag
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'milestones' && <POMilestonesPanel po={po} />}

      {activeTab === 'comments' && <POCommentsPanel po={po} />}

      {/* 5. RENEWAL & RELATED POS TAB */}
      {activeTab === 'renewal' && (
        <Card className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">PO Successor & Predecessor Chain</h3>
            <p className="text-xs text-slate-500">
              Preserves audit continuity across PO renewals without overwriting exhausted original records.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            {po.renewedFromPoNumber && (
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Predecessor PO:</span>
                <span className="font-mono font-bold text-slate-900">{po.renewedFromPoNumber}</span>
                <Badge status="Renewed" />
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-indigo-50/60 rounded-lg border border-indigo-200">
              <span className="text-xs text-indigo-700 font-semibold">Current PO Record:</span>
              <span className="font-mono font-bold text-indigo-900">{po.poNumber}</span>
              <Badge status={po.status} />
              <span className="text-xs text-indigo-800 ml-auto">
                Value: {formatINR(po.amountExclGst)}
              </span>
            </div>

            {po.renewedToPoNumber && (
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500 font-medium">Successor PO:</span>
                <span className="font-mono font-bold text-slate-900">{po.renewedToPoNumber}</span>
                <Badge status="Active" />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 6. AUDIT HISTORY TAB */}
      {activeTab === 'audit' && (
        <Card className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900">PO Activity & Audit Timeline</h3>

          <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 py-2">
            {po.activityLogs.map((log) => (
              <div key={log.id} className="relative pl-6">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-indigo-600 border-2 border-white"></div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{log.action}</span>
                    <span className="text-slate-400 font-mono text-[11px]">{log.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-700">{log.details}</p>
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                    By: {log.userName} ({log.userRole})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* MODALS */}
      {closeModalOpen && <POCloseModal po={po} onClose={() => setCloseModalOpen(false)} />}

      {payingInvoice && (
        <Modal isOpen onClose={() => setPayingInvoice(null)} title={`Mark ${payingInvoice.invoiceNumber} as paid`} maxWidth="sm">
          <div className="space-y-4 text-xs">
            <div>
              <label htmlFor="paid-date" className="block text-xs font-medium text-slate-700 mb-1">
                Date the payment was received
              </label>
              <input
                id="paid-date"
                type="date"
                value={paidDate}
                min={payingInvoice.invoiceDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
              <p className="text-[11px] text-slate-500 mt-1">Between the invoice date and today.</p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setPayingInvoice(null)}>
                Cancel
              </Button>
              <Button
                variant="success"
                disabled={!paidDate || paidDate < payingInvoice.invoiceDate}
                onClick={() => {
                  updateInvoiceStatus(po.id, payingInvoice.id, 'Paid', paidDate);
                  setPayingInvoice(null);
                }}
              >
                Mark paid
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {invoiceModalOpen && (
        <POInvoiceModal
          po={po}
          isOpen={invoiceModalOpen}
          onClose={() => setInvoiceModalOpen(false)}
        />
      )}

      {renewalModalOpen && (
        <PORenewalModal
          po={po}
          isOpen={renewalModalOpen}
          onClose={() => setRenewalModalOpen(false)}
        />
      )}

      {assignModalOpen && (
        <POEmployeeAssignModal
          po={po}
          isOpen={assignModalOpen}
          initialEmployeeId={selectedEmployeeToEdit}
          onClose={() => {
            setAssignModalOpen(false);
            setSelectedEmployeeToEdit(undefined);
          }}
        />
      )}

      {amendModalOpen && (
        <POAmendModal
          po={po}
          isOpen={amendModalOpen}
          onClose={() => setAmendModalOpen(false)}
        />
      )}

      {replaceModalOpen && selectedEmployeeToReplace && (
        <POEmployeeReplaceModal
          po={po}
          outgoingEmployee={selectedEmployeeToReplace}
          isOpen={replaceModalOpen}
          onClose={() => {
            setReplaceModalOpen(false);
            setSelectedEmployeeToReplace(null);
          }}
        />
      )}

      {selectedTerminateAssignment && (
        <TerminateAssignmentModal
          assignment={selectedTerminateAssignment}
          isOpen={!!selectedTerminateAssignment}
          onClose={() => setSelectedTerminateAssignment(null)}
        />
      )}

      {sowMergeModalOpen && (
        <SOWUploadMergeModal
          po={po}
          isOpen={sowMergeModalOpen}
          onClose={() => setSowMergeModalOpen(false)}
        />
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <Modal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={`Document Preview — ${previewDoc.name}`}
          maxWidth="4xl"
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong className="text-slate-900">{previewDoc.name}</strong>
                  {docSource && !docSource.isRealFile && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded font-medium border border-amber-200">
                      Generated Vault Statement
                    </span>
                  )}
                </span>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={() =>
                  downloadDocument({
                    filename: previewDoc.name,
                    documentType: previewDoc.type,
                    po,
                    sowNumber: po.sowNumber,
                    quotationNumber: po.quotationNumber,
                  })
                }
              >
                Download Document
              </Button>
            </div>

            <div className="w-full h-[620px] rounded-xl overflow-hidden shadow-inner">
              {docSource ? (
                <PdfViewer
                  pdfUrl={docSource.url}
                  fileData={docSource.file}
                  title={previewDoc.name}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  Loading document viewer...
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* UNTAG EMPLOYEE CONFIRMATION MODAL */}
      {untagConfirmEmp && (
        <Modal
          isOpen={!!untagConfirmEmp}
          onClose={() => setUntagConfirmEmp(null)}
          title="Untag Employee?"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to remove <strong className="text-slate-900">{untagConfirmEmp.employeeName}</strong> from PO <strong className="text-slate-900">{po.poNumber}</strong>? This will remove their current assignment to this purchase order.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setUntagConfirmEmp(null)}>
                No, Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  unassignEmployeeFromPO(po.id, untagConfirmEmp.employeeId);
                  setUntagConfirmEmp(null);
                }}
              >
                Yes, Untag Employee
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
