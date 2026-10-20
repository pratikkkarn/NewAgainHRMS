import React, { useState } from 'react';
import { Modal, Input, Button } from '../../common/UIComponents';
import { ProformaInvoice } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { formatINR, formatDate } from '../../../lib/utils';
import { downloadProformaPdf } from '../../../lib/documentDownloader';
import { Mail, Send, AlertCircle, FileText, CheckCircle2, ShieldCheck, Download } from 'lucide-react';

interface ProformaShareModalProps {
  proforma: ProformaInvoice;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ProformaShareModal: React.FC<ProformaShareModalProps> = ({
  proforma,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { shareProformaInvoice, updateEmployeeEmail } = useData();

  const [recipientEmail, setRecipientEmail] = useState(
    proforma.recipientEmail || proforma.employeeEmail || ''
  );
  const [notes, setNotes] = useState('');
  const [updateProfileEmail, setUpdateProfileEmail] = useState(false);
  const [error, setError] = useState('');

  const cleanFilename = `${proforma.proformaNumber.replace(/[\/\\]/g, '_')}_v${proforma.version}.pdf`;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipientEmail.trim() || !emailRegex.test(recipientEmail.trim())) {
      setError('Please provide a valid recipient email address.');
      return;
    }

    if (updateProfileEmail && recipientEmail.trim() !== proforma.employeeEmail) {
      updateEmployeeEmail(proforma.employeeId, recipientEmail.trim());
    }

    // Call context share method
    const result = shareProformaInvoice(proforma.id, recipientEmail.trim(), notes.trim());

    if (!result.success) {
      setError(result.message);
      return;
    }

    // Generate & download the official PDF attachment for the user
    await downloadProformaPdf(proforma);

    // Open mail client draft if mailto URL exists
    if (result.mailtoUrl) {
      window.open(result.mailtoUrl, '_blank');
    }

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Share Proforma Invoice — ${proforma.proformaNumber}`}
      maxWidth="xl"
    >
      <form onSubmit={handleShare} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* PROFORMA SUMMARY CARD */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Document Summary</span>
            <span className="font-mono text-xs font-bold text-indigo-700">{proforma.proformaNumber} (v{proforma.version})</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 block">Assigned Resource:</span>
              <strong className="text-slate-900">{proforma.employeeName}</strong> ({proforma.employeeId})
            </div>
            <div>
              <span className="text-slate-500 block">Total Payable:</span>
              <strong className="text-indigo-900 font-mono">{formatINR(proforma.totalAmountInclGst)}</strong> (Incl. GST)
            </div>
            <div>
              <span className="text-slate-500 block">Billing Period:</span>
              <span className="text-slate-800">{formatDate(proforma.billingPeriodStart)} to {formatDate(proforma.billingPeriodEnd)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Purchase Order:</span>
              <span className="text-slate-800 font-mono">{proforma.poNumber}</span>
            </div>
          </div>
        </div>

        {/* RECIPIENT EMAIL INPUT */}
        <div className="space-y-2">
          <Input
            label="Recipient Email Address"
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="e.g. employee@primestarconsulting.com or finance@client.com"
            required
            helperText="Default pre-filled from employee profile; reviewable and correctable before dispatch."
          />

          <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={updateProfileEmail}
              onChange={(e) => setUpdateProfileEmail(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Also save this email to {proforma.employeeName}'s profile record</span>
          </label>
        </div>

        {/* ATTACHMENT PREVIEW */}
        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-indigo-600" />
            <div>
              <div className="font-mono font-bold text-slate-900 text-[11px]">{cleanFilename}</div>
              <div className="text-[10px] text-slate-500">Official digitally stamped PDF document</div>
            </div>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold border border-slate-200">
            Attached
          </span>
        </div>

        {/* COVER MESSAGE / NOTES */}
        <div>
          <label className="block text-slate-700 font-bold mb-1">
            Cover Notes / Message (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any specific milestone verification instructions or billing review comments..."
            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* DISPATCH TRANSPARENCY BANNER */}
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5 text-[11px] text-amber-900">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Delivery Transparency Mode: Local Email Draft & Verification Fallback</span>
          </div>
          <p className="text-amber-800">
            No outbound SMTP/SES server credentials are configured in this environment. To prevent false delivery claims, clicking "Dispatch & Share" will:
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
            <li>Record an immutable dispatch audit log in PO history with timestamp and user.</li>
            <li>Mark this proforma status as <strong>Sent</strong>.</li>
            <li>Generate and download the official PDF for your archive.</li>
            <li>Generate a pre-filled email draft in your local mail client with verified details.</li>
          </ul>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            icon={<Send className="w-3.5 h-3.5" />}
          >
            Dispatch & Share
          </Button>
        </div>
      </form>
    </Modal>
  );
};
