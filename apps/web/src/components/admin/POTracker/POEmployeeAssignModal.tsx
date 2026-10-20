import React, { useState, useEffect } from 'react';
import { useData } from '../../../context/DataContext';
import { Modal, Input, Button } from '../../common/UIComponents';
import { PurchaseOrder, BillableDaysMethod } from '../../../types/domain';
import { calculateCalendarDays, calculateWorkingDays } from '../../../lib/assignmentUtils';
import { AlertCircle, Info, CheckCircle2, Calendar, Briefcase, Edit3 } from 'lucide-react';

interface POEmployeeAssignModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
  initialEmployeeId?: string;
}

export const POEmployeeAssignModal: React.FC<POEmployeeAssignModalProps> = ({
  po,
  isOpen,
  onClose,
  initialEmployeeId,
}) => {
  const { employees, assignEmployeeToPO } = useData();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [billingRatePerMonth, setBillingRatePerMonth] = useState<number>(200000);
  const [assignedFrom, setAssignedFrom] = useState(po.startDate);
  const [assignedTo, setAssignedTo] = useState(po.expiryDate);
  const [billableDaysMethod, setBillableDaysMethod] = useState<BillableDaysMethod>('calendar');
  const [manualBillableDays, setManualBillableDays] = useState<number | ''>('');
  const [error, setError] = useState('');

  // Reset or initialize when modal opens or initial employee changes
  useEffect(() => {
    if (!isOpen) return;
    setError('');

    let initialEmpId = initialEmployeeId || selectedEmployeeId;
    if (!initialEmpId || !employees.some((e) => e.employeeId === initialEmpId)) {
      const untagged = employees.find((e) => !po.assignedEmployees.some((a) => a.employeeId === e.employeeId));
      initialEmpId = untagged ? untagged.employeeId : (employees[0]?.employeeId || '');
      setSelectedEmployeeId(initialEmpId);
    } else {
      setSelectedEmployeeId(initialEmpId);
    }

    const existingAssigned = po.assignedEmployees.find((e) => e.employeeId === initialEmpId);
    if (existingAssigned) {
      setBillingRatePerMonth(existingAssigned.billingRatePerMonth || 200000);
      setAssignedFrom(existingAssigned.assignedFrom || po.startDate);
      setAssignedTo(existingAssigned.assignedTo || po.expiryDate);
      setBillableDaysMethod(existingAssigned.billableDaysMethod || 'calendar');
      setManualBillableDays(existingAssigned.manualBillableDays ?? '');
    } else {
      setBillingRatePerMonth(200000);
      setAssignedFrom(po.startDate);
      setAssignedTo(po.expiryDate);
      setBillableDaysMethod('calendar');
      setManualBillableDays('');
    }
  }, [isOpen, initialEmployeeId, po]);

  const handleEmployeeSelectChange = (empId: string) => {
    setSelectedEmployeeId(empId);
    setError('');

    const existingAssigned = po.assignedEmployees.find((e) => e.employeeId === empId);
    if (existingAssigned) {
      setBillingRatePerMonth(existingAssigned.billingRatePerMonth || 200000);
      setAssignedFrom(existingAssigned.assignedFrom || po.startDate);
      setAssignedTo(existingAssigned.assignedTo || po.expiryDate);
      setBillableDaysMethod(existingAssigned.billableDaysMethod || 'calendar');
      setManualBillableDays(existingAssigned.manualBillableDays ?? '');
    } else {
      setBillingRatePerMonth(200000);
      setAssignedFrom(po.startDate);
      setAssignedTo(po.expiryDate);
      setBillableDaysMethod('calendar');
      setManualBillableDays('');
    }
  };

  const selectedEmp = employees.find((e) => e.employeeId === selectedEmployeeId);
  const existingAssigned = po.assignedEmployees.find((e) => e.employeeId === selectedEmployeeId);

  const todayStr = new Date().toISOString().split('T')[0];
  const isPeriodValid = Boolean(assignedFrom && assignedTo && assignedFrom <= assignedTo);
  const periodCalendarDays = isPeriodValid ? calculateCalendarDays(assignedFrom, assignedTo) : 0;
  const periodWorkingDays = isPeriodValid ? calculateWorkingDays(assignedFrom, assignedTo) : 0;
  const isExpired = Boolean(assignedTo && todayStr > assignedTo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedEmp) {
      setError('Please select a valid employee.');
      return;
    }

    if (isNaN(billingRatePerMonth) || billingRatePerMonth <= 0) {
      setError('Billing rate per month must be greater than ₹0.');
      return;
    }

    if (!assignedFrom || !assignedTo) {
      setError('Both Assignment Start Date and Last Working Day are required.');
      return;
    }

    if (new Date(assignedTo) < new Date(assignedFrom)) {
      setError('Last Working Day cannot be earlier than Assignment Start Date.');
      return;
    }

    if (billableDaysMethod === 'manual') {
      const manualNum = Number(manualBillableDays);
      if (isNaN(manualNum) || manualNum <= 0) {
        setError('Please enter a valid number of manual billable days greater than 0.');
        return;
      }
      if (manualNum > periodCalendarDays) {
        setError(
          `Manual billable days (${manualNum}) cannot exceed total calendar days (${periodCalendarDays}) in the assignment period.`
        );
        return;
      }
    }

    assignEmployeeToPO(po.id, {
      employeeId: selectedEmp.employeeId,
      employeeName: selectedEmp.name,
      designation: selectedEmp.designation,
      billingRatePerMonth,
      assignedFrom,
      assignedTo,
      billableDaysMethod,
      manualBillableDays: billableDaysMethod === 'manual' ? Number(manualBillableDays) : undefined,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingAssigned ? `Edit Tagged Employee — ${po.poNumber}` : `Tag Employee to PO — ${po.poNumber}`}
      subtitle={`Project: ${po.projectName} · PO Period: ${po.startDate} to ${po.expiryDate}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* 1. EMPLOYEE GROUP */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-700 text-xs">
            Employee <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => handleEmployeeSelectChange(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
          >
            {employees.map((e) => {
              const isTagged = po.assignedEmployees.some((a) => a.employeeId === e.employeeId);
              return (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.name} ({e.designation}) — {e.employeeId} {isTagged ? '★ [Already Tagged]' : ''}
                </option>
              );
            })}
          </select>

          {existingAssigned ? (
            <div className="flex items-center gap-2 p-2 bg-blue-50/80 border border-blue-200 rounded-lg text-blue-800 text-[11px]">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                <strong>{selectedEmp?.name}</strong> is already tagged. Submitting will update their billing rate, last working day, and billable days method.
              </span>
            </div>
          ) : (
            selectedEmp && (
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  New PO assignment for <strong>{selectedEmp.name}</strong> ({selectedEmp.designation}).
                </span>
              </div>
            )
          )}
        </div>

        {/* 2. BILLING RATE GROUP */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-700 text-xs">
            Monthly Billing Rate (INR) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-slate-400 font-semibold text-xs">₹</span>
            <input
              type="number"
              min="1"
              step="any"
              value={billingRatePerMonth || ''}
              placeholder="e.g. 200000"
              onChange={(e) => setBillingRatePerMonth(Number(e.target.value))}
              className="w-full pl-7 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              required
            />
          </div>
          {billingRatePerMonth > 0 && (
            <span className="text-[10px] text-slate-500 font-mono block">
              ₹{billingRatePerMonth.toLocaleString('en-IN')} / month
            </span>
          )}
        </div>

        {/* 3. ASSIGNMENT PERIOD GROUP */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-700 text-xs">
            Assignment Period <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-slate-500 font-medium block mb-1">
                Assignment Start Date *
              </span>
              <Input
                type="date"
                value={assignedFrom}
                onChange={(e) => setAssignedFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block mb-1">
                Last Working Day *
              </span>
              <Input
                type="date"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                required
              />
            </div>
          </div>

          {isPeriodValid && (
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 pt-0.5">
              <span>
                Span: <strong>{periodCalendarDays} calendar days</strong> ({periodWorkingDays} working days)
              </span>
              {isExpired && (
                <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  ⚠️ Inactive / Expired (Last working day is in the past)
                </span>
              )}
            </div>
          )}
        </div>

        {/* 4. BILLABLE DAYS GROUP */}
        <div className="space-y-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between">
            <label className="block font-semibold text-slate-800 text-xs">
              Billable Days Configuration <span className="text-red-500">*</span>
            </label>
            <span className="text-[10px] text-slate-500">
              Selected: <strong className="text-indigo-900 capitalize">{billableDaysMethod.replace('_', ' ')}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Calendar Days */}
            <button
              type="button"
              onClick={() => setBillableDaysMethod('calendar')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                billableDaysMethod === 'calendar'
                  ? 'bg-indigo-50/80 border-indigo-400 text-indigo-900 ring-1 ring-indigo-400'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Calendar Days</span>
                </div>
                <span className="text-xs">{billableDaysMethod === 'calendar' ? '●' : '○'}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                All days in month (standard calendar proration)
              </p>
            </button>

            {/* Working Days */}
            <button
              type="button"
              onClick={() => setBillableDaysMethod('working_days')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                billableDaysMethod === 'working_days'
                  ? 'bg-indigo-50/80 border-indigo-400 text-indigo-900 ring-1 ring-indigo-400'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Working Days</span>
                </div>
                <span className="text-xs">{billableDaysMethod === 'working_days' ? '●' : '○'}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Monday–Friday only (excluding weekends)
              </p>
            </button>

            {/* Manual Entry */}
            <button
              type="button"
              onClick={() => setBillableDaysMethod('manual')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                billableDaysMethod === 'manual'
                  ? 'bg-indigo-50/80 border-indigo-400 text-indigo-900 ring-1 ring-indigo-400'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Manual Entry</span>
                </div>
                <span className="text-xs">{billableDaysMethod === 'manual' ? '●' : '○'}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Custom billable day quota per month
              </p>
            </button>
          </div>

          {/* Manual Days Input */}
          {billableDaysMethod === 'manual' && (
            <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1">
              <label className="block font-semibold text-slate-700 text-[11px]">
                Enter Billable Days *
              </label>
              <input
                type="number"
                min="1"
                max={periodCalendarDays || 31}
                value={manualBillableDays}
                placeholder={`1 to ${periodCalendarDays || 31}`}
                onChange={(e) => setManualBillableDays(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                required
              />
              <span className="text-[10px] text-slate-400 block">
                Must not exceed {periodCalendarDays} total days in the selected assignment span.
              </span>
            </div>
          )}

          {/* Summary Indicator */}
          <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 text-[11px]">
            <span className="text-slate-600 font-medium">Eligible Billable Base:</span>
            <span className="font-mono font-bold text-indigo-900">
              {billableDaysMethod === 'calendar' && `${periodCalendarDays} calendar days`}
              {billableDaysMethod === 'working_days' && `${periodWorkingDays} working days (Mon–Fri)`}
              {billableDaysMethod === 'manual' && `${manualBillableDays || 0} days (custom)`}
            </span>
          </div>
        </div>

        {/* ERROR DISPLAY */}
        {error && (
          <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[11px]">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* SUBMIT BUTTONS */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {existingAssigned ? 'Update Tagged Employee' : 'Tag Employee to PO'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
