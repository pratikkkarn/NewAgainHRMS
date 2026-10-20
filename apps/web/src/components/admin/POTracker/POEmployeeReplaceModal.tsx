import React, { useState, useEffect } from 'react';
import { useData } from '../../../context/DataContext';
import { Modal, Input, Button } from '../../common/UIComponents';
import { PurchaseOrder, AssignedEmployee, BillableDaysMethod } from '../../../types/domain';
import { calculateCalendarDays, calculateWorkingDays } from '../../../lib/assignmentUtils';
import { AlertTriangle, ArrowRight, UserCheck, CheckCircle2, ShieldCheck } from 'lucide-react';
import { formatINR } from '../../../lib/utils';

interface POEmployeeReplaceModalProps {
  po: PurchaseOrder;
  outgoingEmployee: AssignedEmployee;
  isOpen: boolean;
  onClose: () => void;
}

export const POEmployeeReplaceModal: React.FC<POEmployeeReplaceModalProps> = ({
  po,
  outgoingEmployee,
  isOpen,
  onClose,
}) => {
  const { employees, replaceEmployeeOnPO } = useData();

  const [replacementEmployeeId, setReplacementEmployeeId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [billingRatePerMonth, setBillingRatePerMonth] = useState<number>(outgoingEmployee.billingRatePerMonth);
  const [billableDaysMethod, setBillableDaysMethod] = useState<BillableDaysMethod>(
    outgoingEmployee.billableDaysMethod || 'calendar'
  );
  const [manualBillableDays, setManualBillableDays] = useState<number | ''>(
    outgoingEmployee.manualBillableDays ?? ''
  );
  const [replacementAssignedTo, setReplacementAssignedTo] = useState(outgoingEmployee.assignedTo || po.expiryDate);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  // Candidates for replacement: employees not currently active on this PO
  const availableEmployees = employees.filter(
    (e) =>
      e.employeeId !== outgoingEmployee.employeeId &&
      !po.assignedEmployees.some(
        (ae) => ae.employeeId === e.employeeId && ae.status === 'Active'
      )
  );

  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      setEffectiveDate(today);
      setBillingRatePerMonth(outgoingEmployee.billingRatePerMonth || 200000);
      setBillableDaysMethod(outgoingEmployee.billableDaysMethod || 'calendar');
      setManualBillableDays(outgoingEmployee.manualBillableDays ?? '');
      setReplacementAssignedTo(outgoingEmployee.assignedTo || po.expiryDate);
      setReason('');
      setConfirmed(false);
      setError('');

      if (availableEmployees.length > 0) {
        setReplacementEmployeeId(availableEmployees[0].employeeId);
      } else {
        setReplacementEmployeeId('');
      }
    }
  }, [isOpen, outgoingEmployee, po]);

  const selectedReplacement = employees.find((e) => e.employeeId === replacementEmployeeId);

  // Eligible days preview
  const estimatedDays = React.useMemo(() => {
    if (!effectiveDate || !replacementAssignedTo || effectiveDate > replacementAssignedTo) {
      return 0;
    }
    if (billableDaysMethod === 'calendar') {
      return calculateCalendarDays(effectiveDate, replacementAssignedTo);
    }
    if (billableDaysMethod === 'working_days') {
      return calculateWorkingDays(effectiveDate, replacementAssignedTo);
    }
    return typeof manualBillableDays === 'number' ? manualBillableDays : 0;
  }, [effectiveDate, replacementAssignedTo, billableDaysMethod, manualBillableDays]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!replacementEmployeeId) {
      setError('Please select a replacement employee.');
      return;
    }

    if (!effectiveDate) {
      setError('Please specify an effective replacement date.');
      return;
    }

    if (replacementAssignedTo && effectiveDate > replacementAssignedTo) {
      setError('Replacement end date cannot precede the effective date.');
      return;
    }

    if (billingRatePerMonth <= 0) {
      setError('Billing rate must be greater than zero.');
      return;
    }

    if (billableDaysMethod === 'manual') {
      if (typeof manualBillableDays !== 'number' || manualBillableDays <= 0) {
        setError('Please enter a valid number of manual billable days (> 0).');
        return;
      }
    }

    if (!confirmed) {
      setError('Please review and confirm the replacement terms below before proceeding.');
      return;
    }

    replaceEmployeeOnPO(po.id, {
      outgoingEmployeeId: outgoingEmployee.employeeId,
      replacementEmployeeId,
      effectiveDate,
      billingRatePerMonth,
      billableDaysMethod,
      manualBillableDays: billableDaysMethod === 'manual' ? Number(manualBillableDays) : undefined,
      replacementAssignedTo,
      reason: reason.trim() || undefined,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Replace Employee on Purchase Order"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* 1. OUTGOING & REPLACEMENT VISUAL OVERVIEW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          {/* OUTGOING CARD */}
          <div className="p-3 bg-white rounded-lg border border-red-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Outgoing Resource</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-50 text-red-700 font-semibold border border-red-200">
                Concluding
              </span>
            </div>
            <div className="font-bold text-slate-900 text-sm">{outgoingEmployee.employeeName}</div>
            <div className="text-[11px] text-slate-500 font-mono">{outgoingEmployee.employeeId} · {outgoingEmployee.designation}</div>
            <div className="text-[11px] text-slate-700 mt-1">
              Current Rate: <strong>{formatINR(outgoingEmployee.billingRatePerMonth)}</strong>/mo
            </div>
          </div>

          {/* REPLACEMENT CARD */}
          <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Replacement Resource</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                Incoming
              </span>
            </div>
            <div className="font-bold text-slate-900 text-sm">
              {selectedReplacement ? selectedReplacement.name : 'Select Employee Below'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {selectedReplacement ? `${selectedReplacement.employeeId} · ${selectedReplacement.designation}` : '—'}
            </div>
            <div className="text-[11px] text-indigo-700 font-semibold mt-1">
              Starting on: {effectiveDate || '—'}
            </div>
          </div>
        </div>

        {/* 2. REPLACEMENT CONFIGURATION */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Select Replacement Employee <span className="text-red-500">*</span>
              </label>
              {availableEmployees.length === 0 ? (
                <div className="p-2 text-xs text-amber-700 bg-amber-50 rounded border border-amber-200">
                  No other employees available for assignment.
                </div>
              ) : (
                <select
                  value={replacementEmployeeId}
                  onChange={(e) => {
                    setReplacementEmployeeId(e.target.value);
                    const sel = employees.find((emp) => emp.employeeId === e.target.value);
                    if (sel && sel.salaryStructure?.grossMonthly) {
                      setBillingRatePerMonth(sel.salaryStructure.grossMonthly);
                    }
                  }}
                  className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                >
                  {availableEmployees.map((e) => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.name} ({e.employeeId}) — {e.designation}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <Input
                label="Effective Replacement Date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                required
                helperText="Outgoing concludes & replacement commences on this date"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Billing Rate Per Month (₹)"
                type="number"
                min="1"
                step="1000"
                value={billingRatePerMonth}
                onChange={(e) => setBillingRatePerMonth(Number(e.target.value))}
                required
                helperText="Negotiated monthly billing rate for the replacement"
              />
            </div>

            <div>
              <Input
                label="Replacement End Date (Last Working Day)"
                type="date"
                value={replacementAssignedTo}
                onChange={(e) => setReplacementAssignedTo(e.target.value)}
                required
                helperText="Default set to contractual PO completion date"
              />
            </div>
          </div>

          {/* BILLABLE METHOD & ESTIMATION */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <label className="block text-slate-700 font-bold">
              Billable Days Calculation Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                  billableDaysMethod === 'calendar'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="billableDaysMethod"
                  value="calendar"
                  checked={billableDaysMethod === 'calendar'}
                  onChange={() => setBillableDaysMethod('calendar')}
                  className="sr-only"
                />
                <span className="block text-xs">Calendar Days</span>
              </label>

              <label
                className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                  billableDaysMethod === 'working_days'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="billableDaysMethod"
                  value="working_days"
                  checked={billableDaysMethod === 'working_days'}
                  onChange={() => setBillableDaysMethod('working_days')}
                  className="sr-only"
                />
                <span className="block text-xs">Working Days (Mon–Fri)</span>
              </label>

              <label
                className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                  billableDaysMethod === 'manual'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="billableDaysMethod"
                  value="manual"
                  checked={billableDaysMethod === 'manual'}
                  onChange={() => setBillableDaysMethod('manual')}
                  className="sr-only"
                />
                <span className="block text-xs">Manual Days</span>
              </label>
            </div>

            {billableDaysMethod === 'manual' && (
              <div className="pt-2">
                <Input
                  label="Manual Billable Days"
                  type="number"
                  min="1"
                  max="365"
                  value={manualBillableDays}
                  onChange={(e) => setManualBillableDays(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 22"
                  required
                />
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Estimated Billable Period: <strong>{estimatedDays} Days</strong></span>
              <span>PO Period: {po.startDate} to {po.expiryDate}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Reason / Transition Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Planned resource rotation / client-requested skillset upgrade"
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 3. AUDIT & DATA PRESERVATION CONFIRMATION */}
        <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-amber-900 font-bold">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Historical Integrity & Audit Safeguards</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-800">
            <li>
              <strong>{outgoingEmployee.employeeName}</strong>'s historical invoices, proformas, timesheets, and audit trail will remain permanently intact under their ID.
            </li>
            <li>
              Outgoing employee's global employment status is <strong>not</strong> modified; they remain active in the company and on any other assigned projects.
            </li>
            <li>
              Existing proforma invoices and invoices are <strong>never</strong> reassigned or transferred to the incoming resource.
            </li>
          </ul>

          <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span className="text-xs font-semibold text-slate-800">
              I confirm the employee replacement on PO {po.poNumber} effective {effectiveDate || 'selected date'}.
            </span>
          </label>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            icon={<ArrowRight className="w-4 h-4" />}
            disabled={!confirmed || availableEmployees.length === 0}
          >
            Apply Replacement
          </Button>
        </div>
      </form>
    </Modal>
  );
};
