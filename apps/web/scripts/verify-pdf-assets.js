import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');

const pdfs = [
  'Statement_of_Work_Document.pdf',
  'Commercial_Quotation_Signed.pdf',
  'Sample_Purchase_Order.pdf',
];

console.log('=== VERIFYING PUBLIC PDF ASSETS ===');

let allValid = true;

pdfs.forEach((filename) => {
  const filePath = path.join(publicDir, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] Missing file: ${filename}`);
    allValid = false;
    return;
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    console.error(`[FAIL] File is empty (0 bytes): ${filename}`);
    allValid = false;
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const header = buffer.subarray(0, 4).toString('utf-8');

  if (header !== '%PDF') {
    console.error(`[FAIL] Invalid signature '${header}' (expected '%PDF'): ${filename}`);
    allValid = false;
    return;
  }

  console.log(`[OK] ${filename} — Size: ${stats.size} bytes | Header: ${header}-1.7`);
});

if (allValid) {
  console.log('=== ALL PDF ASSETS VALIDATED SUCCESSFULLY ===');
} else {
  console.error('=== SOME PDF ASSETS FAILED VALIDATION ===');
  process.exit(1);
}
