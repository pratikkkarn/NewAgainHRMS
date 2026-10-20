// Upload rules from the Architecture doc: only PDF, JPG and PNG, up to 10 MB,
// checked by the file's real content (its first bytes), not its name or the browser's guess.
// The backend repeats the same check before a file can be opened; a virus scanner comes later.

export type UploadKind = 'pdf' | 'jpg' | 'png';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const UPLOAD_HINT = 'PDF, JPG or PNG, up to 10 MB';

// Identifies a file from its leading bytes ("magic numbers").
export function detectUploadKind(head: Uint8Array): UploadKind | null {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpg';
  return null;
}

const EXTENSION_KIND: Record<string, UploadKind> = { pdf: 'pdf', jpg: 'jpg', jpeg: 'jpg', png: 'png' };

// Returns an error message, or null when the file may be uploaded.
export async function checkUpload(file: File): Promise<string | null> {
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `The file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 10 MB.`;
  }
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const kind = detectUploadKind(head);
  if (!kind) return 'Only PDF, JPG or PNG files can be uploaded.';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (EXTENSION_KIND[ext] && EXTENSION_KIND[ext] !== kind) {
    return `This file is really a ${kind.toUpperCase()}, but its name ends in .${ext}. Rename it and try again.`;
  }
  return null;
}
