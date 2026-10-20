import React, { useState } from 'react';
import { PurchaseOrder } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { Modal, Button } from '../../common/UIComponents';
import { validatePOAmendment } from '../../../lib/poUtils';
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle, FileText } from 'lucide-react';

interface POAmendModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
}

export const POAmendModal: React.FC<POAmendModalProps> = ({ po, isOpen, onClose }) => {
  const { submitPOAmendment } = useData();
  const { permissions } = useRole();

  const currentVal = po.amountExclGst;
  const originalVal = po.originalAmountExclGst !== undefined ? po.originalAmountExclGst : currentVal;
  const invoicedVal = po.invoicedExclGst;

  const [proposedValueStr, setProposedValueStr] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState<string>('');
  const [documentRef, setDocumentRef] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const proposedVal = proposedValueStr !== '' ? parseFloat(proposedValueStr) : currentVal;
  const diff = proposedVal - currentVal;
  const changeType: 'REDUCTION' | 'INCREASE' = diff < 0 ? 'REDUCTION' : 'INCREASE';
  const absDiff = Math.abs(diff);

  const validation = validatePOAmendment(po, proposedVal);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!reason.trim()) {
      setFormError('Please provide a reason for amending the PO contractual value.');
      return;
    }

    if (isNaN(proposedVal) || proposedVal <= 0) {
      setFormError('Please enter a valid positive revised PO contractual value.');
      return;
    }

    if (!validation.valid) {
      setFormError(validation.error || 'Validation failed.');
      return;
    }

    try {
      submitPOAmendment(po.id, {
        originalValueExclGst: currentVal,
        revisedValueExclGst: proposedVal,
        changeType,
        changeAmountExclGst: absDiff,
        effectiveDate,
        reason: reason.trim(),
        documentRef: documentRef.trim() || undefined,
        requestedBy: permissions.canManagePOs ? 'Finance Admin / PM' : 'Authorized Requester',
        status: permissions.canManagePOs ? 'APPROVED' : 'PENDING',
      });
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit PO value amendment.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Amend PO Contractual Value — ${po.poNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-5 text-sm">
        {/* FINANCIAL SUMMARY CARD */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Original PO Value</span>
            <strong className="text-slate-900 font-mono text-sm">
              ₹{originalVal.toLocaleString('en-IN')}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Current Approved Value</span>
            <strong className="text-indigo-700 font-mono text-sm">
              ₹{currentVal.toLocaleString('en-IN')}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Issued Invoices Total</span>
            <strong className="text-emerald-700 font-mono text-sm">
              ₹{invoicedVal.toLocaleString('en-IN')}
            </strong>
          </div>
        </div>

        {/* INPUT: PROPOSED REVISED VALUE */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Proposed Revised PO Contractual Value (Excl. GST) *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-400 font-medium">₹</span>
            <input
              type="number"
              value={proposedValueStr}
              onChange={(e) => {
                setProposedValueStr(e.target.value);
                setFormError(null);
              }}
              placeholder={currentVal.toString()}
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900 text-sm"
              required
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Example: Enter 1000000 to amend value from ₹15,00,000 to ₹10,00,000.
          </p>
        </div>

        {/* LIVE AMENDMENT PREVIEW */}
        {proposedValueStr !== '' && !isNaN(proposedVal) && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-start gap-3 ${
              changeType === 'REDUCTION'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {changeType === 'REDUCTION' ? (
              <TrendingDown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <TrendingUp className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-semibold">
                {changeType === 'REDUCTION' ? 'Contract Value Reduction' : 'Contract Value Expansion'} of ₹
                {absDiff.toLocaleString('en-IN')} (Excl. GST)
              </div>
              <div>
                Revised Incl. GST ({po.gstRate}%):{' '}
                <strong className="font-mono">
                  ₹{Math.round(proposedVal * (1 + po.gstRate / 100)).toLocaleString('en-IN')}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* VALIDATION ERROR / WARNING */}
        {(!validation.valid || formError) && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">Financial Validation Error</strong>
              <span>{formError || validation.error}</span>
            </div>
          </div>
        )}

        {/* EFFECTIVE DATE */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Effective Date of Amendment *
          </label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-xs"
            required
          />
        </div>

        {/* REASON */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Amendment *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="E.g., Scope de-scoping approved via Change Request #CR-8892..."
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-xs"
            required
          />
        </div>

        {/* DOCUMENT REF */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Supporting Document / Amendment Order No. (Optional)
          </label>
          <div className="relative">
            <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={documentRef}
              onChange={(e) => setDocumentRef(e.target.value)}
              placeholder="E.g., PO_Amendment_Letter_CR02.pdf"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-xs"
            />
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!validation.valid || proposedValueStr === ''}
          >
            Apply Approved Amendment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
