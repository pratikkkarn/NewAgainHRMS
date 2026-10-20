import React, { useState } from 'react';
import { PurchaseOrder } from '../../../types/domain';
import { useData } from '../../../context/DataContext';
import { Modal, Button } from '../../common/UIComponents';
import { FileUp, FileText, Upload, CheckCircle2, AlertCircle, Loader2, Layers } from 'lucide-react';

interface SOWUploadMergeModalProps {
  po: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SOWUploadMergeModal: React.FC<SOWUploadMergeModalProps> = ({
  po,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { uploadAndMergeSOW } = useData();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
        setError('Please select a valid PDF document.');
        setFile(null);
        return;
      }
      setError(null);
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an additional SOW PDF file to merge.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await uploadAndMergeSOW(po.id, file, notes);
      setLoading(false);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('SOW Upload/Merge Error:', err);
      setError(err?.message || 'Failed to merge SOW document.');
      setLoading(false);
    }
  };

  const existingSowName = po.mergedSowDocumentName || po.sowNumber || 'Statement_of_Work_Document.pdf';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload & Merge SOW Document" maxWidth="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1">
            <span className="font-bold text-slate-900 block">SOW Document Chain Merge</span>
            <p className="text-slate-600 leading-relaxed">
              Uploading an additional SOW will combine it with the existing SOW (<strong className="font-mono text-slate-800">{existingSowName}</strong>) into a unified master PDF document.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* UPLOAD BOX */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">Select Additional SOW PDF Document</label>
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors bg-slate-50/50 relative">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="p-3 bg-white rounded-full shadow-sm border border-slate-200 text-indigo-600">
                <Upload className="w-6 h-6" />
              </div>
              {file ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-1 font-mono">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {file.name}
                  </p>
                  <p className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(1)} KB — Click to change file</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-700">
                    <span className="text-indigo-600 font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-[11px] text-slate-500">PDF files up to 25MB supported</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* NOTES / ADDENDUM DESCRIPTION */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">Addendum Description / Revision Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g., SOW Addendum #1 for Q4 Cloud Architecture Expansion and additional resource allocation"
            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading || !file} icon={loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}>
            {loading ? 'Merging & Uploading SOW...' : 'Upload & Merge SOW'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
