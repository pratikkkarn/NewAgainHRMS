import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { Meter } from '../../common/ChartKit';
import { POCloseModal } from './POCloseModal';
import { StatCard, Badge, Button, Card, Modal, Input } from '../../common/UIComponents';
import { formatINR, formatINRCompact, formatDate, getDaysRemainingCalendar, getExpiryCountdownLabel, formatExpiringSoonSubtitle } from '../../../lib/utils';
import {
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Eye,
  Ban,
  Edit3,
  RotateCcw,
  Building2,
  DollarSign,
  Briefcase,
  FolderOpen,
} from 'lucide-react';
import { POCreateModal } from './POCreateModal';
import { PODetailPage } from './PODetailPage';
import { PurchaseOrder } from '../../../types/domain';

interface POTrackerMainProps {
  selectedPoId?: string;
  initialStatusFilter?: string;
  initialProjectFilter?: string;
  initialSearch?: string;
  initialExpiryFilter?: string;
  onNavigate?: (tab: string, params?: any) => void;
  highlightEmployeeId?: string;
  initialTab?: string;
  returnTo?: string;
  returnParams?: any;
}

export const POTrackerMain: React.FC<POTrackerMainProps> = ({
  selectedPoId,
  initialStatusFilter,
  initialProjectFilter,
  initialSearch,
  initialExpiryFilter,
  onNavigate,
  highlightEmployeeId,
  initialTab,
  returnTo,
  returnParams,
}) => {
  const { purchaseOrders, projects, updatePO } = useData();
  const { can } = useRole();

  const [activePoId, setActivePoId] = useState<string | null>(selectedPoId || null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // Edit PO state
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [editPoNumber, setEditPoNumber] = useState('');
  const [editRequester, setEditRequester] = useState('');
  const [editAmountExclGst, setEditAmountExclGst] = useState<number>(0);
  const [editGstRate, setEditGstRate] = useState<number>(18);
  const [editNotes, setEditNotes] = useState('');

  // Delete confirmation state
  // POs are never deleted (Architecture doc); they are closed with a reason instead.
  const [closingPoId, setClosingPoId] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState(initialSearch || '');
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectFilter || 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'ALL');
  const [expiryFilter, setExpiryFilter] = useState<string>(initialExpiryFilter || 'ALL');

  React.useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  React.useEffect(() => {
    if (initialProjectFilter) {
      setProjectFilter(initialProjectFilter);
    }
  }, [initialProjectFilter]);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);

  React.useEffect(() => {
    if (initialExpiryFilter) {
      setExpiryFilter(initialExpiryFilter);
    }
  }, [initialExpiryFilter]);

  React.useEffect(() => {
    if (selectedPoId) {
      setActivePoId(selectedPoId);
    } else {
      setActivePoId(null);
    }
  }, [selectedPoId]);

  // Dynamic Summary Metrics
  const summary = useMemo(() => {
    const totalPOs = purchaseOrders.length;
    const activePOs = purchaseOrders.filter((p) => p.status === 'Active').length;
    const expiringSoonList = purchaseOrders
      .filter((p) => {
        if (p.status === 'Closed' || p.status === 'Renewed') return false;
        const days = getDaysRemainingCalendar(p.expiryDate);
        return days !== null && days >= 0 && days <= 60;
      })
      .map((p) => ({ po: p, days: getDaysRemainingCalendar(p.expiryDate)! }))
      .sort((a, b) => a.days - b.days);

    const expiringSoon = expiringSoonList.length;
    const expiringSoonSubtitle = 'Expiring within 60 days';

    let expiringSoonNearest = '';
    if (expiringSoon > 0) {
      const minDays = expiringSoonList[0].days;
      if (minDays === 0) {
        expiringSoonNearest = 'Nearest: Expires today';
      } else if (minDays === 1) {
        expiringSoonNearest = 'Nearest: 1 day left';
      } else {
        expiringSoonNearest = `Nearest: ${minDays} days left`;
      }
    }

    const lowBalance = purchaseOrders.filter((p) => p.status === 'Low Balance').length;

    const totalPOValue = purchaseOrders.reduce((sum, p) => sum + (p.amountExclGst || 0), 0);
    const remainingBalance = purchaseOrders.reduce(
      (sum, p) => sum + (p.remainingBalanceExclGst || 0),
      0
    );

    return {
      totalPOs,
      activePOs,
      expiringSoon,
      expiringSoonSubtitle,
      expiringSoonNearest,
      lowBalance,
      totalPOValue,
      remainingBalance,
    };
  }, [purchaseOrders]);

  // Filtering Logic
  const filteredPOs = useMemo(() => {
    const list = purchaseOrders.filter((po) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.poRequester.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProject = projectFilter === 'ALL' || po.projectId === projectFilter;
      const matchesStatus = statusFilter === 'ALL' || po.status === statusFilter;

      let matchesExpiry = true;
      if (expiryFilter !== 'ALL') {
        const days = getDaysRemainingCalendar(po.expiryDate);
        if (expiryFilter === '30') matchesExpiry = days !== null && days <= 30 && days >= 0;
        else if (expiryFilter === '60') matchesExpiry = days !== null && days <= 60 && days >= 0;
        else if (expiryFilter === 'EXPIRED') matchesExpiry = (days !== null && days < 0) || po.status === 'Expired';
      }

      return matchesSearch && matchesProject && matchesStatus && matchesExpiry;
    });

    if (statusFilter === 'Expiring Soon') {
      list.sort((a, b) => {
        const daysA = getDaysRemainingCalendar(a.expiryDate) ?? 9999;
        const daysB = getDaysRemainingCalendar(b.expiryDate) ?? 9999;
        return daysA - daysB;
      });
    }

    return list;
  }, [purchaseOrders, searchTerm, projectFilter, statusFilter, expiryFilter]);

  const resetFilters = () => {
    setSearchTerm('');
    setProjectFilter('ALL');
    setStatusFilter('ALL');
    setExpiryFilter('ALL');
  };

  const handleOpenEditModal = (po: PurchaseOrder) => {
    setEditingPo(po);
    setEditPoNumber(po.poNumber);
    setEditRequester(po.poRequester);
    setEditAmountExclGst(po.amountExclGst);
    setEditGstRate(po.gstRate || 18);
    setEditNotes(po.notes || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPo) return;

    updatePO(editingPo.id, {
      poNumber: editPoNumber,
      poRequester: editRequester,
      amountExclGst: editAmountExclGst,
      gstRate: editGstRate,
      amountInclGst: editAmountExclGst * (1 + editGstRate / 100),
      notes: editNotes,
    });

    setEditingPo(null);
  };

  // If viewing a single PO detail page
  const currentViewingPO = purchaseOrders.find((p) => p.id === activePoId);
  if (currentViewingPO) {
    return (
      <PODetailPage
        po={currentViewingPO}
        onBack={() => setActivePoId(null)}
        highlightEmployeeId={highlightEmployeeId}
        initialTab={initialTab}
        onNavigate={onNavigate}
        returnTo={returnTo}
        returnParams={{
          statusFilter: statusFilter !== 'ALL' ? statusFilter : undefined,
          projectFilter: projectFilter !== 'ALL' ? projectFilter : undefined,
          expiryFilter: expiryFilter !== 'ALL' ? expiryFilter : undefined,
          search: searchTerm ? searchTerm : undefined,
          ...returnParams,
        }}
      />
    );
  }

  const canCreate = can('po.create');
  const canEdit = can('po.edit');
  const canClose = can('po.close');

  return (
    <div className="space-y-6 text-xs">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Purchase Orders</h1>
          <p className="text-slate-500 mt-0.5">
            Track purchase orders, expiry dates, financial commitments and project assignments.
          </p>
        </div>

        {canCreate && (
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateModalOpen(true)}
          >
            Add PO
          </Button>
        )}
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Total POs"
          value={summary.totalPOs}
          subtitle="Registered orders"
          icon={<FileText className="w-4 h-4 text-blue-600" />}
          onClick={() => resetFilters()}
          className={statusFilter === 'ALL' && projectFilter === 'ALL' && expiryFilter === 'ALL' ? 'ring-2 ring-blue-500/20 bg-blue-50/20' : ''}
        />
        <StatCard
          title="Active POs"
          value={summary.activePOs}
          subtitle="Nominal status"
          icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
          onClick={() => {
            resetFilters();
            setStatusFilter('Active');
          }}
          className={statusFilter === 'Active' ? 'ring-2 ring-emerald-500/20 bg-emerald-50/20' : ''}
        />
        <StatCard
          title="Expiring Soon"
          value={summary.expiringSoon}
          subtitle={summary.expiringSoonSubtitle}
          secondary={summary.expiringSoonNearest}
          icon={<Clock className="w-4 h-4 text-amber-600" />}
          onClick={() => {
            resetFilters();
            setStatusFilter('Expiring Soon');
          }}
          className={statusFilter === 'Expiring Soon' ? 'ring-2 ring-amber-500/20 bg-amber-50/20' : ''}
        />
        <StatCard
          title="Low Balance"
          value={summary.lowBalance}
          subtitle="< 15% remaining"
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
          onClick={() => {
            resetFilters();
            setStatusFilter('Low Balance');
          }}
          className={statusFilter === 'Low Balance' ? 'ring-2 ring-red-500/20 bg-red-50/20' : ''}
        />
        <StatCard
          title="Total PO Value"
          value={formatINRCompact(summary.totalPOValue)}
          subtitle="Committed amount"
          icon={<DollarSign className="w-4 h-4 text-purple-600" />}
          onClick={() => resetFilters()}
        />
        <StatCard
          title="Remaining Balance"
          value={formatINRCompact(summary.remainingBalance)}
          subtitle="Available for billing"
          icon={<Briefcase className="w-4 h-4 text-indigo-600" />}
          onClick={() => resetFilters()}
        />
      </div>

      {/* 3. SEARCH AND FILTERS */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by PO number, project name, or requester..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* PROJECT FILTER */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-2xs focus:ring-2 focus:ring-blue-600 cursor-pointer"
          >
            <option value="ALL">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* STATUS FILTER */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-2xs focus:ring-2 focus:ring-blue-600 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Expiring Soon">Expiring Soon</option>
            <option value="Low Balance">Low Balance</option>
            <option value="Fully Utilized">Fully Utilized</option>
            <option value="Renewed">Renewed</option>
            <option value="Closed">Closed</option>
          </select>

          {/* EXPIRY FILTER */}
          <select
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-2xs focus:ring-2 focus:ring-blue-600 cursor-pointer"
          >
            <option value="ALL">All Expiry Dates</option>
            <option value="30">Expiring in 30 Days</option>
            <option value="60">Expiring in 60 Days</option>
            <option value="EXPIRED">Expired</option>
          </select>

          {(searchTerm || projectFilter !== 'ALL' || statusFilter !== 'ALL' || expiryFilter !== 'ALL') && (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={resetFilters}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* 4. PO TABLE OR EMPTY STATE */}
      {purchaseOrders.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center justify-center space-y-4 bg-white border-dashed border-slate-300">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <FolderOpen className="w-8 h-8 text-blue-600" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-bold text-slate-900">No purchase orders yet</h3>
            <p className="text-xs text-slate-500">
              Add a purchase order and associate it with a project.
            </p>
          </div>
          {canCreate && (
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setCreateModalOpen(true)}
            >
              Add PO
            </Button>
          )}
        </Card>
      ) : filteredPOs.length === 0 ? (
        <Card className="p-8 text-center space-y-3 bg-white">
          <p className="text-sm font-semibold text-slate-700">No purchase orders match your filter criteria.</p>
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Clear Filters
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 bg-white border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/70 border-b border-slate-200/70">
                <tr>
                  <th className="pl-5 pr-3 py-3">Purchase order</th>
                  <th className="px-3 py-3">Requester</th>
                  <th className="px-3 py-3">Period</th>
                  <th className="px-3 py-3 text-right">PO value</th>
                  <th className="px-3 py-3 w-40">Invoiced</th>
                  <th className="px-3 py-3 text-right">Remaining</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="pl-3 pr-5 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPOs.map((po) => {
                  const daysLeft = getDaysRemainingCalendar(po.expiryDate);
                  const used = po.amountExclGst > 0 ? 1 - po.remainingBalanceExclGst / po.amountExclGst : 0;
                  const countdownText = getExpiryCountdownLabel(po.expiryDate);
                  return (
                    <tr key={po.id} onClick={() => setActivePoId(po.id)} className="cursor-pointer group">
                      <td className="pl-5 pr-3 py-3.5 max-w-80">
                        <div className="font-semibold text-slate-900 group-hover:text-indigo-700 whitespace-nowrap">{po.poNumber}</div>
                        <div className="text-[11px] text-slate-500 truncate">{po.projectName}</div>
                      </td>
                      <td className="px-3 py-3.5 text-slate-700 max-w-40 truncate" title={po.poRequester}>{po.poRequester}</td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="text-slate-700">
                          {formatDate(po.startDate)} – {formatDate(po.expiryDate)}
                        </div>
                        <div className={`text-[11px] font-medium mt-0.5 ${
                          daysLeft !== null && daysLeft >= 0 && daysLeft <= 14 ? 'text-red-600 font-semibold' :
                          daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 ? 'text-amber-700 font-semibold' :
                          daysLeft !== null && daysLeft < 0 ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          {countdownText}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right whitespace-nowrap">
                        <div className="font-medium text-slate-900">{formatINR(po.amountExclGst)}</div>
                        <div className="text-[11px] text-slate-400">
                          {formatINR(po.amountInclGst || po.amountExclGst * 1.18)} incl. GST
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <Meter value={used} tone={used >= 0.85 ? 'warn' : 'brand'} label={`${po.poNumber} invoiced`} />
                          <span className="w-9 text-right text-[11px] text-slate-600">{Math.round(used * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatINR(po.remainingBalanceExclGst)}
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge status={po.status} />
                      </td>
                      <td className="pl-3 pr-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setActivePoId(po.id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            title="View PO"
                            aria-label={`View ${po.poNumber}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEditModal(po)}
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                              title="Edit PO"
                              aria-label={`Edit ${po.poNumber}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canClose && po.status !== 'Closed' && po.status !== 'Renewed' && (
                            <button
                              onClick={() => setClosingPoId(po.id)}
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Close PO (no renewal)"
                              aria-label={`Close ${po.poNumber}`}
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* EDIT PO MODAL */}
      {editingPo && (
        <Modal
          isOpen={!!editingPo}
          onClose={() => setEditingPo(null)}
          title={`Edit Purchase Order (${editingPo.poNumber})`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
            <Input
              label="PO Number *"
              value={editPoNumber}
              onChange={(e) => setEditPoNumber(e.target.value)}
              required
            />
            <Input
              label="PO Requester *"
              value={editRequester}
              onChange={(e) => setEditRequester(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount Excl. GST (₹) *"
                type="number"
                value={editAmountExclGst}
                onChange={(e) => setEditAmountExclGst(Number(e.target.value))}
                required
              />
              <div>
                <label className="block font-medium text-slate-700 mb-1">GST Rate (%)</label>
                <select
                  value={editGstRate}
                  onChange={(e) => setEditGstRate(Number(e.target.value))}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  <option value={18}>18%</option>
                  <option value={12}>12%</option>
                  <option value={5}>5%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Notes / Comments</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setEditingPo(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* CLOSE PO (replaces delete) */}
      {closingPoId && purchaseOrders.find((p) => p.id === closingPoId) && (
        <POCloseModal po={purchaseOrders.find((p) => p.id === closingPoId)!} onClose={() => setClosingPoId(null)} />
      )}

      {/* CREATE PO MODAL */}
      {createModalOpen && (
        <POCreateModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onNavigateToProjects={onNavigate ? () => onNavigate('projects') : undefined}
        />
      )}
    </div>
  );
};
