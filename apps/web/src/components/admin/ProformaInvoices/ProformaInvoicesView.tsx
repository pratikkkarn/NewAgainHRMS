import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { useNotification } from '../../../context/NotificationContext';
import { Card, Button, Badge } from '../../common/UIComponents';
import { formatINR, formatDate } from '../../../lib/utils';
import { PurchaseOrder, AssignedEmployee, ProformaInvoice } from '../../../types/domain';
import { downloadProformaPdf } from '../../../lib/documentDownloader';
import {
  FileSpreadsheet,
  Plus,
  ChevronDown,
  ChevronRight,
  Eye,
  Edit3,
  Share2,
  Download,
  Trash2,
  Calendar,
  Building2,
  UserCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  AlertCircle,
  Mail,
  Briefcase,
} from 'lucide-react';
import { CreateEditProformaModal } from './CreateEditProformaModal';
import { ProformaPreviewModal } from './ProformaPreviewModal';
import { ProformaShareModal } from './ProformaShareModal';

interface ProformaInvoicesViewProps {
  initialPoId?: string;
  highlightEmployeeId?: string;
  onNavigate?: (tab: string, params?: any) => void;
}

export const ProformaInvoicesView: React.FC<ProformaInvoicesViewProps> = ({
  initialPoId,
  highlightEmployeeId,
  onNavigate,
}) => {
  const { purchaseOrders, employees, proformaInvoices, deleteProformaInvoice } = useData();
  const { can } = useRole();
  const canEditProforma = can('proforma.edit');
  const { showToast } = useNotification();

  // Selected PO filter
  const [selectedPoId, setSelectedPoId] = useState<string>(() => {
    if (initialPoId && purchaseOrders.some((p) => p.id === initialPoId)) {
      return initialPoId;
    }
    return purchaseOrders[0]?.id || '';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEmployeeIds, setExpandedEmployeeIds] = useState<Record<string, boolean>>({});
  const [highlightedEmpId, setHighlightedEmpId] = useState<string | null>(null);

  // Sync props for navigation focus
  useEffect(() => {
    if (initialPoId && purchaseOrders.some((p) => p.id === initialPoId)) {
      setSelectedPoId(initialPoId);
    }

    if (highlightEmployeeId) {
      setExpandedEmployeeIds((prev) => ({ ...prev, [highlightEmployeeId]: true }));
      setHighlightedEmpId(highlightEmployeeId);

      const scrollTimer = setTimeout(() => {
        const el = document.getElementById(`prof-emp-row-${highlightEmployeeId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const clearTimer = setTimeout(() => {
        setHighlightedEmpId(null);
      }, 2500);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [initialPoId, highlightEmployeeId, purchaseOrders]);

  // Active Modals State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [targetEmployeeForCreate, setTargetEmployeeForCreate] = useState<AssignedEmployee | undefined>(undefined);
  const [proformaToEdit, setProformaToEdit] = useState<ProformaInvoice | undefined>(undefined);
  const [proformaToPreview, setProformaToPreview] = useState<ProformaInvoice | undefined>(undefined);
  const [proformaToShare, setProformaToShare] = useState<ProformaInvoice | undefined>(undefined);

  // Active PO
  const currentPo = purchaseOrders.find((p) => p.id === selectedPoId) || purchaseOrders[0];

  // Toggle employee row expansion
  const toggleExpand = (empId: string) => {
    setExpandedEmployeeIds((prev) => ({
      ...prev,
      [empId]: !prev[empId],
    }));
  };

  // Filter assigned employees
  const filteredEmployees = useMemo(() => {
    if (!currentPo) return [];
    return currentPo.assignedEmployees.filter((emp) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        emp.employeeName.toLowerCase().includes(q) ||
        emp.employeeId.toLowerCase().includes(q) ||
        emp.designation.toLowerCase().includes(q)
      );
    });
  }, [currentPo, searchQuery]);

  // Map employee ID -> their proformas for this PO
  const proformasByEmployee = useMemo(() => {
    const map: Record<string, ProformaInvoice[]> = {};
    if (!currentPo) return map;

    proformaInvoices.forEach((prof) => {
      if (prof.poId === currentPo.id) {
        if (!map[prof.employeeId]) {
          map[prof.employeeId] = [];
        }
        map[prof.employeeId].push(prof);
      }
    });

    // Sort by createdAt desc
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    return map;
  }, [currentPo, proformaInvoices]);

  // Aggregate stats for this PO
  const stats = useMemo(() => {
    if (!currentPo) return { totalProformas: 0, totalProformaAmount: 0, draftCount: 0, sentCount: 0 };
    const relevant = proformaInvoices.filter((p) => p.poId === currentPo.id);
    return {
      totalProformas: relevant.length,
      totalProformaAmount: relevant.reduce((acc, p) => acc + p.totalAmountInclGst, 0),
      draftCount: relevant.filter((p) => p.status === 'Draft').length,
      sentCount: relevant.filter((p) => p.status === 'Sent').length,
    };
  }, [currentPo, proformaInvoices]);

  return (
    <div className="space-y-6 text-xs font-sans">
      {/* RETURN TO PO LINK (IF NAVIGATED FROM A PO) */}
      {onNavigate && currentPo && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('pos', { poId: currentPo.id })}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition-colors bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs"
          >
            ← Return to PO <strong className="font-mono">{currentPo.poNumber}</strong> Details
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            <span>Proforma Invoices & Pre-Billing</span>
          </h1>
          <p className="text-slate-500 mt-0.5">
            Manage, version, and share milestone-based proforma invoices per assigned employee prior to tax invoice issuance.
          </p>
        </div>

        {/* PO SELECTOR DROPDOWN & ACTIONS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Purchase Order:</span>
            <select
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              className="font-mono font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            >
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.projectName} ({po.status})
                </option>
              ))}
            </select>
          </div>

          {canEditProforma && currentPo && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                setTargetEmployeeForCreate(undefined);
                setProformaToEdit(undefined);
                setCreateModalOpen(true);
              }}
            >
              Create Proforma
            </Button>
          )}
        </div>
      </div>

      {/* PO CONTEXT STRIP & PROFORMA STATS */}
      {currentPo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3.5 border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Active PO Contract
            </span>
            <div className="font-bold font-mono text-slate-900 text-sm">{currentPo.poNumber}</div>
            <div className="text-[11px] text-slate-500 truncate">{currentPo.projectName}</div>
          </Card>

          <Card className="p-3.5 border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Assigned Workforce
            </span>
            <div className="text-base font-bold text-slate-900">
              {currentPo.assignedEmployees.length} Tagged Resource{currentPo.assignedEmployees.length === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-slate-500">
              {currentPo.assignedEmployees.filter((e) => e.status === 'Active').length} Active Delivery
            </div>
          </Card>

          <Card className="p-3.5 border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Proforma Pipeline
            </span>
            <div className="text-base font-bold font-mono text-indigo-700">
              {stats.totalProformas} Proforma{stats.totalProformas === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-slate-500">
              {stats.draftCount} Draft · {stats.sentCount} Dispatched
            </div>
          </Card>

          <Card className="p-3.5 bg-indigo-50/60 border-indigo-200">
            <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">
              Remaining PO Balance
            </span>
            <div className="text-base font-black font-mono text-indigo-950">
              {formatINR(currentPo.remainingBalanceExclGst)}
            </div>
            <div className="text-[10px] text-indigo-700 font-medium">
              Proformas do not deduct PO balance
            </div>
          </Card>
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assigned employees by name, ID, or designation..."
            className="w-full text-xs bg-transparent focus:outline-none"
          />
        </div>

        <div className="text-[11px] text-slate-500 font-medium pr-2">
          Showing <strong>{filteredEmployees.length}</strong> of {currentPo?.assignedEmployees.length || 0} employees
        </div>
      </div>

      {/* MAIN ASSIGNED WORKFORCE TO PO TABLE (MATCHING UX REFERENCE) */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3">Employee Name</th>
                <th className="p-3">Designation</th>
                <th className="p-3 text-right">Billing Rate / Mo</th>
                <th className="p-3">Assignment Period</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No assigned employees found for this Purchase Order.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const isExpanded = !!expandedEmployeeIds[emp.employeeId];
                  const empProformas = proformasByEmployee[emp.employeeId] || [];

                  const today = new Date().toISOString().split('T')[0];
                  const isExpired = Boolean(emp.assignedTo && today > emp.assignedTo);
                  const isInactive = emp.status === 'Inactive' || emp.status === 'Unassigned' || isExpired;

                  const methodLabel =
                    emp.billableDaysMethod === 'working_days'
                      ? 'Working Days'
                      : emp.billableDaysMethod === 'manual'
                      ? `Manual (${emp.manualBillableDays || 0}d)`
                      : 'Calendar Days';

                  const empEmail = emp.email || employees.find((e) => e.employeeId === emp.employeeId)?.email;

                  return (
                    <React.Fragment key={emp.employeeId}>
                      {/* MAIN EMPLOYEE ROW */}
                      <tr
                        id={`prof-emp-row-${emp.employeeId}`}
                        className={`transition-all duration-500 ${
                          highlightedEmpId === emp.employeeId
                            ? 'bg-purple-100/90 ring-2 ring-purple-500 border-purple-400 font-medium animate-pulse shadow-sm'
                            : isExpanded
                            ? 'bg-indigo-50/30 font-medium'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(emp.employeeId)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer transition-colors"
                            title={isExpanded ? 'Collapse proformas' : 'Expand proformas'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        <td className="p-3">
                          <div className="font-semibold text-slate-900 whitespace-nowrap">{emp.employeeName}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 whitespace-nowrap">
                            <span>{emp.employeeId}</span>
                            {empEmail && (
                              <>
                                <span className="text-slate-300">·</span>
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span className="truncate max-w-44">{empEmail}</span>
                              </>
                            )}
                          </div>
                        </td>

                                                <td className="p-3 text-slate-600 max-w-44 truncate" title={emp.designation}>{emp.designation}</td>

                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="font-medium text-slate-900">{formatINR(emp.billingRatePerMonth)}</div>
                          <div className="text-[11px] text-slate-400">{methodLabel}</div>
                        </td>

                        <td className="p-3 text-slate-600 whitespace-nowrap">
                          <div>{formatDate(emp.assignedFrom)}</div>
                          <div className="text-[11px] text-slate-400">to {formatDate(emp.assignedTo)}</div>
                        </td>



                        <td className="p-3">
                          {isInactive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Inactive
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (onNavigate && currentPo) {
                                  onNavigate('po-tracker', {
                                    poId: currentPo.id,
                                    highlightEmployeeId: emp.employeeId,
                                    initialTab: 'employees',
                                  });
                                } else {
                                  showToast('Navigation Error', 'Target Purchase Order could not be located.', 'error');
                                }
                              }}
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer transition-colors"
                              title="View PO assignment for this employee"
                              aria-label={`View PO assignment for ${emp.employeeName}`}
                            >
                              <Briefcase className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleExpand(emp.employeeId)}
                              className="text-slate-600 hover:text-slate-900 text-xs font-medium cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            >
                              <span>{empProformas.length} Proforma{empProformas.length === 1 ? '' : 's'}</span>
                            </button>

                            {canEditProforma && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetEmployeeForCreate(emp);
                                  setProformaToEdit(undefined);
                                  setCreateModalOpen(true);
                                }}
                                className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 cursor-pointer transition-colors"
                                title={`Create a proforma for ${emp.employeeName}`}
                                aria-label={`Create a proforma for ${emp.employeeName}`}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDABLE SECTION: LIST OF PROFORMA INVOICES FOR THIS EMPLOYEE */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-indigo-100">
                          <td colSpan={7} className="p-3 pl-12 pr-6">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                                  <span className="font-bold text-slate-800 text-xs">
                                    Proforma Invoices for {emp.employeeName}
                                  </span>
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                                    {empProformas.length} Total
                                  </span>
                                </div>

                                {canEditProforma && empProformas.length > 0 && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      setTargetEmployeeForCreate(emp);
                                      setProformaToEdit(undefined);
                                      setCreateModalOpen(true);
                                    }}
                                  >
                                    + Add Another Proforma
                                  </Button>
                                )}
                              </div>

                              {empProformas.length === 0 ? (
                                <div className="p-6 text-center text-slate-500 text-xs">
                                  No proforma invoices generated for this employee yet.
                                </div>
                              ) : (
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                    <tr>
                                      <th className="p-2.5 pl-4">Proforma No.</th>
                                      <th className="p-2.5">Billing Period</th>
                                      <th className="p-2.5">Version</th>
                                      <th className="p-2.5 text-right">Amount (Excl. GST)</th>
                                      <th className="p-2.5 text-right">GST (18%)</th>
                                      <th className="p-2.5 text-right">Total (Incl. GST)</th>
                                      <th className="p-2.5">Status</th>
                                      <th className="p-2.5 text-right pr-4">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {empProformas.map((prof) => (
                                      <tr key={prof.id} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="p-2.5 pl-4 font-mono font-bold text-indigo-700">
                                          {prof.proformaNumber}
                                        </td>

                                        <td className="p-2.5 text-slate-700">
                                          <div>{formatDate(prof.billingPeriodStart)} – {formatDate(prof.billingPeriodEnd)}</div>
                                          <div className="text-[10px] text-slate-400">
                                            {prof.billingMonth} {prof.billingYear}
                                          </div>
                                        </td>

                                        <td className="p-2.5">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                            v{prof.version}
                                          </span>
                                        </td>

                                        <td className="p-2.5 text-right font-mono text-slate-700 tabular-nums">
                                          {formatINR(prof.amountExclGst)}
                                        </td>

                                        <td className="p-2.5 text-right font-mono text-slate-500 tabular-nums">
                                          {formatINR(prof.gstAmount)}
                                        </td>

                                        <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                                          {formatINR(prof.totalAmountInclGst)}
                                        </td>

                                        <td className="p-2.5">
                                          <Badge status={prof.status} />
                                        </td>

                                        <td className="p-2.5 text-right pr-4">
                                          <div className="flex items-center justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => setProformaToPreview(prof)}
                                              className="p-1 text-slate-600 hover:text-indigo-600 rounded cursor-pointer"
                                              title="View & Preview Proforma"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                            </button>

                                            {canEditProforma && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setProformaToEdit(prof);
                                                  setTargetEmployeeForCreate(undefined);
                                                  setCreateModalOpen(true);
                                                }}
                                                className="p-1 text-slate-600 hover:text-indigo-600 rounded cursor-pointer"
                                                title="Edit Draft or Create Revision"
                                              >
                                                <Edit3 className="w-3.5 h-3.5" />
                                              </button>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => setProformaToShare(prof)}
                                              className="p-1 text-slate-600 hover:text-indigo-600 rounded cursor-pointer"
                                              title="Share Proforma"
                                            >
                                              <Share2 className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => downloadProformaPdf(prof)}
                                              className="p-1 text-slate-600 hover:text-indigo-600 rounded cursor-pointer"
                                              title="Download PDF"
                                            >
                                              <Download className="w-3.5 h-3.5" />
                                            </button>

                                            {canEditProforma && prof.status === 'Draft' && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (window.confirm(`Delete draft proforma ${prof.proformaNumber}?`)) {
                                                    deleteProformaInvoice(prof.id);
                                                  }
                                                }}
                                                className="p-1 text-red-500 hover:text-red-700 rounded cursor-pointer"
                                                title="Delete Draft"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL 1: CREATE / EDIT PROFORMA */}
      {createModalOpen && currentPo && (
        <CreateEditProformaModal
          po={currentPo}
          employee={targetEmployeeForCreate}
          proformaToEdit={proformaToEdit}
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setProformaToEdit(undefined);
            setTargetEmployeeForCreate(undefined);
          }}
          onSuccess={(saved) => {
            // Auto expand employee row so the user sees the new proforma immediately
            setExpandedEmployeeIds((prev) => ({ ...prev, [saved.employeeId]: true }));
          }}
        />
      )}

      {/* MODAL 2: PREVIEW PROFORMA */}
      {proformaToPreview && currentPo && (
        <ProformaPreviewModal
          proforma={proformaToPreview}
          po={purchaseOrders.find((p) => p.id === proformaToPreview.poId) || currentPo}
          isOpen={!!proformaToPreview}
          onClose={() => setProformaToPreview(undefined)}
          onEdit={(prof) => {
            setProformaToPreview(undefined);
            setProformaToEdit(prof);
            setCreateModalOpen(true);
          }}
          onShare={(prof) => {
            setProformaToPreview(undefined);
            setProformaToShare(prof);
          }}
        />
      )}

      {/* MODAL 3: SHARE PROFORMA */}
      {proformaToShare && (
        <ProformaShareModal
          proforma={proformaToShare}
          isOpen={!!proformaToShare}
          onClose={() => setProformaToShare(undefined)}
        />
      )}
    </div>
  );
};
