import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import { UPLOAD_ACCEPT, UPLOAD_HINT, checkUpload } from '../../../lib/fileRules';
import { PdfViewer } from '../../common/PdfViewer';
import { downloadDocument, DownloadDocOptions } from '../../../lib/documentDownloader';
import { formatDate } from '../../../lib/utils';
import {
  FolderKanban,
  FileText,
  DollarSign,
  Clock,
  Search,
  Filter,
  Download,
  Eye,
  Trash2,
  Upload,
  X,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Building,
  Briefcase,
  Calendar,
  FileCheck,
  ShieldCheck,
  Tag,
  AlertCircle,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';

const CUSTOM_DOCS_KEY = 'primestar_custom_documents';
const DELETED_DOCS_KEY = 'primestar_deleted_doc_ids';

export type DocumentType =
  | 'SOW / Contract'
  | 'PO Document'
  | 'Quotation'
  | 'Tax Invoice'
  | 'Credit Note'
  | 'Candidate / HR'
  | 'Other';

export interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  relatedProjectOrPo: string;
  projectId?: string;
  poId?: string;
  uploadDate: string;
  expiryDate?: string;
  status: 'Active' | 'Pending' | 'Expired / Superseded' | 'Cancelled' | 'Verified';
  downloadOptions: DownloadDocOptions;
  isCustomUploaded?: boolean;
  notes?: string;
  fileSizeBytes?: number;
}

