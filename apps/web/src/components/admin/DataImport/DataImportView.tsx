import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileUp, Upload, XCircle } from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { useRole } from '../../../context/RoleContext';
import {
  EMPLOYEE_COLUMNS,
  ImportColumn,
  PO_COLUMNS,
  RowResult,
  parseCsv,
  rowsToRecords,
  templateCsv,
  validateEmployeeRows,
  validatePORows,
} from '../../../lib/dataImport';
import { Button, Card } from '../../common/UIComponents';
import { EmptyState } from '../../common/StateViews';
import { cn } from '../../../lib/utils';

type ImportKind = 'pos' | 'employees';

const KIND_INFO: Record<ImportKind, { label: string; columns: ImportColumn[]; fileName: string; help: string }> = {
  pos: {
    label: 'Purchase Orders',
    columns: PO_COLUMNS,
    fileName: 'primestar-po-import-template.csv',
    help: 'Projects must exist first (matched by Project Code). Invoices are added afterwards on each PO.',
  },
  employees: {
    label: 'Employees',
    columns: EMPLOYEE_COLUMNS,
    fileName: 'primestar-employee-import-template.csv',
    help: 'Imported employees can be tagged to POs straight away. Salary details are added later by HR.',
  },
};

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const DataImportView: React.FC = () => {
  const { projects, purchaseOrders, employees, importPurchaseOrders, importEmployees } = useData();
  const { can } = useRole();

  const kinds = (['pos', 'employees'] as ImportKind[]).filter((k) =>
    k === 'pos' ? can('po.create') : can('user.manage')
  );
  const [kind, setKind] = useState<ImportKind>(kinds[0] ?? 'pos');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult<unknown>[] | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const info = KIND_INFO[kind];
  const valid = results?.filter((r) => r.value) ?? [];
  const invalid = results?.filter((r) => !r.value) ?? [];

  const reset = () => {
    setFileName(null);
    setFileError(null);
    setResults(null);
    setImportedCount(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const switchKind = (k: ImportKind) => {
    setKind(k);
    reset();
  };

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv(info.columns)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = info.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setFileError('Please upload a .csv file. In Excel use File → Save As → "CSV UTF-8", then upload that file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('The file is larger than 2 MB. Split it into smaller files.');
      return;
    }
    const rows = parseCsv(await file.text());
    const { records, missingColumns } = rowsToRecords(rows, info.columns);
    if (missingColumns.length > 0) {
      setFileError(`These required columns are missing: ${missingColumns.join(', ')}. Start from the template.`);
      return;
    }
    if (records.length === 0) {
      setFileError('The file has a header row but no data rows.');
      return;
    }
    setResults(
      kind === 'pos' ? validatePORows(records, projects, purchaseOrders) : validateEmployeeRows(records, employees)
    );
  };

  const handleImport = () => {
    if (!results) return;
    const count =
      kind === 'pos'
        ? importPurchaseOrders(valid.map((r) => r.value as Parameters<typeof importPurchaseOrders>[0][number]))
        : importEmployees(valid.map((r) => r.value as Parameters<typeof importEmployees>[0][number]));
    setResults(null);
    setImportedCount(count);
    if (fileInput.current) fileInput.current.value = '';
  };

  // Columns shown in the preview: the required ones keep the table readable.
  const previewColumns = info.columns.filter((c) => c.required);

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-600" /> Data Import
        </h1>
        <p className="text-slate-500 mt-0.5">
          Bring existing POs and employees in from Prime Star's spreadsheets. Done once, before go-live.
        </p>
      </div>

      {kinds.length > 1 && (
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/80 w-fit">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              className={cn(
                'px-4 py-2 rounded-lg font-semibold cursor-pointer',
                kind === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {KIND_INFO[k].label}
            </button>
          ))}
        </div>
      )}

      {/* STEPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">1. Get the template</h2>
          <p className="text-slate-600">{info.help}</p>
          <p className="text-slate-500">
            Required columns: {info.columns.filter((c) => c.required).map((c) => c.label).join(', ')}. Dates can be
            2026-04-01 or 01/04/2026; amounts can include ₹ and commas.
          </p>
          <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={downloadTemplate}>
            Download {info.label} template
          </Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">2. Upload your filled-in file</h2>
          <p className="text-slate-600">Rows are checked first. Nothing is saved until you press Import.</p>
          <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 text-slate-600">
            <FileUp className="w-4 h-4" />
            <span>{fileName || 'Choose a .csv file'}</span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </Card>
      </div>

      {fileError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{fileError}</span>
        </div>
      )}

      {importedCount !== null && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          <span>
            {importedCount} {info.label.toLowerCase()} imported. Fix any skipped rows in the file and upload it again;
            rows already imported will be flagged as duplicates.
          </span>
        </div>
      )}

      {/* PREVIEW */}
      {results && (
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900">3. Check and import</h2>
              <p className="text-slate-600">
                <span className="text-emerald-700 font-semibold">{valid.length} ready</span>
                {invalid.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-red-600 font-semibold">{invalid.length} with problems (will be skipped)</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button variant="primary" disabled={valid.length === 0} onClick={handleImport}>
                Import {valid.length} row(s)
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="p-3">Row</th>
                  <th className="p-3">Status</th>
                  {previewColumns.map((c) => (
                    <th key={c.key} className="p-3 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.rowNumber} className={cn(!r.value && 'bg-red-50/40')}>
                    <td className="p-3 font-mono text-slate-500">{r.rowNumber}</td>
                    <td className="p-3 min-w-56">
                      {r.value ? (
                        <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      ) : (
                        <ul className="space-y-0.5 text-red-700">
                          {r.errors.map((e) => (
                            <li key={e} className="flex items-start gap-1">
                              <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {previewColumns.map((c) => (
                      <td key={c.key} className="p-3 whitespace-nowrap text-slate-700">
                        {r.record[c.key] || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!results && importedCount === null && !fileError && (
        <Card className="p-0">
          <EmptyState title="No file uploaded yet" message="Download the template, fill it in, then upload it above." />
        </Card>
      )}
    </div>
  );
};
