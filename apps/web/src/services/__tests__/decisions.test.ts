import { describe, it, expect } from 'vitest';
import { defaultGstType, splitGst, INDIAN_STATES, COMPANY_GST_STATE } from '../../lib/gst';
import { detectUploadKind, checkUpload, MAX_UPLOAD_BYTES } from '../../lib/fileRules';

const fileOf = (bytes: number[], name: string, size?: number) => {
  const data = new Uint8Array(size ?? Math.max(bytes.length, 16));
  data.set(bytes);
  return new File([data], name);
};

describe('GST type from the place of supply', () => {
  it('pre-fills CGST + SGST in the company state and IGST elsewhere', () => {
    expect(defaultGstType(COMPANY_GST_STATE)).toBe('CGST_SGST');
    expect(defaultGstType('karnataka ')).toBe('CGST_SGST');
    expect(defaultGstType('Maharashtra')).toBe('IGST');
    expect(defaultGstType(undefined)).toBe('CGST_SGST');
  });

  it('splits intra-state GST into equal halves and keeps the total exact', () => {
    expect(splitGst(100000, 18, 'CGST_SGST')).toEqual({ cgst: 9000, sgst: 9000, igst: 0, total: 18000 });
    expect(splitGst(100000, 18, 'IGST')).toEqual({ cgst: 0, sgst: 0, igst: 18000, total: 18000 });
    const odd = splitGst(333.33, 18, 'CGST_SGST');
    expect(Math.round((odd.cgst + odd.sgst) * 100) / 100).toBe(odd.total);
  });

  it('lists every state once with its GST code', () => {
    const codes = INDIAN_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(INDIAN_STATES.find((s) => s.name === 'Karnataka')?.code).toBe('29');
  });
});

describe('Upload rules: PDF, JPG, PNG up to 10 MB, by content', () => {
  const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPG = [0xff, 0xd8, 0xff, 0xe0];
  const DOCX = [0x50, 0x4b, 0x03, 0x04]; // zip

  it('recognises files by their first bytes', () => {
    expect(detectUploadKind(new Uint8Array(PDF))).toBe('pdf');
    expect(detectUploadKind(new Uint8Array(PNG))).toBe('png');
    expect(detectUploadKind(new Uint8Array(JPG))).toBe('jpg');
    expect(detectUploadKind(new Uint8Array(DOCX))).toBeNull();
  });

  it('accepts real PDFs and images, rejects other types and disguised files', async () => {
    expect(await checkUpload(fileOf(PDF, 'po.pdf'))).toBeNull();
    expect(await checkUpload(fileOf(JPG, 'scan.jpeg'))).toBeNull();
    expect(await checkUpload(fileOf(DOCX, 'sow.docx'))).toMatch(/Only PDF, JPG or PNG/);
    expect(await checkUpload(fileOf(DOCX, 'renamed.pdf'))).toMatch(/Only PDF, JPG or PNG/);
    expect(await checkUpload(fileOf(PNG, 'photo.pdf'))).toMatch(/really a PNG/);
  });

  it('rejects empty and oversized files', async () => {
    expect(await checkUpload(new File([], 'empty.pdf'))).toMatch(/empty/);
    expect(await checkUpload(fileOf(PDF, 'big.pdf', MAX_UPLOAD_BYTES + 1))).toMatch(/limit is 10 MB/);
  });
});
