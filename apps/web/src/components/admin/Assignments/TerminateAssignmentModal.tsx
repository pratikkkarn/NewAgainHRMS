import React, { useState } from 'react';
import { Assignment } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { Modal, Button } from '../../common/UIComponents';
import { calculateProratedBillingAmount } from '../../../lib/assignmentUtils';
import { AlertCircle, Calendar, UserX } from 'lucide-react';

interface TerminateAssignmentModalProps {
  assignment: Assignment | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TerminateAssignmentModal: React.FC<TerminateAssignmentModalProps> = ({
  assignment,
  isOpen,
  onClose,
}) => {
  const { terminateAssignment } = useData();

  const [effectiveDate, setEffectiveDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !assignment) return null;

  const d = new Date(effectiveDate || Date.now());
  const year = d.getFullYear() || 2026;
  const monthIdx = d.getMonth();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthName = monthNames[monthIdx] || 'October';

  const proration = calculateProratedBillingAmount({
    monthlyBillingRate: assignment.billingRatePerMonth || 0,
    assignedFrom: assignment.assignedFrom,
    assignedTo: assignment.assignedTo,
    effectiveTerminationDate: effectiveDate,
    billingYear: year,
    billingMonth: monthIdx + 1,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please enter a reason for terminating the employee allocation.');
      return;
    }
    if (!effectiveDate) {
      setError('Please select an effective termination date.');
      return;
    }

    terminateAssignment(assignment.id, effectiveDate, reason.trim());
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`End Employee Allocation — ${assignment.employeeName}`}>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        {/* ASSIGNMENT SUMMARY */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block">Employee</span>
            <strong className="text-slate-900 font-medium">
              {assignment.employeeName} ({assignment.employeeId})
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Project / PO</span>
            <strong className="text-slate-900 font-medium">
              {assignment.projectName} {assignment.poNumber ? `(${assignment.poNumber})` : ''}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Monthly Rate</span>
            <strong className="text-indigo-700 font-mono">
              ₹{(assignment.billingRatePerMonth || 0).toLocaleString('en-IN')}/mo
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Original Duration</span>
            <span className="text-slate-800 font-mono">
              {assignment.assignedFrom} to {assignment.assignedTo}
            </span>
          </div>
        </div>

        {/* TERMINATION INPUTS */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Effective End Date *
          </label>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => {
              setEffectiveDate(e.target.value);
              setError(null);
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-xs font-mono"
            required
          />
          <p className="text-[11px] text-slate-500 mt-1">
            The employee remains billable up to and including this termination date.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Termination *
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="E.g., Transitioned to new project, Client request, Employment departure..."
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-xs"
            required
          />
        </div>

        {/* PRORATION PREVIEW CARD */}
        {assignment.billingRatePerMonth && assignment.billingRatePerMonth > 0 && (
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-950 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-indigo-900">
              <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
              Departure Month Proration Preview ({monthName} {year})
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                Eligible Calendar Days:{' '}
                <strong className="font-mono">{proration.eligibleDays} / {proration.totalDaysInMonth} days</strong>
              </div>
              <div>
                Calculated Prorated Billing:{' '}
                <strong className="font-mono text-indigo-800">
                  ₹{proration.eligibleAmount.toLocaleString('en-IN')}
                </strong>
              </div>
            </div>
            <p className="text-[10px] text-indigo-700 italic pt-1">
              * Historical assignment record will be preserved with 'Terminated' status. Already issued invoices will remain unchanged.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="sm" icon={<UserX className="w-4 h-4" />}>
            Confirm Termination
          </Button>
        </div>
      </form>
    </Modal>
  );
};
