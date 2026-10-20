import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function createSowPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // PAGE 1 — EXECUTIVE OVERVIEW & SCOPE
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, 210, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('PRIME STAR ENTERPRISE HRMS — OFFICIAL STATEMENT OF WORK', 14, 12);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(20);
  doc.text('STATEMENT OF WORK (SOW)', 14, 30);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Document Ref: SOW-HDFC-2025-001', 14, 37);
  doc.text('Client: Enterprise Financial Services', 14, 42);
  doc.text('Date of Execution: 15 January 2025', 14, 47);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 52, 196, 52);

  let y = 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(79, 70, 229);
  doc.text('1. PROJECT OBJECTIVES & OVERVIEW', 14, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const overviewLines = [
    'Prime Star Consulting Services agrees to provide senior cloud modernization engineering, microservices',
    'architecture, and technical talent solutions for Enterprise Financial Services. This project aims to replace',
    'legacy monolith infrastructure with highly scalable, zero-downtime microservices hosted on modern cloud environments.',
  ];
  overviewLines.forEach((l) => { doc.text(l, 14, y); y += 6; });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(79, 70, 229);
  doc.text('2. DETAILED DELIVERABLES & MILESTONES', 14, y);
  y += 8;

  const milestones = [
    ['Milestone 1', 'Architecture Discovery & Cloud Security Blueprint', '2 Weeks', '₹2,50,000'],
    ['Milestone 2', 'Microservices API Gateway & Core Identity Service', '4 Weeks', '₹3,50,000'],
    ['Milestone 3', 'Database Migration & Zero-Downtime Deployment', '3 Weeks', '₹2,50,000'],
    ['Milestone 4', 'UAT, Performance Testing & Final Handover', '2 Weeks', '₹1,50,000'],
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Phase', 18, y + 5.5);
  doc.text('Scope Description', 45, y + 5.5);
  doc.text('Timeline', 135, y + 5.5);
  doc.text('Billing Value', 168, y + 5.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  milestones.forEach(([m, desc, duration, amount]) => {
    doc.text(m, 18, y + 5);
    doc.text(desc, 45, y + 5);
    doc.text(duration, 135, y + 5);
    doc.text(amount, 168, y + 5);
    doc.setDrawColor(241, 245, 249);
    doc.line(14, y + 7, 196, y + 7);
    y += 8;
  });

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(79, 70, 229);
  doc.text('3. GOVERNANCE & COMPLIANCE', 14, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const govLines = [
    '• Daily standups with client product owners & bi-weekly sprint reviews.',
    '• Code quality enforceability via strict automated CI/CD security scanning.',
    '• Compliance with ISO-27001 and RBI financial cybersecurity standards.',
    '• Non-disclosure agreements (NDA) remain strictly binding across all assigned engineering staff.',
  ];
  govLines.forEach((l) => { doc.text(l, 14, y); y += 6; });

  // PAGE 2 — FINANCIALS & SIGNATURES
  doc.addPage();
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 210, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('PRIME STAR ENTERPRISE HRMS — SOW TERMS & SIGNATURES', 14, 12);

  y = 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(79, 70, 229);
  doc.text('4. FINANCIAL SUMMARY & PAYMENT TERMS', 14, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Total SOW Value: ₹10,00,000 (Excl. GST)', 14, y); y += 6;
  doc.text('GST Rate: 18% Applicable (Total Incl. GST: ₹11,80,000)', 14, y); y += 6;
  doc.text('Payment Schedule: Net 30 Days upon invoice issuance for each milestone.', 14, y); y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(79, 70, 229);
  doc.text('5. AUTHORIZED APPROVAL SIGNATURES', 14, y);
  y += 12;

  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, 85, 45);
  doc.rect(111, y, 85, 45);

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('For PRIME STAR CONSULTING SERVICES', 18, y + 8);
  doc.setFont('helvetica', 'italic');
  doc.text('Priya Sundaram', 18, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Vice President — Delivery & Operations', 18, y + 28);
  doc.text('Date: 15 Jan 2025', 18, y + 36);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('For ENTERPRISE CLIENT SERVICES', 115, y + 8);
  doc.setFont('helvetica', 'italic');
  doc.text('Authorized Client Signatory', 115, y + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Head of Procurement & Technology', 115, y + 28);
  doc.text('Date: 15 Jan 2025', 115, y + 36);

  const arrayBuffer = doc.output('arraybuffer');
  fs.writeFileSync(path.join(publicDir, 'Statement_of_Work_Document.pdf'), Buffer.from(arrayBuffer));
  console.log('Created Statement_of_Work_Document.pdf in public/');
}

function createQuotationPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('PRIME STAR CONSULTING SERVICES — COMMERCIAL QUOTATION', 14, 12);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(20);
  doc.text('COMMERCIAL QUOTATION', 14, 30);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Quotation Ref: QUOT-PS-2025-089', 14, 37);
  doc.text('SOW Reference: SOW-HDFC-2025-001', 14, 42);
  doc.text('Date: 10 January 2025', 14, 47);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 52, 196, 52);

  let y = 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Commercial Breakdown:', 14, y);
  y += 8;

  const items = [
    ['Cloud Microservices Consulting & Engineering', '₹7,50,000'],
    ['DevOps & Infrastructure Automation Setup', '₹1,50,000'],
    ['24/7 Production Deployment & SLA Support', '₹1,00,000'],
    ['Subtotal (Excl. GST)', '₹10,00,000'],
    ['GST @ 18%', '₹1,80,000'],
    ['Total Commercial Amount (Incl. GST)', '₹11,80,000'],
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Service Item Description', 18, y + 5.5);
  doc.text('Amount (INR)', 155, y + 5.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  items.forEach(([desc, amt], idx) => {
    if (idx >= 3) doc.setFont('helvetica', 'bold');
    doc.text(desc, 18, y + 5);
    doc.text(amt, 155, y + 5);
    doc.line(14, y + 7, 196, y + 7);
    y += 8;
  });

  const arrayBuffer = doc.output('arraybuffer');
  fs.writeFileSync(path.join(publicDir, 'Commercial_Quotation_Signed.pdf'), Buffer.from(arrayBuffer));
  console.log('Created Commercial_Quotation_Signed.pdf in public/');
}

function createPoPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, 210, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('PRIME STAR CONSULTING SERVICES — OFFICIAL PURCHASE ORDER', 14, 12);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(20);
  doc.text('PURCHASE ORDER', 14, 30);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('PO Number: PO-2025-8891', 14, 37);
  doc.text('Project: Cloud Modernization & Architecture', 14, 42);
  doc.text('Effective Date: 15 January 2025', 14, 47);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 52, 196, 52);

  let y = 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Purchase Order Financial Allocation:', 14, y);
  y += 8;

  const items = [
    ['Amount Excluding GST', '₹10,00,000'],
    ['GST Rate (18%)', '₹1,80,000'],
    ['Total Amount Including GST', '₹11,80,000'],
    ['Unbilled Remaining Balance', '₹10,00,000'],
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Financial Field', 18, y + 5.5);
  doc.text('Committed Value', 155, y + 5.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  items.forEach(([desc, amt], idx) => {
    if (idx === 2) doc.setFont('helvetica', 'bold');
    doc.text(desc, 18, y + 5);
    doc.text(amt, 155, y + 5);
    doc.line(14, y + 7, 196, y + 7);
    y += 8;
  });

  const arrayBuffer = doc.output('arraybuffer');
  fs.writeFileSync(path.join(publicDir, 'Sample_Purchase_Order.pdf'), Buffer.from(arrayBuffer));
  console.log('Created Sample_Purchase_Order.pdf in public/');
}

createSowPdf();
createQuotationPdf();
createPoPdf();
