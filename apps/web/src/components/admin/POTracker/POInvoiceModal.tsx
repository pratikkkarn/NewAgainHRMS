import React, { useState } from 'react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { checkInvoiceOverride } from '../../../lib/poUtils';
import { UPLOAD_ACCEPT, UPLOAD_HINT, checkUpload } from '../../../lib/fileRules';
import { Modal, Input, Button } from '../../common/UIComponents';
import { PurchaseOrder } from '../../../types/domain';
import { formatINR } from '../../../lib/utils';
import { validateNewCreditNoteAmount } from '../../../lib/poUtils';
import { AlertCircle, Upload, CheckCircle2 } from 'lucide-react';

interface POInvoiceModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
}

export const POInvoiceModal: React.FC<POInvoiceModalProps> = ({ po, isOpen, onClose }) => {
  const { addInvoice } = useData();
  const { can } = useRole();
  const canOverride = can('invoice.override');
  const [overrideReason, setOverrideReason] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const defaultDueDateStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const currentYear = new Date().getFullYear();
  const finYear = `${currentYear.toString().slice(-2)}-${(currentYear + 1).toString().slice(-2)}`;

  // Form State
  const [isCreditNote, setIsCreditNote] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(
    `INV/PS/${finYear}/${Math.floor(100 + Math.random() * 900)}`
  );
  const [invoiceDate, setInvoiceDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(defaultDueDateStr);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentMonthName = monthNames[new Date().getMonth()] || 'October';

  const [billingMonth, setBillingMonth] = useState(currentMonthName);
  const [billingYear, setBillingYear] = useState(currentYear);
  const [billingPeriodStart, setBillingPeriodStart] = useState(
    `${todayStr.slice(0, 7)}-01`
  );
  const [billingPeriodEnd, setBillingPeriodEnd] = useState(todayStr);

  // Financial Defaults (Defaulting strictly to 0)
  const [amountExclGst, setAmountExclGst] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(po.gstRate || 18);
  const [notes, setNotes] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const [error, setError] = useState('');

  // Auto-calculated fields
  const safeAmountExclGst = isNaN(amountExclGst) || amountExclGst < 0 ? 0 : amountExclGst;
  const safeGstRate = isNaN(gstRate) || gstRate < 0 ? 0 : gstRate;
  const gstAmount = safeAmountExclGst * (safeGstRate / 100);
  const totalAmountInclGst = safeAmountExclGst + gstAmount;

  const handleToggleCreditNote = (checked: boolean) => {
    setIsCreditNote(checked);
    if (checked && invoiceNumber.startsWith('INV/')) {
      setInvoiceNumber(invoiceNumber.replace('INV/', 'CN/'));
    } else if (!checked && invoiceNumber.startsWith('CN/')) {
      setInvoiceNumber(invoiceNumber.replace('CN/', 'INV/'));
    }
  };

  // Only PDF, JPG or PNG up to 10 MB, checked by the file's content
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const problem = await checkUpload(file);
    if (problem) {
      input.value = '';
      setAttachedFile(null);
      setError(problem);
      return;
    }
    setError('');
    setAttachedFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!invoiceNumber.trim()) {
      setError('Invoice / Credit Note Number is required.');
      return;
    }

    // Uniqueness check within this PO
    const exists = po.invoices.some(
      (inv) => inv.invoiceNumber.toLowerCase() === invoiceNumber.trim().toLowerCase()
    );
    if (exists) {
      setError(`An invoice or credit note with number "${invoiceNumber}" already exists on this PO.`);
      return;
    }

    if (isNaN(amountExclGst) || amountExclGst <= 0) {
      setError('Invoice amount (Excl. GST) must be greater than ₹0.');
      return;
    }

    if (amountExclGst < 0) {
      setError('Negative invoice values are not permitted.');
      return;
    }

    if (dueDate && new Date(dueDate) < new Date(invoiceDate)) {
      setError('Due Date cannot be earlier than Invoice Issue Date.');
      return;
    }

    if (new Date(billingPeriodEnd) < new Date(billingPeriodStart)) {
      setError('Billing Period End Date cannot be earlier than Billing Period Start Date.');
      return;
    }

    // Validation for Credit Note vs Tax Invoice
    if (isCreditNote) {
      const creditValidation = validateNewCreditNoteAmount(po, safeAmountExclGst);
      if (!creditValidation.valid) {
        setError(creditValidation.error || 'Invalid credit note amount.');
        return;
      }
    } else {
      const overrideError = checkInvoiceOverride(po, safeAmountExclGst, canOverride, overrideReason);
      if (overrideError) {
        setError(overrideError);
        return;
      }
    }
    const exceedsBalance = !isCreditNote && safeAmountExclGst > po.remainingBalanceExclGst;

    const docName = attachedFile
      ? attachedFile.name
      : `${invoiceNumber.replace(/\//g, '_')}.pdf`;

    addInvoice(po.id, {
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      dueDate,
      billingMonth,
      billingYear,
      billingPeriod: `${billingMonth} ${billingYear}`,
      billingPeriodStart,
      billingPeriodEnd,
      amountExclGst: safeAmountExclGst,
      gstRate: safeGstRate,
      status: 'Issued',
      isCreditNote,
      notes: notes.trim(),
      overrideReason: exceedsBalance ? overrideReason.trim() : undefined,
      documentName: docName,
      fileData: attachedFile || undefined,
      employeeIds: [],
      employeeNames: [],
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isCreditNote ? `Record Credit Note — ${po.poNumber}` : `Issue New Invoice — ${po.poNumber}`}
      subtitle={`Project: ${po.projectName} · Available PO Balance: ${formatINR(po.remainingBalanceExclGst)} (Excl. GST)`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* SUMMARY HEADER BANNER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              PO Financial Context
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-semibold text-slate-800">{po.poNumber}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-600">Total PO: {formatINR(po.amountExclGst)}</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
              Remaining Balance (Excl. GST)
            </span>
            <span className="text-sm font-bold font-mono text-indigo-900 tabular-nums">
              {formatINR(po.remainingBalanceExclGst)}
            </span>
          </div>
        </div>

        {/* CREDIT NOTE TOGGLE */}
        <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={isCreditNote}
              onChange={(e) => handleToggleCreditNote(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span>This is a Credit Note (Restores PO Balance)</span>
          </label>
          <span className="text-[10px] text-indigo-700 font-medium">
            {isCreditNote ? 'CN (+) Restores Balance' : 'INV (−) Consumes Balance'}
          </span>
        </div>

        {/* INVOICE NUMBER & DATES */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label={isCreditNote ? 'Credit Note Number *' : 'Invoice Number *'}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. INV/PS/26-27/001"
            required
          />
          <Input
            label="Invoice Issue Date *"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
          />
          <Input
            label="Payment Due Date *"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>

        {/* BILLING MONTH & YEAR SELECTORS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Billing Month *</label>
            <select
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
            >
              {monthNames.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Billing Year *</label>
            <select
              value={billingYear}
              onChange={(e) => setBillingYear(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
            >
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* BILLING PERIOD DATES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Billing Period Start *"
            type="date"
            value={billingPeriodStart}
            onChange={(e) => setBillingPeriodStart(e.target.value)}
            required
          />
          <Input
            label="Billing Period End *"
            type="date"
            value={billingPeriodEnd}
            onChange={(e) => setBillingPeriodEnd(e.target.value)}
            required
          />
        </div>

        {/* FINANCIAL CALCULATOR SECTION */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            <span>Financial Calculations (INR)</span>
            <span className="text-[10px] font-normal text-slate-500">Auto-synchronized</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Amount Excl. GST (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={amountExclGst === 0 ? '' : amountExclGst}
                placeholder="0"
                onChange={(e) => setAmountExclGst(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">GST Rate (%)</label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value={18}>18% (Standard GST)</option>
                <option value={12}>12% (Reduced Rate)</option>
                <option value={5}>5% (Concessional)</option>
                <option value={0}>0% (Exempt / SEZ)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">GST Amount</label>
              <div className="px-3 py-2 bg-slate-100 font-mono font-semibold text-slate-700 border border-slate-300 rounded-lg">
                {formatINR(gstAmount)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg pt-3">
            <span className="text-xs font-bold text-slate-800">Total Amount (Incl. GST)</span>
            <span className="text-base font-bold font-mono text-indigo-900 tabular-nums">
              {formatINR(totalAmountInclGst)}
            </span>
          </div>
        </div>

        {/* ERROR DISPLAY */}
        {!isCreditNote && safeAmountExclGst > po.remainingBalanceExclGst && canOverride && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2 text-xs">
            <p className="text-amber-800 font-medium">
              This invoice is {formatINR(safeAmountExclGst - po.remainingBalanceExclGst)} over the remaining balance. You can
              still save it with a reason; it is recorded in the PO audit log.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={2}
              placeholder="Why is this allowed? e.g. Client confirmed a PO increase by email on 10 Oct."
              className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              aria-label="Override reason"
            />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span className="font-medium text-xs leading-relaxed">{error}</span>
          </div>
        )}

        {/* NOTES & DESCRIPTION */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Deliverable Description / Milestone Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Monthly cloud modernization deliverable & architectural milestone verification."
            rows={2}
            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        {/* DOCUMENT ATTACHMENT */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Attach invoice document <span className="font-normal text-slate-500">({UPLOAD_HINT})</span>
          </label>
          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Choose File</span>
              <input
                type="file"
                accept={UPLOAD_ACCEPT}
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <span className="text-xs text-slate-500 truncate">
              {attachedFile ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)
                </span>
              ) : (
                'No file chosen (An official PDF statement will be generated automatically)'
              )}
            </span>
          </div>
        </div>

        {/* SUBMIT BUTTONS */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {isCreditNote ? 'Save Credit Note' : 'Issue Invoice'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
