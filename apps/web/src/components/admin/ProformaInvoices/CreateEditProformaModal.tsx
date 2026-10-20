import React, { useState, useEffect } from 'react';
import { useData } from '../../../context/DataContext';
import { Modal, Input, Button } from '../../common/UIComponents';
import { PurchaseOrder, AssignedEmployee, ProformaInvoice, ProformaLineItem, BillableDaysMethod } from '../../../types/domain';
import { calculateCalendarDays, calculateWorkingDays } from '../../../lib/assignmentUtils';
import { formatINR } from '../../../lib/utils';
import { AlertTriangle, Plus, Trash2, FileCheck, CheckCircle2, Info, ArrowRight, Eye } from 'lucide-react';
import { ProformaPreviewModal } from './ProformaPreviewModal';

interface CreateEditProformaModalProps {
  po: PurchaseOrder;
  employee?: AssignedEmployee;
  proformaToEdit?: ProformaInvoice;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (proforma: ProformaInvoice) => void;
}

export const CreateEditProformaModal: React.FC<CreateEditProformaModalProps> = ({
  po,
  employee,
  proformaToEdit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { employees, proformaInvoices, addProformaInvoice, updateProformaInvoice, updateEmployeeEmail } = useData();

  // Selected employee ID
  const [selectedEmpId, setSelectedEmpId] = useState(
    proformaToEdit?.employeeId || employee?.employeeId || (po.assignedEmployees[0]?.employeeId || '')
  );

  const selectedAssigned = po.assignedEmployees.find((e) => e.employeeId === selectedEmpId);
  const selectedEmpProfile = employees.find((e) => e.employeeId === selectedEmpId);

  // Form Fields
  const [proformaNumber, setProformaNumber] = useState('');
  const [billingMonth, setBillingMonth] = useState('October');
  const [billingYear, setBillingYear] = useState(2026);
  const [billingPeriodStart, setBillingPeriodStart] = useState('');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState('');
  const [billableDaysMethod, setBillableDaysMethod] = useState<BillableDaysMethod>('working_days');
  const [manualBillableDays, setManualBillableDays] = useState<number | ''>('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<ProformaLineItem[]>([]);
  const [gstRate, setGstRate] = useState<number>(po.gstRate || 18);

  // Live Unsaved Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    existingNumber: string;
    existingAmount: number;
    billingPeriod: string;
  } | null>(null);
  const [allowDuplicateBypass, setAllowDuplicateBypass] = useState(false);
  const [error, setError] = useState('');

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Initialize or Reset
  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setDuplicateWarning(null);
    setAllowDuplicateBypass(false);
    setIsPreviewOpen(false);

    if (proformaToEdit) {
      // Edit mode
      setSelectedEmpId(proformaToEdit.employeeId);
      setProformaNumber(proformaToEdit.proformaNumber);
      setBillingMonth(proformaToEdit.billingMonth);
      setBillingYear(proformaToEdit.billingYear);
      setBillingPeriodStart(proformaToEdit.billingPeriodStart);
      setBillingPeriodEnd(proformaToEdit.billingPeriodEnd);
      setBillableDaysMethod(proformaToEdit.billableDaysMethod || 'working_days');
      setManualBillableDays(proformaToEdit.billableDays || '');
      setEmployeeEmail(proformaToEdit.employeeEmail || selectedEmpProfile?.email || '');
      setNotes(proformaToEdit.notes || '');
      setGstRate(proformaToEdit.gstRate || 18);
      setLineItems(
        proformaToEdit.lineItems && proformaToEdit.lineItems.length > 0
          ? proformaToEdit.lineItems
          : [
              {
                id: 'li-1',
                description: `${proformaToEdit.designation} — Milestone deliverables`,
                hsnSac: '998313',
                quantity: proformaToEdit.billableDays || 1,
                rate: proformaToEdit.amountExclGst,
                amount: proformaToEdit.amountExclGst,
              },
            ]
      );
    } else {
      // Create mode
      const empId = employee?.employeeId || po.assignedEmployees[0]?.employeeId || '';
      setSelectedEmpId(empId);

      // Find highest existing numeric suffix across all proformas to guarantee unique sequential number
      let maxNum = 0;
      proformaInvoices.forEach((p) => {
        const match = p.proformaNumber.match(/(\d+)$/);
        if (match) {
          const numVal = parseInt(match[1], 10);
          if (!isNaN(numVal) && numVal > maxNum) {
            maxNum = numVal;
          }
        }
      });
      let nextNum = Math.max(maxNum + 1, proformaInvoices.length + 1);
      while (proformaInvoices.some((p) => p.proformaNumber === `PI/PS/26-27/${String(nextNum).padStart(3, '0')}`)) {
        nextNum++;
      }
      const countPadded = String(nextNum).padStart(3, '0');
      setProformaNumber(`PI/PS/26-27/${countPadded}`);

      const now = new Date();
      const currentMonth = months[now.getMonth()] || 'October';
      setBillingMonth(currentMonth);
      setBillingYear(now.getFullYear() || 2026);

      const start = po.startDate > '2026-10-01' ? po.startDate : '2026-10-01';
      const end = '2026-10-31';
      setBillingPeriodStart(start);
      setBillingPeriodEnd(end);

      const targetEmp = po.assignedEmployees.find((e) => e.employeeId === empId);
      const targetProfile = employees.find((e) => e.employeeId === empId);
      setEmployeeEmail(targetProfile?.email || targetEmp?.email || '');

      const method = targetEmp?.billableDaysMethod || 'working_days';
      setBillableDaysMethod(method);
      setManualBillableDays(targetEmp?.manualBillableDays ?? '');

      // Check existing proformas for this employee on this PO
      const empExisting = proformaInvoices.filter(
        (p) => p.poId === po.id && p.employeeId === empId && p.status !== 'Cancelled'
      );
      const milestoneLabel =
        empExisting.length > 0
          ? `${targetEmp?.designation || 'Consulting'} — Deliverable Milestone ${empExisting.length + 1}`
          : `${targetEmp?.designation || 'Consulting'} — Monthly delivery milestone`;

      const rate = targetEmp?.billingRatePerMonth || 200000;
      setLineItems([
        {
          id: `li-${Date.now()}`,
          description: milestoneLabel,
          hsnSac: '998313',
          quantity: 1,
          rate: rate,
          amount: rate,
        },
      ]);
      setNotes(empExisting.length > 0 ? `Milestone ${empExisting.length + 1} deliverables` : '');
      setGstRate(po.gstRate || 18);
    }
  }, [isOpen, proformaToEdit, employee, po, proformaInvoices]);

  // Handle employee change in create mode
  const handleEmployeeChange = (newEmpId: string) => {
    setSelectedEmpId(newEmpId);
    const targetEmp = po.assignedEmployees.find((e) => e.employeeId === newEmpId);
    const targetProfile = employees.find((e) => e.employeeId === newEmpId);
    setEmployeeEmail(targetProfile?.email || targetEmp?.email || '');

    if (!proformaToEdit) {
      const rate = targetEmp?.billingRatePerMonth || 200000;
      setLineItems([
        {
          id: `li-${Date.now()}`,
          description: `${targetEmp?.designation || 'Technical Services'} — Deliverables`,
          hsnSac: '998313',
          quantity: 1,
          rate: rate,
          amount: rate,
        },
      ]);
    }
  };

  // Calculate billable days
  const calculatedDays = React.useMemo(() => {
    if (!billingPeriodStart || !billingPeriodEnd || billingPeriodStart > billingPeriodEnd) {
      return 0;
    }
    if (billableDaysMethod === 'calendar') {
      return calculateCalendarDays(billingPeriodStart, billingPeriodEnd);
    }
    if (billableDaysMethod === 'working_days') {
      return calculateWorkingDays(billingPeriodStart, billingPeriodEnd);
    }
    return typeof manualBillableDays === 'number' ? manualBillableDays : 0;
  }, [billingPeriodStart, billingPeriodEnd, billableDaysMethod, manualBillableDays]);

  // Line item handlers
  const handleLineItemChange = (index: number, field: keyof ProformaLineItem, val: any) => {
    setLineItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: val };
      if (field === 'quantity' || field === 'rate') {
        const qty = field === 'quantity' ? Number(val) : target.quantity;
        const r = field === 'rate' ? Number(val) : target.rate;
        target.amount = Math.round(qty * r);
      }
      copy[index] = target;
      return copy;
    });
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `li-${Date.now()}`,
        description: 'Additional deliverable / consulting hours',
        hsnSac: '998313',
        quantity: 1,
        rate: 50000,
        amount: 50000,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) {
      setError('A proforma invoice must have at least one line item.');
      return;
    }
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Financial calculations
  const amountExclGst = lineItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  const gstAmount = Math.round(amountExclGst * (gstRate / 100));
  const totalAmountInclGst = amountExclGst + gstAmount;

  // Comprehensive Form & Financial Validation
  const validateForm = (): boolean => {
    setError('');

    if (!selectedEmpId) {
      setError('Please select an employee.');
      return false;
    }

    if (!proformaNumber.trim()) {
      setError('Proforma Invoice number is required.');
      return false;
    }

    if (!billingPeriodStart || !billingPeriodEnd) {
      setError('Billing period start and end dates are required.');
      return false;
    }

    if (billingPeriodStart > billingPeriodEnd) {
      setError('Billing period start date cannot be after end date.');
      return false;
    }

    // Validate manual billable days against applicable billing period
    const totalCalendarDays = calculateCalendarDays(billingPeriodStart, billingPeriodEnd);
    if (billableDaysMethod === 'manual') {
      if (manualBillableDays === '' || Number(manualBillableDays) <= 0 || isNaN(Number(manualBillableDays))) {
        setError('Please enter a valid number of manual billable days greater than 0.');
        return false;
      }
      if (Number(manualBillableDays) > totalCalendarDays) {
        setError(
          `Manual billable days (${manualBillableDays}) cannot exceed the total calendar days (${totalCalendarDays}) for the selected billing period.`
        );
        return false;
      }
    }

    if (lineItems.length === 0) {
      setError('A proforma invoice must have at least one line item.');
      return false;
    }

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.description || !item.description.trim()) {
        setError(`Line item #${i + 1} description is required.`);
        return false;
      }
      if (item.quantity === undefined || Number(item.quantity) <= 0 || isNaN(Number(item.quantity))) {
        setError(`Line item #${i + 1} quantity must be greater than zero.`);
        return false;
      }
      if (item.rate === undefined || Number(item.rate) <= 0 || isNaN(Number(item.rate))) {
        setError(`Line item #${i + 1} rate must be greater than zero.`);
        return false;
      }
      if (item.amount === undefined || Number(item.amount) <= 0 || isNaN(Number(item.amount))) {
        setError(`Line item #${i + 1} amount must be greater than zero.`);
        return false;
      }
    }

    if (amountExclGst <= 0) {
      setError('Proforma invoice subtotal must be greater than zero.');
      return false;
    }

    if (employeeEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(employeeEmail.trim())) {
        setError('Please enter a valid email address.');
        return false;
      }
    }

    return true;
  };

  // Preview Data Object built from live unsaved form values
  const previewData = {
    proformaNumber: proformaNumber.trim() || 'PI/PS/PREVIEW',
    employeeName: selectedAssigned?.employeeName || selectedEmpProfile?.name || selectedEmpId,
    employeeId: selectedEmpId,
    employeeEmail: employeeEmail.trim() || undefined,
    designation: selectedAssigned?.designation || selectedEmpProfile?.designation || 'Consultant',
    billingMonth,
    billingYear,
    billingPeriodStart,
    billingPeriodEnd,
    billableDaysMethod,
    billableDays: calculatedDays,
    amountExclGst,
    gstRate,
    gstAmount,
    totalAmountInclGst,
    status: proformaToEdit?.status || 'Draft',
    version: proformaToEdit?.version || 1,
    lineItems,
    notes: notes.trim() || undefined,
    poId: po.id,
    poNumber: po.poNumber,
    projectId: po.projectId,
    projectName: po.projectName,
  };

  const handleOpenPreview = () => {
    if (!validateForm()) return;
    setIsPreviewOpen(true);
  };

  const executeSave = (bypassDuplicate = false) => {
    if (!validateForm()) return;

    // DUPLICATE INVOICE CHECK
    if (!proformaToEdit && !allowDuplicateBypass && !bypassDuplicate) {
      const duplicate = proformaInvoices.find(
        (p) =>
          p.poId === po.id &&
          p.employeeId === selectedEmpId &&
          p.status !== 'Cancelled' &&
          p.billingPeriodStart === billingPeriodStart &&
          p.billingPeriodEnd === billingPeriodEnd &&
          Math.abs(p.amountExclGst - amountExclGst) < 1 &&
          JSON.stringify(p.lineItems?.map((l) => ({ d: l.description, r: l.rate, q: l.quantity })) || []) ===
            JSON.stringify(lineItems.map((l) => ({ d: l.description, r: l.rate, q: l.quantity })))
      );

      if (duplicate) {
        setDuplicateWarning({
          existingNumber: duplicate.proformaNumber,
          existingAmount: duplicate.amountExclGst,
          billingPeriod: `${duplicate.billingPeriodStart} to ${duplicate.billingPeriodEnd}`,
        });
        return; // Halt to show confirmation banner
      }
    }

    const empName = selectedAssigned?.employeeName || selectedEmpProfile?.name || selectedEmpId;
    const designation = selectedAssigned?.designation || selectedEmpProfile?.designation || 'Consultant';

    // If email changed, update employee profile/assignment
    if (employeeEmail.trim() && employeeEmail.trim() !== selectedEmpProfile?.email) {
      updateEmployeeEmail(selectedEmpId, employeeEmail.trim());
    }

    if (proformaToEdit) {
      // Edit proforma
      updateProformaInvoice(
        proformaToEdit.id,
        {
          proformaNumber: proformaNumber.trim(),
          employeeEmail: employeeEmail.trim() || undefined,
          billingMonth,
          billingYear,
          billingPeriodStart,
          billingPeriodEnd,
          billableDaysMethod,
          billableDays: calculatedDays,
          lineItems,
          amountExclGst,
          gstRate,
          gstAmount,
          totalAmountInclGst,
          notes: notes.trim() || undefined,
        },
        proformaToEdit.status !== 'Draft' // Auto-bump version if already sent
      );
      if (onSuccess) {
        onSuccess({
          ...proformaToEdit,
          proformaNumber: proformaNumber.trim(),
          amountExclGst,
          gstAmount,
          totalAmountInclGst,
        });
      }
    } else {
      // Create new proforma
      const created = addProformaInvoice({
        proformaNumber: proformaNumber.trim(),
        poId: po.id,
        poNumber: po.poNumber,
        projectId: po.projectId,
        projectName: po.projectName,
        employeeId: selectedEmpId,
        employeeName: empName,
        employeeEmail: employeeEmail.trim() || undefined,
        designation,
        billingMonth,
        billingYear,
        billingPeriodStart,
        billingPeriodEnd,
        billableDaysMethod,
        billableDays: calculatedDays,
        amountExclGst,
        gstRate,
        gstAmount,
        totalAmountInclGst,
        status: 'Draft',
        lineItems,
        notes: notes.trim() || undefined,
      });
      if (onSuccess) {
        onSuccess(created);
      }
    }

    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          proformaToEdit
            ? `Edit Proforma Invoice — ${proformaToEdit.proformaNumber}`
            : employee
            ? `Create Proforma Invoice — ${employee.employeeName}`
            : 'Create Proforma Invoice'
        }
        subtitle={
          proformaToEdit
            ? `Editing existing draft or revision for ${proformaToEdit.employeeName}`
            : employee
            ? `Purchase Order ${po.poNumber} · Resource ID: ${employee.employeeId}`
            : `Purchase Order: ${po.poNumber}`
        }
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* DUPLICATE WARNING MODAL BANNER */}
        {duplicateWarning && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>Possible Duplicate Proforma Invoice Detected</span>
            </div>
            <p className="text-amber-800 text-xs">
              An active proforma invoice <strong>{duplicateWarning.existingNumber}</strong> already exists for this employee for period <strong>{duplicateWarning.billingPeriod}</strong> with amount <strong>{formatINR(duplicateWarning.existingAmount)}</strong>.
            </p>
            <p className="text-amber-700 text-[11px]">
              Prime Star HRMS permits multiple independent proformas for the same employee in the same month (for partial milestones or separate workstreams). Do you want to proceed and create this independent invoice?
            </p>
            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => {
                  setAllowDuplicateBypass(true);
                  setDuplicateWarning(null);
                  executeSave(true);
                }}
              >
                Yes, Create Independent Proforma
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setDuplicateWarning(null)}
              >
                Cancel / Modify Details
              </Button>
            </div>
          </div>
        )}

        {/* 1. PO & EMPLOYEE SELECTION GROUP */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div>
            <label className="block text-slate-700 font-bold mb-1">Purchase Order</label>
            <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="font-mono font-bold text-slate-900">{po.poNumber}</div>
              <div className="text-[11px] text-slate-500">{po.projectName}</div>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Assigned Employee <span className="text-red-500">*</span>
            </label>
            {proformaToEdit ? (
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <div className="font-bold text-slate-900">{proformaToEdit.employeeName}</div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {proformaToEdit.employeeId} · {proformaToEdit.designation}
                </div>
              </div>
            ) : (
              <select
                value={selectedEmpId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              >
                {po.assignedEmployees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.employeeName} ({emp.employeeId}) — {emp.designation}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 2. PROFORMA IDENTIFIERS & EMPLOYEE EMAIL */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Input
              label="Proforma Invoice Number"
              value={proformaNumber}
              onChange={(e) => setProformaNumber(e.target.value)}
              placeholder="e.g. PI/PS/26-27/001"
              required
              helperText="Unique document identifier"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Billing Month & Year</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className="text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={billingYear}
                onChange={(e) => setBillingYear(Number(e.target.value))}
                className="text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <Input
              label="Employee Email"
              type="email"
              value={employeeEmail}
              onChange={(e) => setEmployeeEmail(e.target.value)}
              placeholder="employee@primestarconsulting.com"
              helperText="Target recipient for digital proforma dispatch"
            />
          </div>
        </div>

        {/* 3. BILLING PERIOD & METHOD */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div>
            <Input
              label="Billing Period Start"
              type="date"
              value={billingPeriodStart}
              onChange={(e) => setBillingPeriodStart(e.target.value)}
              required
            />
          </div>

          <div>
            <Input
              label="Billing Period End"
              type="date"
              value={billingPeriodEnd}
              onChange={(e) => setBillingPeriodEnd(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Billable Method</label>
            <select
              value={billableDaysMethod}
              onChange={(e) => setBillableDaysMethod(e.target.value as BillableDaysMethod)}
              className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="calendar">Calendar Days</option>
              <option value="working_days">Working Days (Mon–Fri)</option>
              <option value="manual">Manual Days</option>
            </select>
            <div className="text-[11px] text-slate-500 mt-1">
              Eligible days: <strong>{calculatedDays} Days</strong>
            </div>
          </div>
        </div>

        {billableDaysMethod === 'manual' && (
          <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-lg">
            <Input
              label="Manual Billable Days"
              type="number"
              min="1"
              max="365"
              value={manualBillableDays}
              onChange={(e) => setManualBillableDays(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 21"
              required
            />
          </div>
        )}

        {/* 4. LINE ITEMS SECTION */}
        <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h4 className="font-bold text-slate-900 text-xs">Deliverable Line Items</h4>
              <p className="text-[11px] text-slate-500">
                Multiple line items or milestones can be billed per employee proforma.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={addLineItem}
            >
              Add Line Item
            </Button>
          </div>

          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase px-2">
              <div className="col-span-4">Deliverable Description</div>
              <div className="col-span-2 text-center">HSN/SAC</div>
              <div className="col-span-1 text-center">Qty / Days</div>
              <div className="col-span-2 text-right">Rate (₹)</div>
              <div className="col-span-2 text-right">Amount (₹)</div>
              <div className="col-span-1 text-center">Action</div>
            </div>

            {lineItems.map((item, idx) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                <div className="col-span-4">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                    placeholder="Deliverable description"
                    className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    value={item.hsnSac || '998313'}
                    onChange={(e) => handleLineItemChange(idx, 'hsnSac', e.target.value)}
                    placeholder="998313"
                    className="w-full text-xs p-1.5 text-center font-mono bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500"
                    title="HSN / SAC Code"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={item.quantity}
                    onChange={(e) => handleLineItemChange(idx, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-full text-xs p-1.5 text-center bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500"
                    title="Quantity or Days"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={item.rate}
                    onChange={(e) => handleLineItemChange(idx, 'rate', e.target.value)}
                    placeholder="Rate"
                    className="w-full text-xs p-1.5 text-right font-mono bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500"
                    title="Rate per unit"
                    required
                  />
                </div>
                <div className="col-span-2 text-right font-mono font-bold text-slate-900">
                  {formatINR(item.amount)}
                </div>
                <div className="col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeLineItem(idx)}
                    className="text-red-500 hover:text-red-700 cursor-pointer p-1"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. FINANCIAL TOTALS SUMMARY STRIP */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
          <div>
            <span className="text-[10px] uppercase font-bold text-indigo-700 block">Subtotal (Excl. GST)</span>
            <span className="text-base font-bold font-mono text-slate-900">{formatINR(amountExclGst)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-indigo-700 block">GST ({gstRate}%)</span>
            <span className="text-base font-bold font-mono text-slate-700">{formatINR(gstAmount)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-indigo-900 block">Total (Incl. GST)</span>
            <span className="text-lg font-black font-mono text-indigo-950">{formatINR(totalAmountInclGst)}</span>
          </div>
        </div>

        {/* 6. NOTES & FINANCIAL SAFETY NOTICE */}
        <div>
          <label className="block text-slate-700 font-bold mb-1">Deliverable Notes & Milestones</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sprint objectives, deliverable signoff details, or client acceptance notes"
            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <span>
            <strong>Financial Safety Guarantee:</strong> Saving or sharing a proforma invoice does <strong>not</strong> debit the purchase order remaining balance (₹{po.remainingBalanceExclGst.toLocaleString('en-IN')}) or issue a tax invoice. PO balance is only debited upon formal invoice issuance.
          </span>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            icon={<Eye className="w-4 h-4" />}
            onClick={handleOpenPreview}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            icon={<FileCheck className="w-4 h-4" />}
          >
            {proformaToEdit ? 'Save Changes' : 'Create Proforma Invoice'}
          </Button>
        </div>
      </form>
    </Modal>

    {/* LIVE UNSAVED DOCUMENT PREVIEW MODAL */}
    {isPreviewOpen && (
      <ProformaPreviewModal
        proforma={previewData}
        po={po}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        isUnsavedPreview={true}
        onConfirmSave={() => {
          setIsPreviewOpen(false);
          executeSave();
        }}
      />
    )}
  </>
  );
};
