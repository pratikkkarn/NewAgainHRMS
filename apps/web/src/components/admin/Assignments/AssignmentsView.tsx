import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { useNotification } from '../../../context/NotificationContext';
import { Assignment, AssignmentStatus } from '../../../types/domain';
import { formatDate, formatINR } from '../../../lib/utils';
import { validateEmployeeAllocation, getValidPoForProject, getTargetProjectForEmployee } from '../../../lib/assignmentUtils';
import {
  Users,
  Briefcase,
  UserCheck,
  Clock,
  Search,
  Filter,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  AlertTriangle,
  Building,
  FileText,
  UserPlus,
  ShieldAlert,
  ArrowRight,
  UserX,
} from 'lucide-react';
import { TerminateAssignmentModal } from './TerminateAssignmentModal';

const STORAGE_KEYS_ASSIGNMENTS = 'primestar_employee_assignments';

export const AssignmentsView: React.FC = () => {
  const {
    purchaseOrders,
    projects,
    employees,
    assignEmployeeToPO,
    unassignEmployeeFromPO,
  } = useData();
  const { permissions } = useRole();
  const { showToast } = useNotification();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('All');
  const [selectedPoFilter, setSelectedPoFilter] = useState('All');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');

  // Helper to normalize legacy project IDs to match active projects
  const normalizeAssignmentProjectIds = (list: Assignment[]): Assignment[] => {
    const projectMap: Record<string, string> = {
      'proj-1': 'proj-hdfc-01',
      'proj-2': 'proj-infy-02',
      'proj-3': 'proj-hdfc-01',
    };
    return list.map((a) => {
      if (a.projectId && projectMap[a.projectId]) {
        return { ...a, projectId: projectMap[a.projectId] };
      }
      return a;
    });
  };

  // Master Assignments State with localStorage Persistence
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS_ASSIGNMENTS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeAssignmentProjectIds(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading assignments from localStorage:', e);
    }
    // Default seed assignments if not stored
    return normalizeAssignmentProjectIds([
      {
        id: 'asgn-101',
        employeeId: 'PS-108',
        employeeName: 'Rohan Deshmukh',
        designation: 'Senior Cloud Architect',
        department: 'Technology Consulting',
        projectId: 'proj-hdfc-01',
        projectName: 'HDFC Bank Core Cloud Migration',
        poId: 'po-101',
        poNumber: 'PO/2025/HDFC/001',
        assignedFrom: '2025-01-01',
        assignedTo: '2026-12-31',
        allocationPercentage: 100,
        billingRatePerMonth: 250000,
        status: 'Active',
        notes: 'Lead cloud architect responsible for AWS/GCP landing zone and containerization.',
      },
      {
        id: 'asgn-102',
        employeeId: 'PS-112',
        employeeName: 'Megha Kulkarni',
        designation: 'DevOps Lead Engineer',
        department: 'Cloud Infrastructure',
        projectId: 'proj-hdfc-01',
        projectName: 'HDFC Bank Core Cloud Migration',
        poId: 'po-101',
        poNumber: 'PO/2025/HDFC/001',
        assignedFrom: '2025-01-01',
        assignedTo: '2026-12-31',
        allocationPercentage: 100,
        billingRatePerMonth: 200000,
        status: 'Active',
        notes: 'CI/CD pipeline automation and Terraform IaC delivery.',
      },
      {
        id: 'asgn-103',
        employeeId: 'PS-015',
        employeeName: 'Siddharth Mehta',
        designation: 'Delivery Director — Cloud & Analytics',
        department: 'Consulting Delivery',
        projectId: 'proj-infy-02',
        projectName: 'Infosys Finacle AI Modernization',
        poId: 'po-102',
        poNumber: 'PO/2025/INFY/0032',
        assignedFrom: '2025-02-01',
        assignedTo: '2026-06-30',
        allocationPercentage: 50,
        billingRatePerMonth: 180000,
        status: 'Active',
        notes: 'Executive delivery oversight & client escalation management.',
      },
      {
        id: 'asgn-104',
        employeeId: 'PS-022',
        employeeName: 'Kavita Nair',
        designation: 'PO & Billing Operations Lead',
        department: 'Operations',
        projectId: 'proj-infy-02',
        projectName: 'Infosys Finacle AI Modernization',
        poId: 'po-102',
        poNumber: 'PO/2025/INFY/0032',
        assignedFrom: '2025-02-01',
        assignedTo: '2025-11-30',
        allocationPercentage: 50,
        billingRatePerMonth: 125000,
        status: 'Active',
        notes: 'Invoicing & milestone billing governance.',
      },
      {
        id: 'asgn-105',
        employeeId: 'PS-034',
        employeeName: 'Ananya Roy',
        designation: 'HR Onboarding Specialist',
        department: 'Human Resources',
        projectId: 'proj-hdfc-01',
        projectName: 'HDFC Bank Core Cloud Migration',
        assignedFrom: '2025-01-01',
        assignedTo: '2025-10-31',
        allocationPercentage: 100,
        status: 'Ending Soon',
        notes: 'Consultant staffing & onboarding coordination.',
      },
    ]);
  });

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [deleteConfirmAssignment, setDeleteConfirmAssignment] = useState<Assignment | null>(null);
  const [terminateTargetAssignment, setTerminateTargetAssignment] = useState<Assignment | null>(null);

  // Form Fields State
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formPoId, setFormPoId] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formAssignedFrom, setFormAssignedFrom] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formAllocationPercentage, setFormAllocationPercentage] = useState<string>('100');
  const [formBillingRate, setFormBillingRate] = useState<string>('');
  const [formStatus, setFormStatus] = useState<AssignmentStatus>('Active');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Persist Assignments to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS_ASSIGNMENTS, JSON.stringify(assignments));
    } catch (e) {
      console.error('Error persisting assignments to localStorage:', e);
    }
  }, [assignments]);

  // Unique list of designations for filter dropdown
  const uniqueDesignations = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => {
      if (a.designation) set.add(a.designation);
    });
    return Array.from(set);
  }, [assignments]);

  // Filtered Assignments List
  const filteredAssignments = useMemo(() => {
    return assignments.filter((asgn) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mName = asgn.employeeName.toLowerCase().includes(q);
        const mEmpId = asgn.employeeId.toLowerCase().includes(q);
        const mDesig = asgn.designation.toLowerCase().includes(q);
        const mProj = asgn.projectName.toLowerCase().includes(q);
        const mPo = asgn.poNumber?.toLowerCase().includes(q) || false;
        if (!mName && !mEmpId && !mDesig && !mProj && !mPo) return false;
      }

      // 2. Project Filter
      if (selectedProjectFilter !== 'All' && asgn.projectId !== selectedProjectFilter) {
        return false;
      }

      // 3. PO Filter
      if (selectedPoFilter !== 'All' && asgn.poId !== selectedPoFilter) {
        return false;
      }

      // 4. Role Filter
      if (selectedRoleFilter !== 'All' && asgn.designation !== selectedRoleFilter) {
        return false;
      }

      // 5. Status Filter
      if (selectedStatusFilter !== 'All' && asgn.status !== selectedStatusFilter) {
        return false;
      }

      return true;
    });
  }, [
    assignments,
    searchQuery,
    selectedProjectFilter,
    selectedPoFilter,
    selectedRoleFilter,
    selectedStatusFilter,
  ]);

  // Metrics Calculations
  const totalAssignmentsCount = assignments.length;
  const activeAssignmentsCount = assignments.filter((a) => a.status === 'Active').length;

  // Distinct assigned employees count
  const distinctAssignedEmployeesCount = useMemo(() => {
    const activeSet = new Set<string>();
    assignments.forEach((a) => {
      if (a.status === 'Active') activeSet.add(a.employeeId);
    });
    return activeSet.size;
  }, [assignments]);

  // Ending Soon count (expiry within 30 days or status 'Ending Soon')
  const endingSoonCount = useMemo(() => {
    const now = new Date().getTime();
    return assignments.filter((a) => {
      if (a.status === 'Ending Soon') return true;
      if (a.status !== 'Active' || !a.assignedTo) return false;
      const end = new Date(a.assignedTo).getTime();
      const diffDays = (end - now) / (1000 * 3600 * 24);
      return diffDays >= 0 && diffDays <= 30;
    }).length;
  }, [assignments]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    const initialEmpId = employees[0]?.employeeId || '';
    setEditingAssignment(null);
    setFormEmployeeId(initialEmpId);

    const projResolution = getTargetProjectForEmployee({
      employeeId: initialEmpId,
      assignments,
      currentProjectId: projects[0]?.id || '',
      defaultProjectId: projects[0]?.id || '',
      employees,
      projects,
    });

    setFormProjectId(projResolution.projectId);
    setFormPoId('');
    setFormDesignation(employees[0]?.designation || '');
    setFormAssignedFrom(new Date().toISOString().split('T')[0]);

    // Default end date 1 year out
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setFormAssignedTo(nextYear.toISOString().split('T')[0]);

    setFormAllocationPercentage('100');
    setFormBillingRate('');
    setFormStatus('Active');
    setFormNotes('');
    setFormError(null);
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (asgn: Assignment) => {
    setEditingAssignment(asgn);
    setFormEmployeeId(asgn.employeeId);
    setFormProjectId(asgn.projectId);
    setFormPoId(asgn.poId || '');
    setFormDesignation(asgn.designation || '');
    setFormAssignedFrom(asgn.assignedFrom);
    setFormAssignedTo(asgn.assignedTo);
    setFormAllocationPercentage(
      asgn.allocationPercentage !== undefined ? String(asgn.allocationPercentage) : '100'
    );
    setFormBillingRate(asgn.billingRatePerMonth ? String(asgn.billingRatePerMonth) : '');
    setFormStatus(asgn.status);
    setFormNotes(asgn.notes || '');
    setFormError(null);
    setModalOpen(true);
  };

  // Handle Employee Change in Form to auto-populate designation and target project
  const handleEmployeeChange = (empId: string) => {
    setFormEmployeeId(empId);
    const selectedEmp = employees.find((e) => e.employeeId === empId);
    if (selectedEmp) {
      setFormDesignation(selectedEmp.designation);
    }

    // Auto-sync target project for selected employee
    const projResolution = getTargetProjectForEmployee({
      employeeId: empId,
      assignments,
      currentProjectId: formProjectId,
      defaultProjectId: projects[0]?.id || '',
      employees,
      projects,
      editingAssignmentId: editingAssignment?.id,
    });

    setFormProjectId(projResolution.projectId);
    const validPo = getValidPoForProject(formPoId, projResolution.projectId, purchaseOrders);
    setFormPoId(validPo);
  };

  // Handle Project Change in Form: clear or preserve PO based on project validity
  const handleProjectChange = (newProjId: string) => {
    setFormProjectId(newProjId);
    const validPo = getValidPoForProject(formPoId, newProjId, purchaseOrders);
    setFormPoId(validPo);
  };

  // Available POs for selected project in form
  const availablePosForSelectedProject = useMemo(() => {
    if (!formProjectId) return [];
    return purchaseOrders.filter((po) => po.projectId === formProjectId);
  }, [purchaseOrders, formProjectId]);

  // Form Submission & Validation
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Validation: Required fields
    if (!formEmployeeId) {
      setFormError('Please select an employee.');
      return;
    }
    if (!formProjectId) {
      setFormError('Please select a target project.');
      return;
    }
    if (!formAssignedFrom || !formAssignedTo) {
      setFormError('Assignment Start Date and End Date are required.');
      return;
    }

    // 2. Validation: Dates
    const start = new Date(formAssignedFrom).getTime();
    const end = new Date(formAssignedTo).getTime();
    if (isNaN(start) || isNaN(end)) {
      setFormError('Invalid date format provided.');
      return;
    }
    if (end < start) {
      setFormError('Assignment End Date cannot be earlier than the Start Date.');
      return;
    }

    // 3. Validation: Numeric Allocation Percentage
    const numericAllocation = parseInt(formAllocationPercentage, 10);
    if (
      !formAllocationPercentage ||
      isNaN(numericAllocation) ||
      numericAllocation <= 0 ||
      numericAllocation > 100
    ) {
      setFormError('Allocation percentage must be a valid number greater than 0% and at most 100%.');
      return;
    }

    const targetEmp = employees.find((e) => e.employeeId === formEmployeeId);
    const empName = targetEmp ? targetEmp.name : 'Selected Employee';
    const targetProj = projects.find((p) => p.id === formProjectId);
    const projName = targetProj ? targetProj.name : 'Selected Project';
    const targetPo = purchaseOrders.find((p) => p.id === formPoId && p.projectId === formProjectId);

    // 4. Validation: Duplicate active assignment for same employee & project
    if (formStatus === 'Active') {
      const duplicateExists = assignments.some((a) => {
        if (editingAssignment && a.id === editingAssignment.id) return false;
        return (
          a.employeeId === formEmployeeId &&
          a.projectId === formProjectId &&
          a.status === 'Active'
        );
      });

      if (duplicateExists) {
        setFormError(
          `Employee ${empName} already has an active assignment on project "${projName}". To update details, edit the existing active assignment.`
        );
        return;
      }
    }

    // 5. Validation: Enforce 100% active allocation cap across simultaneous active assignments
    const allocationValidation = validateEmployeeAllocation({
      employeeId: formEmployeeId,
      employeeName: empName,
      requestedAllocation: numericAllocation,
      assignments,
      editingAssignmentId: editingAssignment?.id,
      status: formStatus,
      assignedFrom: formAssignedFrom,
      assignedTo: formAssignedTo,
    });

    if (!allocationValidation.valid) {
      setFormError(allocationValidation.error || 'Allocation percentage validation failed.');
      return;
    }

    const billingRateVal = formBillingRate ? parseFloat(formBillingRate) : undefined;
    const calculatedHours = Math.round(160 * (numericAllocation / 100));

    // CREATE OR UPDATE RECORD
    if (editingAssignment) {
      // UPDATE EXISTING
      const updatedRecord: Assignment = {
        ...editingAssignment,
        employeeId: formEmployeeId,
        employeeName: empName,
        designation: formDesignation || targetEmp?.designation || 'Team Member',
        department: targetEmp?.department,
        projectId: formProjectId,
        projectName: projName,
        poId: targetPo?.id,
        poNumber: targetPo?.poNumber,
        assignedFrom: formAssignedFrom,
        assignedTo: formAssignedTo,
        allocationPercentage: numericAllocation,
        allocatedHoursPerMonth: calculatedHours,
        billingRatePerMonth: billingRateVal,
        status: formStatus,
        notes: formNotes,
        updatedAt: new Date().toISOString(),
      };

      setAssignments((prev) =>
        prev.map((a) => (a.id === editingAssignment.id ? updatedRecord : a))
      );

      // If employee changed during edit, unassign previous employee from old PO if no other active assignment remains on that PO
      if (editingAssignment.employeeId !== formEmployeeId && editingAssignment.poId) {
        const oldEmpHasOtherAssignmentOnPo = assignments.some(
          (a) =>
            a.id !== editingAssignment.id &&
            a.employeeId === editingAssignment.employeeId &&
            a.poId === editingAssignment.poId
        );
        if (!oldEmpHasOtherAssignmentOnPo) {
          unassignEmployeeFromPO(editingAssignment.poId, editingAssignment.employeeId);
        }
      }

      // Synchronize PO tag for new employee
      if (targetPo) {
        assignEmployeeToPO(targetPo.id, {
          employeeId: formEmployeeId,
          employeeName: empName,
          designation: formDesignation || targetEmp?.designation || 'Team Member',
          billingRatePerMonth: billingRateVal || 0,
          assignedFrom: formAssignedFrom,
          assignedTo: formAssignedTo,
        });
      }

      showToast(
        'Assignment Updated',
        `Updated project assignment for ${empName} on ${projName}.`
      );
    } else {
      // CREATE NEW
      const newRecord: Assignment = {
        id: `asgn-${Date.now()}`,
        employeeId: formEmployeeId,
        employeeName: empName,
        designation: formDesignation || targetEmp?.designation || 'Team Member',
        department: targetEmp?.department,
        projectId: formProjectId,
        projectName: projName,
        poId: targetPo?.id,
        poNumber: targetPo?.poNumber,
        assignedFrom: formAssignedFrom,
        assignedTo: formAssignedTo,
        allocationPercentage: numericAllocation,
        allocatedHoursPerMonth: calculatedHours,
        billingRatePerMonth: billingRateVal,
        status: formStatus,
        notes: formNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setAssignments((prev) => [newRecord, ...prev]);

      // Synchronize PO tag
      if (targetPo) {
        assignEmployeeToPO(targetPo.id, {
          employeeId: formEmployeeId,
          employeeName: empName,
          designation: formDesignation || targetEmp?.designation || 'Team Member',
          billingRatePerMonth: billingRateVal || 0,
          assignedFrom: formAssignedFrom,
          assignedTo: formAssignedTo,
        });
      }

      showToast('Employee Assigned', `${empName} assigned to ${projName}.`);
    }

    setModalOpen(false);
  };

  // Quick Change Status
  const handleStatusChange = (asgnId: string, newStatus: AssignmentStatus) => {
    const target = assignments.find((a) => a.id === asgnId);
    if (!target) return;

    setAssignments((prev) =>
      prev.map((a) => (a.id === asgnId ? { ...a, status: newStatus } : a))
    );

    showToast(
      'Status Updated',
      `Assignment for ${target.employeeName} changed to ${newStatus}.`
    );
  };

  // Remove / Unassign Confirm
  const handleRemoveConfirm = () => {
    if (!deleteConfirmAssignment) return;
    const target = deleteConfirmAssignment;

    setAssignments((prev) => prev.filter((a) => a.id !== target.id));

    if (target.poId) {
      unassignEmployeeFromPO(target.poId, target.employeeId);
    }

    showToast(
      'Assignment Removed',
      `Unassigned ${target.employeeName} from ${target.projectName}.`
    );

    setDeleteConfirmAssignment(null);
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Employee Assignments
              </h1>
              <p className="text-xs text-slate-500">
                Staffing allocations, project deployments, and PO resource governance.
              </p>
            </div>
          </div>
        </div>

        {permissions.canAssignEmployeesToPO ? (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer hover:shadow-md"
          >
            <UserPlus className="w-4 h-4" />
            <span>Assign Employee</span>
          </button>
        ) : (
          <div className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-medium border border-slate-200 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <span>Read-Only View Mode</span>
          </div>
        )}
      </div>

      {/* SUMMARY CARDS METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Assignments */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Assignments</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalAssignmentsCount}</div>
            <span className="text-[11px] text-blue-600 font-semibold mt-1 inline-block">
              Across all client projects
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>

        {/* Active Assignments */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Active Deployments</span>
            <div className="text-2xl font-black text-emerald-900 mt-1">
              {activeAssignmentsCount}
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">
              Currently active allocations
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Assigned Employees */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Assigned Employees</span>
            <div className="text-2xl font-black text-indigo-900 mt-1">
              {distinctAssignedEmployeesCount}
            </div>
            <span className="text-[11px] text-indigo-600 font-semibold mt-1 inline-block">
              Unique team members
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Ending Soon */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Ending Soon</span>
            <div className="text-2xl font-black text-amber-900 mt-1">{endingSoonCount}</div>
            <span className="text-[11px] text-amber-600 font-semibold mt-1 inline-block">
              Ending within 30 days
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee, ID, project, PO number, or role..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Project Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium shrink-0">Project:</span>
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[140px] truncate"
              >
                <option value="All">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* PO Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium shrink-0">PO:</span>
              <select
                value={selectedPoFilter}
                onChange={(e) => setSelectedPoFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[130px] truncate"
              >
                <option value="All">All POs</option>
                {purchaseOrders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNumber}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium shrink-0">Role:</span>
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[130px] truncate"
              >
                <option value="All">All Roles</option>
                {uniqueDesignations.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium shrink-0">Status:</span>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Ending Soon">Ending Soon</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            Showing <strong className="text-slate-900">{filteredAssignments.length}</strong> of{' '}
            <strong className="text-slate-900">{assignments.length}</strong> assignments
          </span>
          {(searchQuery ||
            selectedProjectFilter !== 'All' ||
            selectedPoFilter !== 'All' ||
            selectedRoleFilter !== 'All' ||
            selectedStatusFilter !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedProjectFilter('All');
                setSelectedPoFilter('All');
                setSelectedRoleFilter('All');
                setSelectedStatusFilter('All');
              }}
              className="text-blue-600 hover:underline font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ASSIGNMENTS TABLE CONTAINER */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="pl-5 pr-3 py-3">Employee</th>
                <th className="px-3 py-3">Project & PO</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Period</th>
                <th className="px-3 py-3">Allocation</th>
                <th className="px-3 py-3">Status</th>
                <th className="pl-3 pr-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <Users className="w-6 h-6" />
                      </div>
                      <span className="font-bold text-slate-800 text-sm">
                        No Assignments Found
                      </span>
                      <p className="text-xs text-slate-500 max-w-sm">
                        No employee assignment records match your filter criteria. Try adjusting your search query or assign a team member.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((asgn) => (
                  <tr key={asgn.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Employee Details */}
                    <td className="pl-5 pr-3 py-3.5 font-medium text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 font-semibold flex items-center justify-center text-[11px] shrink-0">
                          {asgn.employeeName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 whitespace-nowrap">{asgn.employeeName}</div>
                          <div className="text-[11px] text-slate-500 whitespace-nowrap truncate max-w-44">
                            {asgn.employeeId}
                            {asgn.department ? ` · ${asgn.department}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Project & Linked PO */}
                    <td className="px-3 py-3.5 text-slate-800 max-w-56">
                      <div className="font-semibold text-slate-900 truncate" title={asgn.projectName}>{asgn.projectName}</div>
                      {asgn.poNumber ? (
                        <div className="text-[11px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5">
                          <FileText className="w-3 h-3 shrink-0" />
                          <span>{asgn.poNumber}</span>
                        </div>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-amber-700"
                          title="This work is not covered by any PO, so it cannot be invoiced yet"
                        >
                          Unbilled: no PO
                        </span>
                      )}
                    </td>

                    {/* Designation / Role */}
                    <td className="px-3 py-3.5 text-slate-800">
                      <div className="font-medium text-slate-900 max-w-44 truncate" title={asgn.designation}>{asgn.designation}</div>
                      {asgn.billingRatePerMonth && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Rate: {formatINR(asgn.billingRatePerMonth)}/mo
                        </div>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-3 py-3.5 whitespace-nowrap text-slate-700">
                      <div>{formatDate(asgn.assignedFrom)}</div>
                      <div className="text-[11px] text-slate-400">to {formatDate(asgn.assignedTo)}</div>
                    </td>

                    {/* Allocation Percentage Bar */}
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              asgn.allocationPercentage === 100
                                ? 'bg-blue-600'
                                : asgn.allocationPercentage >= 50
                                ? 'bg-indigo-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${asgn.allocationPercentage}%` }}
                          ></div>
                        </div>
                        <span className="font-medium text-slate-700 text-[11px]">
                          {asgn.allocationPercentage}%
                        </span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <select
                        value={asgn.status}
                        onChange={(e) =>
                          handleStatusChange(asgn.id, e.target.value as AssignmentStatus)
                        }
                        disabled={!permissions.canAssignEmployeesToPO}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border cursor-pointer focus:outline-none ${
                          asgn.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : asgn.status === 'Ending Soon'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : asgn.status === 'On Hold'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : asgn.status === 'Completed'
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <option value="Active">Active</option>
                        <option value="Ending Soon">Ending Soon</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                        <option value="Unassigned">Unassigned</option>
                      </select>
                    </td>

                    {/* Actions */}
                    <td className="pl-3 pr-5 py-3.5 text-right whitespace-nowrap">
                      {permissions.canAssignEmployeesToPO ? (
                        <div className="flex items-center justify-end gap-0.5">
                          {/* Edit Action */}
                          <button
                            onClick={() => handleOpenEditModal(asgn)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Assignment"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* End Allocation / Terminate Action */}
                          {asgn.status !== 'Terminated' && (
                            <button
                              onClick={() => setTerminateTargetAssignment(asgn)}
                              className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="End Allocation (Prorated Departure)"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}

                          {/* Unassign / Remove Action */}
                          <button
                            onClick={() => setDeleteConfirmAssignment(asgn)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove Assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Read-Only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT ASSIGNMENT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600 text-white">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingAssignment ? 'Edit Employee Assignment' : 'Assign Employee to Project'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Configure allocation percentage, dates, and PO linkage
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
              {/* Validation Error Banner */}
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{formError}</span>
                </div>
              )}

              {/* Employee & Project Dropdowns Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Select Employee */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Employee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formEmployeeId}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium cursor-pointer"
                  >
                    {employees.map((emp) => (
                      <option key={emp.employeeId} value={emp.employeeId}>
                        {emp.name} ({emp.employeeId}) — {emp.designation}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Project */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Target Project <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formProjectId}
                    onChange={(e) => handleProjectChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="">-- Select Target Project --</option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name} ({proj.clientName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Linked PO & Role/Designation Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Linked Purchase Order (Optional) */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Linked PO (Optional)
                  </label>
                  <select
                    value={formPoId}
                    onChange={(e) => setFormPoId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="">No PO (unbilled until a PO is linked)</option>
                    {availablePosForSelectedProject.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.poNumber} — Excl. GST {formatINR(po.amountExclGst)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role / Designation on Project */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Designation on Project <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formDesignation}
                    onChange={(e) => setFormDesignation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLElement).blur();
                      }
                    }}
                    placeholder="e.g. Senior Cloud Architect"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                  />
                </div>
              </div>

              {/* Start Date & End Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formAssignedFrom}
                    onChange={(e) => setFormAssignedFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formAssignedTo}
                    onChange={(e) => setFormAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                  />
                </div>
              </div>

              {/* Allocation Percentage & Billing Rate Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Allocation Percentage (%) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formAllocationPercentage}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*$/.test(val)) {
                          setFormAllocationPercentage(val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLElement).blur();
                        }
                      }}
                      onBlur={() => {
                        if (formAllocationPercentage && formAllocationPercentage.trim() !== '') {
                          const parsed = parseInt(formAllocationPercentage, 10);
                          if (!isNaN(parsed)) {
                            if (parsed > 100) setFormAllocationPercentage('100');
                            else if (parsed < 1) setFormAllocationPercentage('1');
                            else setFormAllocationPercentage(String(parsed));
                          }
                        }
                      }}
                      placeholder="100"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium font-mono"
                    />
                    <span className="font-bold text-slate-600 text-sm">%</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Monthly Billing Rate (₹ / Month)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 200000"
                    value={formBillingRate}
                    onChange={(e) => setFormBillingRate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLElement).blur();
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium font-mono"
                  />
                </div>
              </div>

              {/* Assignment Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Assignment Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as AssignmentStatus)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium cursor-pointer"
                >
                  <option value="Active">Active</option>
                  <option value="Ending Soon">Ending Soon</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                  <option value="Unassigned">Unassigned</option>
                </select>
              </div>

              {/* Notes / Responsibilities */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Responsibilities / Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Key deliverables, client scope, or staffing terms..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  {editingAssignment ? 'Save Assignment Changes' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVE / UNASSIGN CONFIRMATION MODAL */}
      {deleteConfirmAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Untag Employee?</h3>
                <p className="text-xs text-slate-500">Confirm resource unassignment</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to remove{' '}
              <strong className="text-slate-900">{deleteConfirmAssignment.employeeName}</strong> from PO{' '}
              <strong className="text-slate-900">{deleteConfirmAssignment.poNumber || deleteConfirmAssignment.projectName}</strong>? This will remove their current assignment to this purchase order.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmAssignment(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                No, Cancel
              </button>
              <button
                onClick={handleRemoveConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer"
              >
                Yes, Untag Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TERMINATE ASSIGNMENT MODAL */}
      {terminateTargetAssignment && (
        <TerminateAssignmentModal
          assignment={terminateTargetAssignment}
          isOpen={!!terminateTargetAssignment}
          onClose={() => setTerminateTargetAssignment(null)}
        />
      )}
    </div>
  );
};
