import React, { useState } from 'react';
import { useData } from '../../../context/DataContext';
import { Modal, Input, Button } from '../../common/UIComponents';
import { PurchaseOrder } from '../../../types/domain';
import { formatINR } from '../../../lib/utils';

interface PORenewalModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
}

export const PORenewalModal: React.FC<PORenewalModalProps> = ({ po, isOpen, onClose }) => {
  const { renewPO } = useData();

  const [newPoNumber, setNewPoNumber] = useState(
    `PO/2026/${po.projectName.split(' ')[0].toUpperCase()}/${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [newAmountExclGst, setNewAmountExclGst] = useState<number>(po.amountExclGst);
  const [newStartDate, setNewStartDate] = useState('2026-12-01');
  const [newExpiryDate, setNewExpiryDate] = useState('2027-11-30');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    renewPO(po.id, newPoNumber, newAmountExclGst, newStartDate, newExpiryDate);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`PO Renewal Workflow — ${po.poNumber}`}
      subtitle="Exhausted/Expired PO renewal will mark current PO as 'Renewed' and establish a successor PO record with historical linkage."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 leading-relaxed">
          <strong>Enterprise Renewal Rule:</strong> An exhausted PO is not extended in place.
          Submitting will preserve current PO <strong>{po.poNumber}</strong> history and spawn a new
          successor PO <strong>{newPoNumber}</strong>.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="New Successor PO Number *"
            value={newPoNumber}
            onChange={(e) => setNewPoNumber(e.target.value)}
            required
          />
          <Input
            label="New PO Value Excl. GST (INR) *"
            type="number"
            value={newAmountExclGst}
            onChange={(e) => setNewAmountExclGst(Number(e.target.value))}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="New Start Date *"
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            required
          />
          <Input
            label="New Expiry Date *"
            type="date"
            value={newExpiryDate}
            onChange={(e) => setNewExpiryDate(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Execute Renewal & Create Successor PO
          </Button>
        </div>
      </form>
    </Modal>
  );
};