interface DocumentsViewProps {
  onNavigate?: (tab: string, params?: any) => void;
  initialTypeFilter?: string;
  initialStatusFilter?: string;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  onNavigate,
  initialTypeFilter,
  initialStatusFilter,
}) => {
  const { purchaseOrders, sows, quotations, projects } = useData();
  const { can } = useRole();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>(initialTypeFilter || 'All');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>(initialStatusFilter || 'All');

  React.useEffect(() => {
    if (initialTypeFilter) {
      setSelectedTypeFilter(initialTypeFilter);
    }
  }, [initialTypeFilter]);

  React.useEffect(() => {
    if (initialStatusFilter) {
      setSelectedStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // Custom Uploaded Documents & Deleted Document Tracking
  const [customDocs, setCustomDocs] = useState<DocumentRecord[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_DOCS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [deletedDocIds, setDeletedDocIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(DELETED_DOCS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modals state
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<DocumentRecord | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Upload Form State
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState<DocumentType>('SOW / Contract');
  const [newDocRelatedPoId, setNewDocRelatedPoId] = useState('');
  const [newDocExpiryDate, setNewDocExpiryDate] = useState('');
  const [newDocNotes, setNewDocNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Persist Custom Docs and Deleted IDs
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_DOCS_KEY, JSON.stringify(customDocs));
    } catch (e) {
      console.error('Error persisting custom docs:', e);
    }
  }, [customDocs]);

  useEffect(() => {
    try {
      localStorage.setItem(DELETED_DOCS_KEY, JSON.stringify(deletedDocIds));
    } catch (e) {
      console.error('Error persisting deleted doc IDs:', e);
    }
  }, [deletedDocIds]);

  // Derive All Documents from DataContext + Custom Uploads
  const allDocuments = useMemo<DocumentRecord[]>(() => {
    const list: DocumentRecord[] = [];

    // 1. Statements of Work (SOWs)
    sows.forEach((sow) => {
      const matchingPo = purchaseOrders.find(
        (po) => po.sowNumber === sow.sowNumber || po.sowId === sow.id
      );
      const projName = matchingPo?.projectName || sow.clientName || 'General Project';
      const docName = sow.documentName || `${sow.sowNumber}_Statement_of_Work.pdf`;

      list.push({
        id: `sow-${sow.id}`,
        name: docName,
        type: 'SOW / Contract',
        relatedProjectOrPo: `${projName} (${sow.sowNumber})`,
        uploadDate: sow.effectiveDate || '2025-01-01',
        expiryDate: sow.expiryDate,
        status:
          sow.status === 'Active'
            ? 'Active'
            : sow.status === 'Expired'
            ? 'Expired / Superseded'
            : 'Pending',
        downloadOptions: {
          filename: docName,
          documentType: 'sow',
          title: sow.title || `Statement of Work ${sow.sowNumber}`,
          sowNumber: sow.sowNumber,
          po: matchingPo,
          fileUrl: sow.documentUrl || '/Statement_of_Work_Document.pdf',
        },
      });
    });

    // 2. Commercial Quotations
    quotations.forEach((q) => {
      const matchingPo = purchaseOrders.find(
        (po) => po.quotationNumber === q.quotationNumber || po.quotationId === q.id
      );
      const projName = matchingPo?.projectName || 'Enterprise Services';
      const docName = q.documentName || `${q.quotationNumber}_Signed_Quotation.pdf`;

      list.push({
        id: `quot-${q.id}`,
        name: docName,
        type: 'Quotation',
        relatedProjectOrPo: `${projName} (${q.quotationNumber})`,
        uploadDate: q.date || '2025-01-15',
        status:
          q.status === 'Approved'
            ? 'Active'
            : q.status === 'Rejected'
            ? 'Cancelled'
            : 'Pending',
        downloadOptions: {
          filename: docName,
          documentType: 'quotation',
          title: `Commercial Quotation ${q.quotationNumber}`,
          quotationNumber: q.quotationNumber,
          po: matchingPo,
          fileUrl: '/Commercial_Quotation_Signed.pdf',
        },
      });
    });

    // 3. Purchase Order Documents
    purchaseOrders.forEach((po) => {
      const docName = po.poDocumentName || `${po.poNumber}_Purchase_Order.pdf`;
      list.push({
        id: `po-doc-${po.id}`,
        name: docName,
        type: 'PO Document',
        relatedProjectOrPo: `${po.projectName} (${po.poNumber})`,
        projectId: po.projectId,
        poId: po.id,
        uploadDate: po.startDate || '2025-01-01',
        expiryDate: po.expiryDate,
        status:
          po.status === 'Active' || po.status === 'Renewed'
            ? 'Active'
            : po.status === 'Expired' || po.status === 'Fully Utilized'
            ? 'Expired / Superseded'
            : 'Active',
        downloadOptions: {
          filename: docName,
          documentType: 'po',
          title: `Purchase Order ${po.poNumber}`,
          po: po,
          fileUrl: '/Sample_Purchase_Order.pdf',
        },
      });

      // 4. Invoices and Credit Notes under PO
      po.invoices.forEach((inv) => {
        const isCN = inv.isCreditNote;
        const defaultName = isCN
          ? `CN_${inv.invoiceNumber}.pdf`
          : `Invoice_${inv.invoiceNumber}.pdf`;
        const docName = inv.documentName || defaultName;

        list.push({
          id: `inv-${inv.id}`,
          name: docName,
          type: isCN ? 'Credit Note' : 'Tax Invoice',
          relatedProjectOrPo: `${po.projectName} (${po.poNumber})`,
          projectId: po.projectId,
          poId: po.id,
          uploadDate: inv.invoiceDate || po.startDate,
          expiryDate: inv.dueDate,
          status:
            inv.status === 'Paid'
              ? 'Active'
              : inv.status === 'Cancelled'
              ? 'Cancelled'
              : inv.status === 'Issued'
              ? 'Pending'
              : 'Active',
          downloadOptions: {
            filename: docName,
            documentType: 'invoice',
            title: `${isCN ? 'Credit Note' : 'Tax Invoice'} ${inv.invoiceNumber}`,
            po: po,
            invoiceNumber: inv.invoiceNumber,
            invoice: inv,
            file: inv.fileData,
            fileUrl: inv.documentUrl,
          },
          notes: inv.notes,
        });
      });
    });

    // 5. Custom Uploaded Documents
    customDocs.forEach((doc) => {
      list.push(doc);
    });

    // Filter out deleted documents
    return list.filter((doc) => !deletedDocIds.includes(doc.id));
  }, [sows, quotations, purchaseOrders, customDocs, deletedDocIds]);

  // Filtered List according to search and selection
  const filteredDocuments = useMemo(() => {
    return allDocuments.filter((doc) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = doc.name.toLowerCase().includes(q);
        const matchType = doc.type.toLowerCase().includes(q);
        const matchRel = doc.relatedProjectOrPo.toLowerCase().includes(q);
        const matchId = doc.id.toLowerCase().includes(q);
        const matchNotes = doc.notes?.toLowerCase().includes(q) || false;
        if (!matchName && !matchType && !matchRel && !matchId && !matchNotes) {
          return false;
        }
      }

      // 2. Document Type Filter
      if (selectedTypeFilter !== 'All' && doc.type !== selectedTypeFilter) {
        return false;
      }

      // 3. Project Filter
      if (selectedProjectFilter !== 'All') {
        const matchesProj = doc.relatedProjectOrPo
          .toLowerCase()
          .includes(selectedProjectFilter.toLowerCase());
        if (!matchesProj) return false;
      }

      // 4. Status Filter
      if (selectedStatusFilter !== 'All' && doc.status !== selectedStatusFilter) {
        return false;
      }

      return true;
    });
  }, [allDocuments, searchQuery, selectedTypeFilter, selectedProjectFilter, selectedStatusFilter]);

  // Summary Metrics
  const totalCount = allDocuments.length;
  const contractsCount = allDocuments.filter(
    (d) => d.type === 'SOW / Contract' || d.type === 'PO Document'
  ).length;
  const invoicesCount = allDocuments.filter(
    (d) => d.type === 'Tax Invoice' || d.type === 'Credit Note'
  ).length;
  const expiringCount = allDocuments.filter((d) => {
    if (d.status === 'Expired / Superseded') return true;
    if (!d.expiryDate) return false;
    const exp = new Date(d.expiryDate).getTime();
    const now = new Date().getTime();
    const diffDays = (exp - now) / (1000 * 3600 * 24);
    return diffDays >= 0 && diffDays <= 30;
  }).length;

  // Handle Document Delete Confirmation
  const handleDeleteConfirm = () => {
    if (!deleteConfirmDoc) return;
    const docId = deleteConfirmDoc.id;

    if (deleteConfirmDoc.isCustomUploaded) {
      setCustomDocs((prev) => prev.filter((d) => d.id !== docId));
    } else {
      setDeletedDocIds((prev) => [...prev, docId]);
    }

    setDeleteConfirmDoc(null);
  };

  // Handle New Custom Document Upload Form Submit
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!newDocName.trim()) {
      setUploadError('Document name / title is required.');
      return;
    }

    const selectedPo = purchaseOrders.find((p) => p.id === newDocRelatedPoId);
    const relatedText = selectedPo
      ? `${selectedPo.projectName} (${selectedPo.poNumber})`
      : 'General Operations';

    const cleanFileName = newDocName.trim().endsWith('.pdf')
      ? newDocName.trim()
      : `${newDocName.trim()}.pdf`;

    let fileDataObj: Blob | undefined;
    if (selectedFile) {
      fileDataObj = selectedFile;
    }

    const newRecord: DocumentRecord = {
      id: `custom-doc-${Date.now()}`,
      name: cleanFileName,
      type: newDocType,
      relatedProjectOrPo: relatedText,
      poId: selectedPo?.id,
      projectId: selectedPo?.projectId,
      uploadDate: new Date().toISOString().split('T')[0],
      expiryDate: newDocExpiryDate || undefined,
      status: 'Active',
      isCustomUploaded: true,
      notes: newDocNotes,
      downloadOptions: {
        filename: cleanFileName,
        documentType:
          newDocType === 'SOW / Contract'
            ? 'sow'
            : newDocType === 'PO Document'
            ? 'po'
            : newDocType === 'Quotation'
            ? 'quotation'
            : newDocType === 'Tax Invoice' || newDocType === 'Credit Note'
            ? 'invoice'
            : 'generic',
        title: cleanFileName.replace('.pdf', '').replace(/_/g, ' '),
        file: fileDataObj,
        po: selectedPo,
      },
    };

    setCustomDocs((prev) => [newRecord, ...prev]);

    // Reset Form
    setNewDocName('');
    setNewDocType('SOW / Contract');
    setNewDocRelatedPoId('');
    setNewDocExpiryDate('');
    setNewDocNotes('');
    setSelectedFile(null);
    setUploadModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Documents Vault</h1>
              <p className="text-xs text-slate-500">
                Centralized document repository for SOWs, POs, Invoices, Quotations & HR records.
              </p>
            </div>
          </div>
        </div>

        {can('document.upload') && (
        <button
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer hover:shadow-md"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
        )}
      </div>

      {/* SUMMARY CARDS METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div
          onClick={() => {
            setSelectedTypeFilter('All');
            setSelectedStatusFilter('All');
            setSearchQuery('');
          }}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
        >
          <div>
            <span className="text-xs font-medium text-slate-500">Total Documents</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalCount}</div>
            <span className="text-[11px] text-blue-600 font-semibold mt-1 inline-block">
              Across all POs & Projects
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Contracts & SOWs */}
        <div
          onClick={() => {
            setSelectedTypeFilter('SOW / Contract');
            setSelectedStatusFilter('All');
          }}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all"
        >
          <div>
            <span className="text-xs font-medium text-slate-500">Contracts & SOWs</span>
            <div className="text-2xl font-black text-indigo-900 mt-1">{contractsCount}</div>
            <span className="text-[11px] text-indigo-600 font-semibold mt-1 inline-block">
              Binding SOW & PO Documents
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <Briefcase className="w-6 h-6" />
          </div>
        </div>

        {/* Invoices & Credit Notes */}
        <div
          onClick={() => {
            setSelectedTypeFilter('Tax Invoice');
            setSelectedStatusFilter('All');
          }}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all"
        >
          <div>
            <span className="text-xs font-medium text-slate-500">Tax Invoices</span>
            <div className="text-2xl font-black text-emerald-900 mt-1">{invoicesCount}</div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">
              Invoices & Credit Notes
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Expiring Documents */}
        <div
          onClick={() => {
            setSelectedStatusFilter('Expired / Superseded');
          }}
          className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:shadow-md hover:border-amber-300 transition-all"
        >
          <div>
            <span className="text-xs font-medium text-slate-500">Expiring Documents</span>
            <div className="text-2xl font-black text-amber-900 mt-1">{expiringCount}</div>
            <span className="text-[11px] text-amber-600 font-semibold mt-1 inline-block">
              Expired or within 30 days
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
              placeholder="Search by document name, PO number, project or notes..."
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
            {/* Type Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium shrink-0">Type:</span>
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="All">All Types</option>
                <option value="SOW / Contract">SOW / Contract</option>
                <option value="PO Document">PO Document</option>
                <option value="Quotation">Quotation</option>
                <option value="Tax Invoice">Tax Invoice</option>
                <option value="Credit Note">Credit Note</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500 font-medium shrink-0">Project:</span>
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="All">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
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
                <option value="Pending">Pending</option>
                <option value="Expired / Superseded">Expired / Superseded</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Verified">Verified</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            Showing <strong className="text-slate-900">{filteredDocuments.length}</strong> of{' '}
            <strong className="text-slate-900">{allDocuments.length}</strong> documents
          </span>
          {(searchQuery ||
            selectedTypeFilter !== 'All' ||
            selectedProjectFilter !== 'All' ||
            selectedStatusFilter !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTypeFilter('All');
                setSelectedProjectFilter('All');
                setSelectedStatusFilter('All');
              }}
              className="text-blue-600 hover:underline font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* DOCUMENT TABLE CONTAINER */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3.5">Document Name</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Related Project / PO</th>
                <th className="px-4 py-3.5">Upload Date</th>
                <th className="px-4 py-3.5">Expiry / Due Date</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <FolderKanban className="w-6 h-6" />
                      </div>
                      <span className="font-bold text-slate-800 text-sm">No Documents Found</span>
                      <p className="text-xs text-slate-500 max-w-sm">
                        No document records match your filter criteria. Try clearing search keywords
                        or uploading a new document.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Document Name */}
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 mt-0.5 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 hover:text-blue-600 transition-colors">
                            {doc.name}
                          </div>
                          {doc.notes && (
                            <div className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">
                              {doc.notes}
                            </div>
                          )}
                          {doc.isCustomUploaded && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] font-bold bg-purple-50 text-purple-700 rounded border border-purple-200">
                              User Uploaded
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Document Type Badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          doc.type === 'SOW / Contract'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : doc.type === 'PO Document'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : doc.type === 'Tax Invoice'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : doc.type === 'Credit Note'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : doc.type === 'Quotation'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {doc.type}
                      </span>
                    </td>

                    {/* Related Project / PO */}
                    <td className="px-4 py-3.5 text-slate-800 max-w-xs">
                      <div className="font-medium truncate">{doc.relatedProjectOrPo}</div>
                    </td>

                    {/* Upload Date */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {doc.uploadDate ? formatDate(doc.uploadDate) : '—'}
                    </td>

                    {/* Expiry Date */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {doc.expiryDate ? (
                        <span
                          className={
                            doc.status === 'Expired / Superseded' ? 'text-rose-600 font-bold' : ''
                          }
                        >
                          {formatDate(doc.expiryDate)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          doc.status === 'Active' || doc.status === 'Verified'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : doc.status === 'Pending'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : doc.status === 'Expired / Superseded'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            doc.status === 'Active' || doc.status === 'Verified'
                              ? 'bg-emerald-600'
                              : doc.status === 'Pending'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        ></span>
                        {doc.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Preview Action Button */}
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-medium transition-colors cursor-pointer"
                          title="Preview PDF Document"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Direct Download Action Button */}
                        <button
                          onClick={() => downloadDocument(doc.downloadOptions)}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 font-medium transition-colors cursor-pointer"
                          title="Download PDF Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Action Button */}
                        {can('document.delete') && (
                          <button
                            onClick={() => setDeleteConfirmDoc(doc)}
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 font-medium transition-colors cursor-pointer"
                            title="Delete Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. DOCUMENT PREVIEW MODAL WITH EMBEDDED PDF VIEWER */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-600 text-white font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white truncate max-w-lg">
                    {previewDoc.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                    <span>{previewDoc.type}</span>
                    <span>•</span>
                    <span>{previewDoc.relatedProjectOrPo}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Download Button inside Preview Header */}
                <button
                  onClick={() => downloadDocument(previewDoc.downloadOptions)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>

                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Embedded High-DPI PDF Viewer */}
            <div className="flex-1 overflow-hidden p-4 bg-slate-100">
              <PdfViewer
                pdfUrl={previewDoc.downloadOptions.fileUrl}
                fileData={previewDoc.downloadOptions.file}
                title={previewDoc.name}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. DELETE CONFIRMATION DIALOG */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Document</h3>
                <p className="text-xs text-slate-500">Confirm permanent document removal</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to delete{' '}
              <strong className="text-slate-900">{deleteConfirmDoc.name}</strong> from the repository?
              This action will remove the document reference from the vault view.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer"
              >
                Yes, Delete Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. UPLOAD DOCUMENT MODAL */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600 text-white">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Upload New Document</h3>
                  <p className="text-[11px] text-slate-400">
                    Add a contract, invoice, or agreement to the vault
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4 text-xs">
              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Document Title */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Document Title / Filename <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g. Statement_of_Work_Phase_2.pdf"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                />
              </div>

              {/* Document Type & Related PO Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Document Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value as DocumentType)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="SOW / Contract">SOW / Contract</option>
                    <option value="PO Document">PO Document</option>
                    <option value="Quotation">Quotation</option>
                    <option value="Tax Invoice">Tax Invoice</option>
                    <option value="Credit Note">Credit Note</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Related Purchase Order</label>
                  <select
                    value={newDocRelatedPoId}
                    onChange={(e) => setNewDocRelatedPoId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="">None (General Vault)</option>
                    {purchaseOrders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.poNumber} — {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={newDocExpiryDate}
                  onChange={(e) => setNewDocExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                />
              </div>

              {/* Notes / Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  value={newDocNotes}
                  onChange={(e) => setNewDocNotes(e.target.value)}
                  placeholder="Additional context or deliverable details..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 font-medium"
                />
              </div>

              {/* File Attachment */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Attach file <span className="font-normal text-slate-500">({UPLOAD_HINT})</span>
                </label>
                <input
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  onChange={async (e) => {
                    const input = e.target;
                    const file = input.files?.[0];
                    if (!file) return;
                    // Only PDF, JPG or PNG up to 10 MB, checked by the file's content
                    const problem = await checkUpload(file);
                    if (problem) {
                      input.value = '';
                      setSelectedFile(null);
                      setUploadError(problem);
                      return;
                    }
                    setUploadError(null);
                    setSelectedFile(file);
                    if (!newDocName) {
                      setNewDocName(file.name);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  Upload & Save Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
