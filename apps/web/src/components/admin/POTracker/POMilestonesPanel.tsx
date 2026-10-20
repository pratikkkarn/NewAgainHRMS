import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Flag, Plus, Trash2, XCircle } from 'lucide-react';
import { BillingMilestone, PurchaseOrder } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { daysBetween } from '../../../lib/poForecast';
import { checkMilestone } from '../../../lib/poUtils';
import { formatDate, formatINR } from '../../../lib/utils';
import { Badge, Button, Card, Input, Modal } from '../../common/UIComponents';
import { EmptyState } from '../../common/StateViews';

const today = () => new Date().toISOString().split('T')[0];

export const POMilestonesPanel: React.FC<{ po: PurchaseOrder }> = ({ po }) => {
  const { savePOMilestones } = useData();
  const { can } = useRole();
  const canEdit = can('po.edit') && po.status !== 'Closed' && po.status !== 'Renewed';

  const milestones = [...(po.billingMilestones || [])].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const upcomingTotal = milestones.filter((m) => m.status === 'Upcoming').reduce((s, m) => s + m.amountExclGst, 0);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<BillingMilestone | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const save = (next: BillingMilestone[], details: string) => savePOMilestones(po.id, next, details);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/[,₹\s]/g, ''));
    const problem = checkMilestone(po, title, dueDate, value);
    if (problem) {
      setError(problem);
      return;
    }
    const m: BillingMilestone = {
      id: `ms-${Date.now()}`,
      title: title.trim(),
      dueDate,
      amountExclGst: value,
      status: 'Upcoming',
    };
    save([...milestones, m], `Added milestone "${m.title}" for ${formatINR(value)} due ${m.dueDate}.`);
    setTitle('');
    setDueDate('');
    setAmount('');
    setError(null);
    setAdding(false);
  };

  const setStatus = (m: BillingMilestone, status: BillingMilestone['status'], invNo?: string) =>
    save(
      milestones.map((x) => (x.id === m.id ? { ...x, status, invoiceNumber: invNo || x.invoiceNumber } : x)),
      `Milestone "${m.title}" marked ${status}${invNo ? ` (invoice ${invNo})` : ''}.`
    );

  const remove = (m: BillingMilestone) =>
    save(milestones.filter((x) => x.id !== m.id), `Removed milestone "${m.title}".`);

  return (
    <Card className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Flag className="w-4 h-4 text-indigo-600" /> Billing Milestones
          </h3>
          <p className="text-[11px] text-slate-500">
            Reminders go out before each due date (see Alert Settings). Upcoming total: {formatINR(upcomingTotal)}.
          </p>
        </div>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding(true)}>
            Add milestone
          </Button>
        )}
      </div>

      {upcomingTotal > po.remainingBalanceExclGst && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            Upcoming milestones ({formatINR(upcomingTotal)}) exceed the remaining balance (
            {formatINR(po.remainingBalanceExclGst)}). Some cannot be invoiced without a PO increase.
          </span>
        </div>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <Input label="Milestone" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Phase 2 sign-off" autoFocus />
          <Input label="Due date" type="date" value={dueDate} min={po.startDate} max={po.expiryDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input label="Amount (Excl. GST)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250000" />
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setAdding(false); setError(null); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
          {error && <p className="md:col-span-4 text-red-600 font-medium">{error}</p>}
        </form>
      )}

      {milestones.length === 0 ? (
        <EmptyState title="No milestones yet" message="Add milestones when the SOW bills on deliverables rather than monthly." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Milestone</th>
                <th className="p-3">Due</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Status</th>
                {canEdit && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.map((m) => {
                const days = daysBetween(today(), m.dueDate);
                return (
                  <tr key={m.id}>
                    <td className="p-3 font-semibold text-slate-900">
                      {m.title}
                      {m.invoiceNumber && <span className="block text-[10px] font-mono text-slate-500">{m.invoiceNumber}</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {formatDate(m.dueDate)}
                      {m.status === 'Upcoming' && (
                        <span className={`block text-[10px] ${days < 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                          {days < 0 ? `${-days} day(s) overdue` : days === 0 ? 'due today' : `in ${days} day(s)`}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono">{formatINR(m.amountExclGst)}</td>
                    <td className="p-3">
                      <Badge status={m.status === 'Invoiced' ? 'Paid' : m.status === 'Cancelled' ? 'Cancelled' : 'Pending'}>
                        {m.status}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {m.status === 'Upcoming' && (
                            <>
                              <Button size="sm" variant="ghost" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => { setInvoicing(m); setInvoiceNumber(''); }}>
                                Invoiced
                              </Button>
                              <Button size="sm" variant="ghost" icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => setStatus(m, 'Cancelled')}>
                                Cancel
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => remove(m)} aria-label={`Delete ${m.title}`} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {invoicing && (
        <Modal isOpen onClose={() => setInvoicing(null)} title={`Mark "${invoicing.title}" as invoiced`} maxWidth="md">
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Record the invoice number used. Add the invoice itself on the Invoices tab if you haven't already.
            </p>
            <Input label="Invoice number (optional)" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setInvoicing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setStatus(invoicing, 'Invoiced', invoiceNumber.trim() || undefined);
                  setInvoicing(null);
                }}
              >
                Mark invoiced
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
};
