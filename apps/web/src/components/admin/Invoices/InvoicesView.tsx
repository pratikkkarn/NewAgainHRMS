import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, Search, XCircle } from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { Card, Badge, Button, Modal, StatCard } from '../../common/UIComponents';
import { EmptyState } from '../../common/StateViews';
import { formatINR, formatDate } from '../../../lib/utils';
import { Invoice, InvoiceStatus } from '../../../types/domain';

interface InvoicesViewProps {
  onNavigate: (tab: string, params?: any) => void;
  initialSearch?: string;
  initialProjectFilter?: string;
  initialTypeFilter?: string;
  initialStatusFilter?: string;
  initialMonthFilter?: string;
  returnTo?: string;
}

type LedgerRow = Invoice & { poNumber: string; projectId: string; projectName: string; monthKey: string };

const STATUSES: InvoiceStatus[] = ['Issued', 'Paid', 'Pending', 'Cancelled'];

const monthOf = (inv: Invoice) => (inv.billingPeriodStart || inv.invoiceDate || '').slice(0, 7);

const monthLabel = (key: string) => {
  if (!key) return 'Unknown';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  onNavigate,
  initialSearch,
  initialProjectFilter,
  initialTypeFilter,
  initialStatusFilter,
  initialMonthFilter,
  returnTo,
}) => {
  const { purchaseOrders, projects, cancelInvoice } = useData();
  const { can } = useRole();

  const [search, setSearch] = useState(initialSearch || '');
  const [projectFilter, setProjectFilter] = useState(initialProjectFilter || 'all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'invoice' | 'credit'>(
    (initialTypeFilter as any) || 'all'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>(
    (initialStatusFilter as any) || 'all'
  );
  const [monthFilter, setMonthFilter] = useState(initialMonthFilter || 'all');
  const [cancelling, setCancelling] = useState<LedgerRow | null>(null);

  React.useEffect(() => {
    if (initialSearch !== undefined) setSearch(initialSearch);
  }, [initialSearch]);

  React.useEffect(() => {
    if (initialProjectFilter) setProjectFilter(initialProjectFilter);
  }, [initialProjectFilter]);

  React.useEffect(() => {
    if (initialTypeFilter) setTypeFilter(initialTypeFilter as any);
  }, [initialTypeFilter]);

  React.useEffect(() => {
    if (initialStatusFilter) setStatusFilter(initialStatusFilter as any);
  }, [initialStatusFilter]);

  React.useEffect(() => {
    if (initialMonthFilter) setMonthFilter(initialMonthFilter);
  }, [initialMonthFilter]);

  const rows: LedgerRow[] = useMemo(
    () =>
      purchaseOrders
        .flatMap((po) =>
          po.invoices.map((inv) => ({
            ...inv,
            poNumber: po.poNumber,
            projectId: po.projectId,
            projectName: po.projectName,
            monthKey: monthOf(inv),
          }))
        )
        .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1)),
    [purchaseOrders]
  );

  const months = useMemo(() => [...new Set(rows.map((r) => r.monthKey))].filter(Boolean).sort().reverse(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q ||
          r.invoiceNumber.toLowerCase().includes(q) ||
          r.poNumber.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q)) &&
        (projectFilter === 'all' || r.projectId === projectFilter) &&
        (typeFilter === 'all' || (typeFilter === 'credit') === !!r.isCreditNote) &&
        (statusFilter === 'all' || r.status === statusFilter) &&
        (monthFilter === 'all' || r.monthKey === monthFilter)
    );
  }, [rows, search, projectFilter, typeFilter, statusFilter, monthFilter]);

  // Totals ignore cancelled documents, matching how PO balances are calculated.
  const active = filtered.filter((r) => r.status !== 'Cancelled');
  const invoiced = active.filter((r) => !r.isCreditNote).reduce((s, r) => s + r.amountExclGst, 0);
  const credited = active.filter((r) => r.isCreditNote).reduce((s, r) => s + Math.abs(r.amountExclGst), 0);
  const gst = active.reduce((s, r) => s + (r.isCreditNote ? -1 : 1) * Math.abs(r.gstAmount), 0);

  const exportCsv = () => {
    const header = ['Number', 'Type', 'PO', 'Project', 'Billing Month', 'Invoice Date', 'Amount Excl GST', 'GST', 'Total Incl GST', 'Status'];
    const quote = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = filtered.map((r) =>
      [
        r.invoiceNumber,
        r.isCreditNote ? 'Credit Note' : 'Invoice',
        r.poNumber,
        r.projectName,
        monthLabel(r.monthKey),
        r.invoiceDate,
        r.amountExclGst,
        r.gstAmount,
        r.totalAmountInclGst,
        r.status,
      ]
        .map(quote)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'primestar-invoices.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch('');
    setProjectFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setMonthFilter('all');
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Invoices & Credit Notes</h1>
          <p className="text-slate-500 mt-0.5">Every invoice and credit note across all purchase orders.</p>
        </div>
        <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={exportCsv} disabled={filtered.length === 0}>
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Documents" value={filtered.length} subtitle={`${active.length} not cancelled`} />
        <StatCard title="Invoiced (Excl. GST)" value={formatINR(invoiced)} />
        <StatCard title="Credit Notes" value={formatINR(credited)} subtitle="Added back to PO balances" />
        <StatCard title="Net GST" value={formatINR(gst)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200/70 shadow-[var(--shadow-card)]">
        <div className="relative flex-1 min-w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, PO or project"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white w-44" aria-label="Project">
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white w-44" aria-label="Billing month">
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white w-44" aria-label="Type">
            <option value="all">Invoices & credit notes</option>
            <option value="invoice">Invoices only</option>
            <option value="credit">Credit notes only</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white w-44" aria-label="Status">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/70 border-b border-slate-200/70">
              <tr>
                <th className="pl-5 pr-3 py-3">Number</th>
                <th className="px-3 py-3">PO & project</th>
                <th className="px-3 py-3">Billing month</th>
                <th className="px-3 py-3">Invoice date</th>
                <th className="px-3 py-3 text-right">Excl. GST</th>
                <th className="px-3 py-3 text-right">GST</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Status</th>
                <th className="pl-3 pr-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((inv) => (
                <tr key={inv.id} className="group">
                  <td className="pl-5 pr-3 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{inv.invoiceNumber}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[11px] font-medium ${inv.isCreditNote ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {inv.isCreditNote ? 'Credit note' : 'Invoice'}
                      </span>
                      {inv.overrideReason && (
                        <span className="text-[11px] font-medium text-amber-700" title={inv.overrideReason}>
                          · Balance override
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 max-w-64">
                    <div className="font-medium text-slate-800 whitespace-nowrap">{inv.poNumber}</div>
                    <div className="text-[11px] text-slate-500 truncate">{inv.projectName}</div>
                  </td>
                  <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">{monthLabel(inv.monthKey)}</td>
                  <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                  <td className={`px-3 py-3.5 text-right font-medium whitespace-nowrap ${inv.isCreditNote ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {inv.isCreditNote ? '−' : ''}
                    {formatINR(Math.abs(inv.amountExclGst))}
                  </td>
                  <td className="px-3 py-3.5 text-right text-slate-500 whitespace-nowrap">{formatINR(Math.abs(inv.gstAmount))}</td>
                  <td className="px-3 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">{formatINR(Math.abs(inv.totalAmountInclGst))}</td>
                  <td className="px-3 py-3.5">
                    <Badge status={inv.status} />
                    {inv.status === 'Paid' && inv.paidAt && (
                      <div className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">on {formatDate(inv.paidAt)}</div>
                    )}
                  </td>
                  <td className="pl-3 pr-5 py-3.5">
                    <div className="flex justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          onNavigate('po-tracker', {
                            poId: inv.poId,
                            initialTab: 'invoices',
                            returnTo: 'invoices',
                            search: search ? search : undefined,
                            projectFilter: projectFilter !== 'all' ? projectFilter : undefined,
                            typeFilter: typeFilter !== 'all' ? typeFilter : undefined,
                            statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
                            monthFilter: monthFilter !== 'all' ? monthFilter : undefined,
                          })
                        }
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                        title="Open the PO"
                        aria-label={`Open ${inv.poNumber}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      {can('invoice.create') && inv.status !== 'Cancelled' && (
                        <button
                          onClick={() => setCancelling(inv)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title={`Cancel ${inv.isCreditNote ? 'credit note' : 'invoice'}`}
                          aria-label={`Cancel ${inv.invoiceNumber}`}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              title={rows.length === 0 ? 'No invoices yet' : 'No invoices match these filters'}
              message={rows.length === 0 ? 'Invoices are added from each PO’s detail page.' : undefined}
              action={
                rows.length > 0 ? (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </Card>

      {cancelling && (
        <Modal isOpen onClose={() => setCancelling(null)} title={`Cancel ${cancelling.invoiceNumber}?`} maxWidth="md">
          <div className="space-y-4 text-xs">
            <p className="text-slate-700">
              The {cancelling.isCreditNote ? 'credit note' : 'invoice'} stays on record as <strong>Cancelled</strong> and no
              longer counts toward the balance of <strong>{cancelling.poNumber}</strong>.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setCancelling(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  cancelInvoice(cancelling.poId, cancelling.id);
                  setCancelling(null);
                }}
              >
                Cancel {cancelling.isCreditNote ? 'credit note' : 'invoice'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
