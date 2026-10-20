/**
 * Upload rules from the Architecture doc: only PDF, JPG and PNG, up to 10 MB, checked by the file's real
 * content (its first bytes), not its name or the browser's guess. The API repeats the check before a file
 * can be opened; a virus scanner comes later.
 */

export type UploadKind = 'pdf' | 'jpg' | 'png';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_MIME: Record<UploadKind, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

const EXTENSION_KIND: Record<string, UploadKind> = { pdf: 'pdf', jpg: 'jpg', jpeg: 'jpg', png: 'png' };

/** Identifies a file from its leading bytes ("magic numbers"). */
export function detectUploadKind(head: Uint8Array): UploadKind | null {
  const starts = (signature: number[]): boolean => signature.every((byte, index) => head[index] === byte);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpg';
  return null;
}

/** Returns an error message, or null when a file with this name, size and leading bytes may be uploaded. */
export function checkUploadMeta(name: string, sizeBytes: number, head: Uint8Array): string | null {
  if (sizeBytes <= 0) return 'The file is empty.';
  if (sizeBytes > MAX_UPLOAD_BYTES) return `The file is ${(sizeBytes / (1024 * 1024)).toFixed(1)} MB. The limit is 10 MB.`;
  const kind = detectUploadKind(head);
  if (!kind) return 'Only PDF, JPG or PNG files can be uploaded.';
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const expected = EXTENSION_KIND[extension];
  if (expected && expected !== kind) {
    return `This file is really a ${kind.toUpperCase()}, but its name ends in .${extension}. Rename it and try again.`;
  }
  return null;
}
