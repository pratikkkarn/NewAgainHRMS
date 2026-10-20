import React, { useState, useEffect } from 'react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { Modal, Input, Button } from '../../common/UIComponents';
import { formatINR } from '../../../lib/utils';
import { COMPANY_GST_STATE, GST_TYPE_LABELS, GstType, INDIAN_STATES, defaultGstType, splitGst } from '../../../lib/gst';
import { UPLOAD_ACCEPT, UPLOAD_HINT, checkUpload } from '../../../lib/fileRules';
import {
  AlertCircle,
  Upload,
  FileText,
  Trash2,
  Info,
  CheckCircle2,
  FolderPlus,
  Paperclip,
} from 'lucide-react';

interface POCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onNavigateToProjects?: () => void;
}

export const POCreateModal: React.FC<POCreateModalProps> = ({
  isOpen,
  onClose,
  defaultProjectId,
  onNavigateToProjects,
}) => {
  const { projects, purchaseOrders, createPO, addProject } = useData();
  const { currentUser } = useRole();

  // Project Selection State
  const [selectedProjectId, setSelectedProjectId] = useState<string>('new');
  const [customProjectName, setCustomProjectName] = useState('');
  const [clientName, setClientName] = useState('');

  // PO Identification & Details
  const [poNumber, setPoNumber] = useState('');
  const [sowNumber, setSowNumber] = useState('');
  const [quotationNumber, setQuotationNumber] = useState('');
  const [poRequester, setPoRequester] = useState('');

  // Dates
  const [startDate, setStartDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // Financial Defaults (Must default to ZERO)
  const [amountExclGst, setAmountExclGst] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  // GST type follows the billing state unless someone changes it by hand
  const [billingState, setBillingState] = useState<string>(COMPANY_GST_STATE);
  const [gstType, setGstType] = useState<GstType>('CGST_SGST');
  const [gstTypeTouched, setGstTypeTouched] = useState(false);

  // Address & Notes
  const [billingAddress, setBillingAddress] = useState(
    'Prime Star Consulting Services, Tower B, Electronic City, Bengaluru 560100'
  );
  const [shippingAddress, setShippingAddress] = useState(
    'Prime Star Consulting Services, Tower B, Electronic City, Bengaluru 560100'
  );
  const [notes, setNotes] = useState('');

  // File Attachment States (Frontend Preview)
  const [poFile, setPoFile] = useState<File | null>(null);
  const [sowFile, setSowFile] = useState<File | null>(null);
  const [quotationFile, setQuotationFile] = useState<File | null>(null);

  // Submission & Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Financial Calculations (Synchronized)
  const amountNum = Number(amountExclGst) || 0;
  const gstAmount = amountNum * (gstRate / 100);
  const gstSplit = splitGst(amountNum, gstRate, gstType);
  const amountInclGst = amountNum + gstAmount;

  // On Modal Open / Props Update
  useEffect(() => {
    if (isOpen) {
      // Set project selection
      if (defaultProjectId && projects.some((p) => p.id === defaultProjectId)) {
        setSelectedProjectId(defaultProjectId);
      } else if (projects.length > 0) {
        setSelectedProjectId(projects[0].id);
      } else {
        setSelectedProjectId('new');
      }

      // Generate suggested PO number
      const random4Digit = Math.floor(1000 + Math.random() * 9000);
      setPoNumber(`PO/2026/PS/${random4Digit}`);

      // Set Requester
      setPoRequester(currentUser.name || 'Vijay Kumar');

      // Set Dates
      const today = new Date().toISOString().split('T')[0];
      const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      setStartDate(today);
      setExpiryDate(nextYear);

      // Financial Defaults to Zero
      setAmountExclGst(0);
      setGstRate(18);
      setBillingState(COMPANY_GST_STATE);
      setGstType('CGST_SGST');
      setGstTypeTouched(false);

      // Clear File Uploads & Errors
      setPoFile(null);
      setSowFile(null);
      setQuotationFile(null);
      setCustomProjectName('');
      setClientName('');
      setSowNumber('');
      setQuotationNumber('');
      setNotes('');
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, defaultProjectId, projects, currentUser.name]);

  // File Upload Helper Validation
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void,
    errorKey: string
  ) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    // Only PDF, JPG or PNG up to 10 MB, checked by the file's content
    const problem = await checkUpload(file);
    if (problem) {
      input.value = '';
      setErrors((prev) => ({ ...prev, [errorKey]: problem }));
      return;
    }

    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[errorKey];
      return copy;
    });
    setter(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Submission Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const newErrors: Record<string, string> = {};

    // 1. Validate PO Number
    if (!poNumber.trim()) {
      newErrors.poNumber = 'PO Number is required';
    } else {
      const isDuplicate = purchaseOrders.some(
        (p) => p.poNumber.trim().toLowerCase() === poNumber.trim().toLowerCase()
      );
      if (isDuplicate) {
        newErrors.poNumber = `PO Number "${poNumber}" already exists in the system. Please enter a unique PO number.`;
      }
    }

    // 2. Validate Requester
    if (!poRequester.trim()) {
      newErrors.poRequester = 'PO Requester is required';
    }

    // 3. Validate Project Selection
    if (selectedProjectId === 'new') {
      if (!customProjectName.trim()) {
        newErrors.customProjectName = 'Please enter project name';
      }
    } else if (!selectedProjectId) {
      newErrors.projectId = 'Please select a project';
    }

    // 4. Validate Amount
    if (amountExclGst === undefined || amountExclGst === null || isNaN(amountExclGst)) {
      newErrors.amountExclGst = 'Please enter amount excluding GST';
    } else if (amountExclGst <= 0) {
      newErrors.amountExclGst = 'Amount excluding GST must be greater than ₹0';
    }

    // 5. Validate Dates
    if (!startDate) newErrors.startDate = 'Start date required';
    if (!expiryDate) newErrors.expiryDate = 'End / Expiry date required';
    if (startDate && expiryDate && new Date(startDate) > new Date(expiryDate)) {
      newErrors.expiryDate = 'Expiry / End date cannot be earlier than Start date';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      let targetProjectId = selectedProjectId;
      let targetProjectName = '';

      // Create new project in shared data store if requested
      if (selectedProjectId === 'new') {
        const proj = addProject({
          name: customProjectName.trim(),
          clientName: clientName.trim() || 'Client Entity',
          code: `PRJ-${customProjectName.trim().substring(0, 4).toUpperCase()}`,
          projectManager: currentUser.name || 'Project Manager',
          startDate,
          endDate: expiryDate,
          status: 'Active',
        });
        targetProjectId = proj.id;
        targetProjectName = proj.name;
      } else {
        const existingProject = projects.find((p) => p.id === selectedProjectId);
        targetProjectName = existingProject ? existingProject.name : 'Selected Project';
      }

      // Create Purchase Order
      createPO({
        poNumber: poNumber.trim(),
        projectId: targetProjectId,
        projectName: targetProjectName,
        sowNumber: sowNumber.trim() || undefined,
        quotationNumber: quotationNumber.trim() || undefined,
        poRequester: poRequester.trim(),
        startDate,
        expiryDate,
        amountExclGst,
        gstRate,
        gstType,
        billingState,
        billingAddress,
        shippingAddress,
        notes: notes.trim() || undefined,
        poDocumentName: poFile ? poFile.name : undefined,
      });

      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrors({ form: 'Failed to create purchase order. Please check inputs and try again.' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Purchase Order (PO)" maxWidth="2xl">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {errors.form && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        {/* 1. PROJECT SELECTION */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Selection <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer font-medium"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (ID: {p.code || p.id})
                  </option>
                ))}
                <option value="new">+ Enter New Project Manually</option>
              </select>
              {errors.projectId && (
                <p className="text-[11px] text-red-600 mt-1">{errors.projectId}</p>
              )}
            </div>

            <div>
              <Input
                label="PO Number *"
                value={poNumber}
                onChange={(e) => {
                  setPoNumber(e.target.value);
                  if (errors.poNumber) {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.poNumber;
                      return copy;
                    });
                  }
                }}
                error={errors.poNumber}
                placeholder="e.g. PO/2026/PS/1024"
              />
            </div>
          </div>

          {projects.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-medium">No projects available. Create a project first.</span>
              </div>
              {onNavigateToProjects && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToProjects();
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-medium text-xs transition-colors shrink-0 shadow-2xs"
                >
                  Go to Projects
                </button>
              )}
            </div>
          )}

          {selectedProjectId === 'new' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <Input
                label="New Project Name *"
                value={customProjectName}
                onChange={(e) => setCustomProjectName(e.target.value)}
                error={errors.customProjectName}
                placeholder="e.g. Core Banking Migration"
              />
              <Input
                label="Client Company Name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Apex Financial Services"
              />
            </div>
          )}
        </div>

        {/* 2. REQUESTER & REFERENCE NUMBERS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="PO Requester *"
            value={poRequester}
            onChange={(e) => setPoRequester(e.target.value)}
            error={errors.poRequester}
            placeholder="e.g. Vikramaditya Rao"
          />
          <Input
            label="SOW Number / Reference"
            value={sowNumber}
            onChange={(e) => setSowNumber(e.target.value)}
            placeholder="e.g. SOW-2026-001"
          />
          <Input
            label="Quotation Number / Ref"
            value={quotationNumber}
            onChange={(e) => setQuotationNumber(e.target.value)}
            placeholder="e.g. QUOT-2026-089"
          />
        </div>

        {/* 3. DATES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="PO Start Date *"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            error={errors.startDate}
          />
          <Input
            label="PO Expiry / End Date *"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            error={errors.expiryDate}
          />
        </div>

        {/* 4. FINANCIAL CALCULATIONS & GST (DEFAULTS TO ZERO) */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Financial & GST Calculations
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Currency: INR (₹)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Input
                label="Amount Excl. GST (₹) *"
                type="number"
                min="0"
                step="any"
                value={amountExclGst === 0 ? '0' : amountExclGst}
                onChange={(e) => {
                  const val = e.target.value;
                  const num = val === '' ? 0 : Number(val);
                  setAmountExclGst(num);
                  if (errors.amountExclGst) {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.amountExclGst;
                      return copy;
                    });
                  }
                }}
                error={errors.amountExclGst}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                GST Rate (%)
              </label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium cursor-pointer"
              >
                <option value={18}>18% (Standard GST)</option>
                <option value={12}>12%</option>
                <option value={5}>5%</option>
                <option value={0}>0% (Exempt)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">GST Amount (₹)</label>
              <div className="px-3 py-2 text-xs font-semibold font-mono text-slate-800 bg-white border border-slate-200 rounded-lg shadow-2xs">
                {formatINR(gstAmount)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {gstType === 'IGST'
                  ? `IGST ${gstRate}%: ${formatINR(gstSplit.igst)}`
                  : `CGST ${gstRate / 2}%: ${formatINR(gstSplit.cgst)} · SGST ${gstRate / 2}%: ${formatINR(gstSplit.sgst)}`}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount Incl. GST (₹)
              </label>
              <div className="px-3 py-2 text-xs font-bold font-mono text-blue-700 bg-white border border-slate-200 rounded-lg shadow-2xs">
                {formatINR(amountInclGst)}
              </div>
            </div>
          </div>
        </div>

        {/* 4b. PLACE OF SUPPLY → GST TYPE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Billing state (place of supply) <span className="text-red-500">*</span>
            </label>
            <select
              value={billingState}
              onChange={(e) => {
                setBillingState(e.target.value);
                if (!gstTypeTouched) setGstType(defaultGstType(e.target.value));
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium cursor-pointer"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st.code} value={st.name}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">GST type</label>
            <select
              value={gstType}
              onChange={(e) => {
                setGstType(e.target.value as GstType);
                setGstTypeTouched(true);
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 font-medium cursor-pointer"
            >
              {(Object.keys(GST_TYPE_LABELS) as GstType[]).map((t) => (
                <option key={t} value={t}>
                  {GST_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              {gstTypeTouched && gstType !== defaultGstType(billingState)
                ? `Changed by hand. ${billingState} would normally be ${GST_TYPE_LABELS[defaultGstType(billingState)]}.`
                : `Pre-filled: Prime Star is registered in ${COMPANY_GST_STATE}.`}
            </p>
          </div>
        </div>

        {/* 5. DOCUMENT ATTACHMENTS (FRONTEND PREVIEW) */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
              <span>Document Attachments</span>
            </div>
            <span className="text-[11px] text-slate-500">{UPLOAD_HINT}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* PO SOFT COPY */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                PO Soft Copy
              </label>
              {poFile ? (
                <div className="flex items-center justify-between gap-2 p-1.5 bg-white rounded border border-slate-200 text-[11px]">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate text-slate-800 font-medium">{poFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPoFile(null)}
                    className="text-slate-400 hover:text-red-600 p-0.5"
                    title="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 p-2 bg-white border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 text-slate-500 hover:text-blue-600 transition-colors text-[11px]">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach PO File</span>
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setPoFile, 'poFile')}
                  />
                </label>
              )}
              {errors.poFile && (
                <p className="text-[10px] text-red-600 mt-1">{errors.poFile}</p>
              )}
            </div>

            {/* SOW DOCUMENT */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                SOW Document
              </label>
              {sowFile ? (
                <div className="flex items-center justify-between gap-2 p-1.5 bg-white rounded border border-slate-200 text-[11px]">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate text-slate-800 font-medium">{sowFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSowFile(null)}
                    className="text-slate-400 hover:text-red-600 p-0.5"
                    title="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 p-2 bg-white border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-500 text-slate-500 hover:text-indigo-600 transition-colors text-[11px]">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach SOW</span>
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setSowFile, 'sowFile')}
                  />
                </label>
              )}
              {errors.sowFile && (
                <p className="text-[10px] text-red-600 mt-1">{errors.sowFile}</p>
              )}
            </div>

            {/* QUOTATION DOCUMENT */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Quotation File
              </label>
              {quotationFile ? (
                <div className="flex items-center justify-between gap-2 p-1.5 bg-white rounded border border-slate-200 text-[11px]">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate text-slate-800 font-medium">
                      {quotationFile.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuotationFile(null)}
                    className="text-slate-400 hover:text-red-600 p-0.5"
                    title="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 p-2 bg-white border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-emerald-500 text-slate-500 hover:text-emerald-600 transition-colors text-[11px]">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach Quotation</span>
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleFileChange(e, setQuotationFile, 'quotationFile')}
                  />
                </label>
              )}
              {errors.quotationFile && (
                <p className="text-[10px] text-red-600 mt-1">{errors.quotationFile}</p>
              )}
            </div>
          </div>
        </div>

        {/* 6. ADDRESSES & NOTES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Billing Address
            </label>
            <textarea
              rows={2}
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Shipping Address
            </label>
            <textarea
              rows={2}
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Comments or Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Milestone billing upon deliverables completion."
            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Purchase Order...' : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
