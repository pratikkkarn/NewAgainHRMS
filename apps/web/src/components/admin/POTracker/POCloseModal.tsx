import React, { useState } from 'react';
import { PurchaseOrder } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { formatINR } from '../../../lib/utils';
import { Button, Modal } from '../../common/UIComponents';

// Confirmation Modal for Closing a PO
export const POCloseModal: React.FC<{ po: PurchaseOrder; onClose: () => void }> = ({ po, onClose }) => {
  const { closePO } = useData();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      closePO(po.id, reason.trim() || 'PO Closed by user');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Close Purchase Order?"
      subtitle="Use this when the PO will no longer remain open."
      maxWidth="md"
    >
      <div className="space-y-4 text-xs">
        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
          Are you sure you want to close PO <strong className="text-slate-900">{po.poNumber}</strong> for{' '}
          <strong className="text-slate-900">{po.projectName}</strong>? Please confirm that this purchase order should no longer remain open.
        </p>

        <ul className="list-disc pl-5 space-y-1 text-slate-600 text-[11px]">
          <li>No more invoices can be added to it.</li>
          <li>Expiry and low-balance alerts stop.</li>
          <li>The unbilled balance of {formatINR(po.remainingBalanceExclGst)} is not carried anywhere.</li>
          <li>History, invoices, credit notes and documents are preserved.</li>
        </ul>

        <div>
          <label htmlFor="close-reason" className="block text-xs font-medium text-slate-700 mb-1">
            Reason / Notes <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <textarea
            id="close-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Client engagement completed; no renewal planned."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            No, Cancel
          </Button>
          <Button variant="danger" loading={isSubmitting} onClick={submit}>
            Yes, Close PO
          </Button>
        </div>
      </div>
    </Modal>
  );
};
