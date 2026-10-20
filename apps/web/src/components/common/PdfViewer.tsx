import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertCircle,
  Loader2,
  List,
  FileText,
} from 'lucide-react';
import { fetchAndVerifyPdf } from '../../lib/documentDownloader';

// Configure worker URL from Vite's native bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfViewerProps {
  pdfUrl?: string | null;
  fileData?: File | Blob | ArrayBuffer | Uint8Array | null;
  title?: string;
  onLoadSuccess?: (numPages: number) => void;
  onLoadError?: (error: Error) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  fileData,
  title,
  onLoadSuccess,
  onLoadError,
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load and Verify PDF Document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    async function loadPdf() {
      try {
        let uint8Array: Uint8Array;

        if (fileData) {
          let verifiedBlob: Blob;
          if (fileData instanceof Uint8Array) {
            verifiedBlob = new Blob([fileData.buffer as ArrayBuffer]);
          } else if (fileData instanceof ArrayBuffer) {
            verifiedBlob = new Blob([fileData]);
          } else {
            verifiedBlob = fileData;
          }
          const verified = await fetchAndVerifyPdf(verifiedBlob);
          uint8Array = verified.uint8Array;
        } else if (pdfUrl) {
          const verified = await fetchAndVerifyPdf(pdfUrl);
          uint8Array = verified.uint8Array;
        } else {
          throw new Error('No PDF URL or file data provided.');
        }

        if (isCancelled) return;

        const docLoadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const loadedDoc = await docLoadingTask.promise;

        if (isCancelled) return;

        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setCurrentPage(1);
        setLoading(false);
        if (onLoadSuccess) onLoadSuccess(loadedDoc.numPages);
      } catch (err: any) {
        if (isCancelled) return;
        console.error('PdfViewer Load Error:', err);
        const errMsg = err?.message || 'Failed to parse PDF document.';
        setError(errMsg);
        setLoading(false);
        if (onLoadError) onLoadError(err instanceof Error ? err : new Error(errMsg));
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [pdfUrl, fileData]);

  return (
    <div className="flex flex-col h-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-inner">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-white border-b border-slate-200 text-xs shrink-0 select-none">
        {/* PAGE NAVIGATION */}
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1 || loading || !!error}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-700 transition-colors cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-medium text-slate-700 text-xs">
            Page <strong className="text-slate-900 font-bold">{numPages > 0 ? currentPage : 0}</strong> of{' '}
            <strong className="text-slate-900 font-bold">{numPages}</strong>
          </span>
          <button
            disabled={currentPage >= numPages || loading || !!error}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-700 transition-colors cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* VIEW MODE TOGGLE & ZOOM CONTROLS */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium border border-slate-200">
            <button
              onClick={() => setViewMode('single')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'single'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Single Page
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Pages ({numPages})
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              disabled={scale <= 0.6 || loading || !!error}
              onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.2) * 10) / 10))}
              className="p-1 rounded hover:bg-white text-slate-700 disabled:opacity-30 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] font-bold text-slate-800 px-1">
              {Math.round(scale * 100)}%
            </span>
            <button
              disabled={scale >= 2.5 || loading || !!error}
              onClick={() => setScale((s) => Math.min(2.5, Math.round((s + 0.2) * 10) / 10))}
              className="p-1 rounded hover:bg-white text-slate-700 disabled:opacity-30 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={loading || !!error}
              onClick={() => setScale(1.25)}
              className="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 transition-colors ml-1 cursor-pointer"
              title="Reset Zoom (125%)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* CANVAS PREVIEW AREA */}
      <div className="flex-1 overflow-auto p-4 flex justify-center items-start min-h-[500px] max-h-[640px] relative bg-slate-100">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 text-slate-600 space-y-3 z-10">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="text-xs font-semibold">Verifying & Rendering PDF Document...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center p-8 bg-white border border-red-200 rounded-xl shadow-sm my-auto max-w-md text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-500" />
            <h4 className="text-sm font-bold text-slate-900">PDF Rendering Error</h4>
            <p className="text-xs text-slate-600 leading-relaxed font-mono bg-slate-50 p-2 rounded border border-slate-200">
              {error}
            </p>
          </div>
        )}

        {!loading && !error && pdfDoc && (
          <div className="flex flex-col gap-6 items-center">
            {viewMode === 'single' ? (
              <PdfPageCanvas
                key={currentPage}
                pdfDoc={pdfDoc}
                pageNum={currentPage}
                scale={scale}
              />
            ) : (
              Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
                <PdfPageCanvas
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  scale={scale}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  scale: number;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({ pdfDoc, pageNum, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let renderTask: pdfjsLib.RenderTask | null = null;
    let isCancelled = false;

    async function renderPage() {
      if (!canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        // High-DPI / Retina Crisp Scaling
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Set backing store dimensions scaled by devicePixelRatio
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);

        // Set CSS display dimensions
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform =
          pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform,
        };

        renderTask = page.render(renderContext as any);
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div className="relative shadow-lg rounded-md overflow-hidden bg-white border border-slate-200 my-1">
      <canvas ref={canvasRef} className="block" />
      <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] px-2 py-0.5 rounded font-mono select-none">
        Page {pageNum}
      </div>
    </div>
  );
};
