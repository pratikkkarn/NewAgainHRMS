import React from 'react';
import { Modal, Button, Badge } from '../../common/UIComponents';
import { PurchaseOrder, ProformaInvoice, ProformaLineItem, ProformaStatus } from '../../../types/domain';
import { formatINR, formatDate } from '../../../lib/utils';
import { downloadProformaPdf } from '../../../lib/documentDownloader';
import { Download, Share2, Edit3, ArrowLeft, CheckCircle2, AlertCircle, FileCheck, Printer } from 'lucide-react';
import { ProformaDocumentTemplate } from './ProformaDocumentTemplate';

export interface ProformaPreviewModalProps {
  proforma: Partial<ProformaInvoice> & {
    proformaNumber: string;
    employeeName: string;
    employeeId: string;
    designation: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    amountExclGst: number;
    gstRate: number;
    gstAmount: number;
    totalAmountInclGst: number;
    lineItems?: ProformaLineItem[];
    notes?: string;
    version?: number;
    status?: ProformaStatus | string;
    poId?: string;
    poNumber?: string;
    projectId?: string;
    projectName?: string;
    employeeEmail?: string;
    recipientEmail?: string;
    billingMonth?: string;
    billingYear?: number;
    billableDaysMethod?: any;
    billableDays?: number;
    versions?: any[];
  };
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (proforma: any) => void;
  onShare?: (proforma: any) => void;
  isUnsavedPreview?: boolean;
  onConfirmSave?: () => void;
}

export const ProformaPreviewModal: React.FC<ProformaPreviewModalProps> = ({
  proforma,
  po,
  isOpen,
  onClose,
  onEdit,
  onShare,
  isUnsavedPreview = false,
  onConfirmSave,
}) => {
  const handleDownload = async () => {
    // Generate valid ProformaInvoice object for downloader
    const fullProforma: ProformaInvoice = {
      id: (proforma as ProformaInvoice).id || `prof-preview-${Date.now()}`,
      proformaNumber: proforma.proformaNumber,
      poId: proforma.poId || po.id,
      poNumber: proforma.poNumber || po.poNumber,
      projectId: proforma.projectId || po.projectId,
      projectName: proforma.projectName || po.projectName,
      employeeId: proforma.employeeId,
      employeeName: proforma.employeeName,
      employeeEmail: proforma.employeeEmail,
      designation: proforma.designation,
      billingMonth: proforma.billingMonth || 'October',
      billingYear: proforma.billingYear || 2026,
      billingPeriodStart: proforma.billingPeriodStart,
      billingPeriodEnd: proforma.billingPeriodEnd,
      billableDaysMethod: proforma.billableDaysMethod || 'working_days',
      billableDays: proforma.billableDays,
      amountExclGst: proforma.amountExclGst,
      gstRate: proforma.gstRate,
      gstAmount: proforma.gstAmount,
      totalAmountInclGst: proforma.totalAmountInclGst,
      status: (proforma.status as ProformaStatus) || 'Draft',
      version: proforma.version || 1,
      versions: proforma.versions || [],
      lineItems: proforma.lineItems || [],
      notes: proforma.notes,
      recipientEmail: proforma.recipientEmail || proforma.employeeEmail,
      createdAt: (proforma as ProformaInvoice).createdAt || new Date().toISOString(),
      updatedAt: (proforma as ProformaInvoice).updatedAt || new Date().toISOString(),
    };

    await downloadProformaPdf(fullProforma);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isUnsavedPreview
          ? `Document Preview — ${proforma.proformaNumber} (Unsaved)`
          : `Proforma Invoice — ${proforma.proformaNumber}`
      }
      maxWidth="4xl"
    >
      <div className="space-y-4 text-xs font-sans">
        {/* BANNER FOR UNSAVED PREVIEWS */}
        {isUnsavedPreview ? (
          <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Live Form Preview:</strong> Formatted with your current entered values. Closing this preview will return you to the form with all entered values intact.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={handleDownload}
              >
                Download PDF
              </Button>
              {onConfirmSave && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<FileCheck className="w-3.5 h-3.5" />}
                  onClick={onConfirmSave}
                >
                  Confirm & Create Proforma
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ACTION BAR FOR SAVED PROFORMAS */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-100/80 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-indigo-700">
                {proforma.proformaNumber}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-300">
                Version {proforma.version || 1}
              </span>
              <Badge status={proforma.status || 'Draft'} />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer className="w-3.5 h-3.5" />}
                onClick={handlePrint}
              >
                Print
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={handleDownload}
              >
                Download PDF
              </Button>
              {onShare && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Share2 className="w-3.5 h-3.5" />}
                  onClick={() => onShare(proforma)}
                >
                  Share
                </Button>
              )}
            </div>
          </div>
        )}

        {/* HIGH-FIDELITY DOCUMENT CANVAS MATCHING EXCEL WORKBOOK */}
        <div className="max-h-[72vh] overflow-y-auto p-1 bg-slate-200/50 rounded-xl border border-slate-300 shadow-inner">
          <ProformaDocumentTemplate proforma={proforma} po={po} />
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            {isUnsavedPreview ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowLeft className="w-3.5 h-3.5" />}
                onClick={onClose}
              >
                Back to Edit Form
              </Button>
            ) : onEdit ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Edit3 className="w-3.5 h-3.5" />}
                onClick={() => onEdit(proforma)}
              >
                Edit / Revise
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {isUnsavedPreview ? 'Close Preview' : 'Close'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
