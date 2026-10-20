import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { fetchAndVerifyPdf } from './documentDownloader';

export interface SOWMergeResult {
  mergedBlob: Blob;
  mergedUint8Array: Uint8Array;
  numPages: number;
  originalFilename: string;
  mergedFilename: string;
}

/**
 * Merges a newly uploaded SOW document with an existing SOW document into a single unified PDF.
 */
export async function mergeSOWDocuments(
  existingSource: Blob | Uint8Array | ArrayBuffer | string | null | undefined,
  newFile: File | Blob,
  newFilename?: string,
  sowNumber?: string
): Promise<SOWMergeResult> {
  const mergedPdf = await PDFDocument.create();
  const cleanNewName = newFilename || (newFile as File).name || 'Additional_SOW.pdf';

  // 1. Process Existing SOW PDF
  let existingPagesAdded = 0;
  if (existingSource) {
    try {
      let existingBuffer: ArrayBuffer;
      if (typeof existingSource === 'string') {
        const verified = await fetchAndVerifyPdf(existingSource);
        existingBuffer = verified.arrayBuffer;
      } else if (existingSource instanceof Blob) {
        existingBuffer = await existingSource.arrayBuffer();
      } else if (existingSource instanceof ArrayBuffer) {
        existingBuffer = existingSource;
      } else {
        existingBuffer = existingSource.buffer as ArrayBuffer;
      }

      const existingDoc = await PDFDocument.load(existingBuffer, { ignoreEncryption: true });
      const pageIndices = existingDoc.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(existingDoc, pageIndices);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      existingPagesAdded = copiedPages.length;
    } catch (err) {
      console.warn('Could not load existing SOW as PDF, fallback to sample document:', err);
      // Fallback: fetch default SOW PDF
      try {
        const defaultVerified = await fetchAndVerifyPdf('/Statement_of_Work_Document.pdf');
        const defaultDoc = await PDFDocument.load(defaultVerified.arrayBuffer, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(defaultDoc, defaultDoc.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        existingPagesAdded = copiedPages.length;
      } catch (_) {}
    }
  } else {
    // If no existing SOW, fetch default SOW PDF
    try {
      const defaultVerified = await fetchAndVerifyPdf('/Statement_of_Work_Document.pdf');
      const defaultDoc = await PDFDocument.load(defaultVerified.arrayBuffer, { ignoreEncryption: true });
      const copiedPages = await mergedPdf.copyPages(defaultDoc, defaultDoc.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      existingPagesAdded = copiedPages.length;
    } catch (_) {}
  }

  // 2. Process Newly Uploaded File
  const newBuffer = await newFile.arrayBuffer();
  let isPdf = false;

  try {
    const newPdfDoc = await PDFDocument.load(newBuffer, { ignoreEncryption: true });
    const pageIndices = newPdfDoc.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(newPdfDoc, pageIndices);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
    isPdf = true;
  } catch (err) {
    console.log('New file is not a native PDF, creating a formatted PDF page for attached file content');
  }

  if (!isPdf) {
    // Create an addendum page in the merged PDF
    const page = mergedPdf.addPage([595.28, 841.89]); // A4
    const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica);

    page.drawRectangle({
      x: 20,
      y: 800,
      width: 555,
      height: 25,
      color: rgb(0.12, 0.16, 0.23),
    });

    page.drawText('PRIME STAR HRMS — ATTACHED SOW ADDENDUM DOCUMENT', {
      x: 30,
      y: 808,
      size: 10,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(`Attached File Name: ${cleanNewName}`, {
      x: 30,
      y: 770,
      size: 12,
      font: helveticaBold,
      color: rgb(0.12, 0.16, 0.23),
    });

    page.drawText(`Attached On: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}`, {
      x: 30,
      y: 750,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.35, 0.4),
    });

    page.drawText(`SOW Reference: ${sowNumber || 'SOW-HDFC-2025-001'}`, {
      x: 30,
      y: 730,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.35, 0.4),
    });

    page.drawLine({
      start: { x: 30, y: 715 },
      end: { x: 565, y: 715 },
      thickness: 1,
      color: rgb(0.8, 0.85, 0.9),
    });

    // Read text preview if text file
    try {
      const textDecoder = new TextDecoder('utf-8');
      const textContent = textDecoder.decode(newBuffer).substring(0, 2000);
      const lines = textContent.split('\n').slice(0, 30);

      let yPos = 690;
      page.drawText('Document Excerpt / Content Summary:', {
        x: 30,
        y: yPos,
        size: 11,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      yPos -= 20;

      for (const line of lines) {
        if (yPos < 50) break;
        const cleanLine = line.replace(/[\r\n\t]/g, ' ').substring(0, 90);
        page.drawText(cleanLine, {
          x: 30,
          y: yPos,
          size: 9,
          font: helvetica,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPos -= 14;
      }
    } catch (_) {}
  }

  // 3. Save Combined PDF
  const pdfBytes = await mergedPdf.save();
  const mergedBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const mergedUint8Array = pdfBytes;
  const numPages = mergedPdf.getPageCount();

  const cleanSowTag = sowNumber ? sowNumber.replace(/[\/\\]/g, '_') : 'SOW';
  const mergedFilename = `Merged_${cleanSowTag}_Master_${Date.now().toString().slice(-4)}.pdf`;

  return {
    mergedBlob,
    mergedUint8Array,
    numPages,
    originalFilename: cleanNewName,
    mergedFilename,
  };
}
