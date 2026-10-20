import React from 'react';
import { PurchaseOrder, ProformaInvoice, ProformaLineItem } from '../../../types/domain';
import { formatINR, formatDate, numberToWordsINR } from '../../../lib/utils';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

export interface ProformaDocumentTemplateProps {
  proforma: Partial<ProformaInvoice> & {
    proformaNumber: string;
    employeeName: string;
    employeeId: string;
    designation: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    amountExclGst: number;
    gstRate: number;
    gstAmount: number;
    totalAmountInclGst: number;
    lineItems?: ProformaLineItem[];
    notes?: string;
    version?: number;
    status?: string;
  };
  po: PurchaseOrder;
  showWatermark?: boolean;
}

export const ProformaDocumentTemplate: React.FC<ProformaDocumentTemplateProps> = ({
  proforma,
  po,
  showWatermark = true,
}) => {
  const versionNum = proforma.version || 1;
  const isDraft = !proforma.status || proforma.status === 'Draft';

  // Bank details
  const bankDetails = {
    bankName: 'HDFC Bank Ltd.',
    accountName: 'Prime Star Consulting Services Pvt. Ltd.',
    accountNumber: '50200084920192',
    ifscCode: 'HDFC0000128',
    branch: 'Koramangala 4th Block, Bengaluru - 560034',
    micr: '560240012',
    accountType: 'Current Account',
  };

  // Company details
  const companyInfo = {
    name: 'PRIME STAR CONSULTING SERVICES PVT. LTD.',
    address: 'Tower B, 4th Floor, Prestige Tech Park, Outer Ring Road, Marathahalli, Bengaluru, Karnataka, 560103, India',
    cin: 'U72200KA2019PTC123456',
    gstin: '29AABCP1234F1Z5',
    pan: 'ABCPS1234F',
    state: 'Karnataka',
    stateCode: '29',
    email: 'billing@primestarconsulting.com',
    phone: '+91 80 4000 8888',
  };

  // Client info
  const clientName = po.projectName?.includes('HPE')
    ? 'Hewlett Packard Enterprise India Pvt. Ltd.'
    : po.projectName?.includes('HDFC')
      ? 'HDFC Bank Ltd.'
      : po.projectName?.includes('Infosys')
        ? 'Infosys Ltd.'
        : po.projectName || 'Enterprise Client Ltd.';

  // Tax breakdown (CGST 9% + SGST 9% for Karnataka intra-state or IGST 18%)
  const cgstRate = proforma.gstRate ? proforma.gstRate / 2 : 9;
  const sgstRate = proforma.gstRate ? proforma.gstRate / 2 : 9;
  const cgstAmount = Math.round(proforma.amountExclGst * (cgstRate / 100));
  const sgstAmount = proforma.gstAmount - cgstAmount;

  const items = proforma.lineItems && proforma.lineItems.length > 0
    ? proforma.lineItems
    : [
      {
        id: 'li-default',
        description: proforma.notes || `${proforma.designation} — Milestone deliverables and consulting services`,
        quantity: proforma.billableDays || 1,
        rate: proforma.amountExclGst,
        amount: proforma.amountExclGst,
        hsnSac: '998313',
      },
    ];

  const amountInWords = numberToWordsINR(proforma.totalAmountInclGst);

  return (
    <div className="relative bg-white text-slate-900 border-2 border-slate-800 p-6 sm:p-8 max-w-[850px] mx-auto shadow-lg font-sans text-xs print:p-0 print:border-none print:shadow-none print:max-w-none">
      {/* OPTIONAL WATERMARK */}
      {showWatermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-[0.03] select-none rotate-[-30deg]">
          <span className="text-8xl font-black tracking-widest text-slate-900 uppercase">
            {proforma.status === 'Draft' ? 'DRAFT ESTIMATE' : 'PROFORMA'}
          </span>
        </div>
      )}

      {/* HEADER SECTION (EXCEL TEMPLATE GRID) */}
      <div className="border border-slate-800 mb-[-1px]">
        <div className="grid grid-cols-12 divide-x divide-slate-800">
          {/* COMPANY / SUPPLIER LOGO & DETAILS (LEFT 7 COLS) */}
          <div className="col-span-7 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs border border-blue-700 shrink-0">
                ★
              </div>
              <div>
                <h1 className="font-black text-sm tracking-tight text-slate-900 leading-none">
                  {companyInfo.name}
                </h1>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Enterprise IT & Cloud Consulting Services
                </span>
              </div>
            </div>

            <div className="text-[10px] text-slate-600 leading-relaxed pt-1">
              {companyInfo.address}
            </div>

            <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-700 pt-0.5 font-medium">
              <div>GSTIN: <span className="font-mono font-bold text-slate-900">{companyInfo.gstin}</span></div>
              <div>PAN: <span className="font-mono font-bold text-slate-900">{companyInfo.pan}</span></div>
              <div>State: <span className="font-bold">{companyInfo.state}</span> (Code: {companyInfo.stateCode})</div>
              <div>CIN: <span className="font-mono">{companyInfo.cin}</span></div>
              <div className="col-span-2 text-slate-500">Email: {companyInfo.email}</div>
            </div>
          </div>

          {/* DOCUMENT HEADER BOX (RIGHT 5 COLS) */}
          <div className="col-span-5 p-3.5 bg-slate-50 flex flex-col justify-between">
            <div>
              <div className="bg-slate-900 text-white text-center py-1 rounded font-bold uppercase tracking-wider text-xs mb-2">
                PROFORMA INVOICE
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Proforma No:</span>
                  <span className="font-mono font-bold text-indigo-700">{proforma.proformaNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Dated:</span>
                  <span className="font-semibold text-slate-900">
                    {formatDate(proforma.updatedAt || new Date().toISOString())}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">PO Reference:</span>
                  <span className="font-mono font-bold text-slate-900">{po.poNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Revision:</span>
                  <span className="font-mono font-semibold text-slate-700">v{versionNum} ({proforma.status || 'Draft'})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Payment Terms:</span>
                  <span className="font-semibold text-slate-800">Net 30 Days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BILLED TO / SHIP TO / RESOURCE GRID */}
      <div className="border border-slate-800 mb-[-1px]">
        <div className="grid grid-cols-12 divide-x divide-slate-800">
          {/* BILLED TO (BUYER) */}
          <div className="col-span-6 p-3 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Billed To (Client / Buyer):
            </span>
            <div className="font-bold text-slate-900 text-xs">{clientName}</div>
            <div className="text-[10px] text-slate-600 leading-snug">
              {po.billingAddress || 'Corporate Procurement Office, India'}
            </div>
            <div className="text-[10px] text-slate-700 pt-1">
              Project: <strong className="text-slate-900">{po.projectName}</strong>
            </div>
          </div>

          {/* SHIP TO & RESOURCE DETAILS */}
          <div className="col-span-6 p-3 space-y-1 bg-slate-50/50">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Resource Attribution & Delivery Site:
            </span>
            <div className="text-[11px] text-slate-800">
              Assigned Consultant: <strong className="text-slate-900">{proforma.employeeName}</strong> ({proforma.employeeId})
            </div>
            <div className="text-[10px] text-slate-600">
              Role: <strong>{proforma.designation}</strong>
            </div>
            <div className="text-[10px] text-slate-700 pt-1">
              Billing Period: <strong>{formatDate(proforma.billingPeriodStart)} to {formatDate(proforma.billingPeriodEnd)}</strong> ({proforma.billingMonth} {proforma.billingYear})
            </div>
            <div className="text-[10px] text-slate-500">
              Method: {proforma.billableDaysMethod === 'working_days' ? 'Working Days (Excl. Weekends)' : proforma.billableDaysMethod === 'manual' ? 'Manual Days' : 'Calendar Days'} · {proforma.billableDays || 0} Days
            </div>
          </div>
        </div>
      </div>

      {/* SERVICE LINE ITEMS TABLE */}
      <div className="border border-slate-800 mb-[-1px]">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-800 divide-x divide-slate-800">
              <th className="p-2 w-10 text-center">Sl.</th>
              <th className="p-2">Description of Services / Deliverables</th>
              <th className="p-2 w-20 text-center">HSN/SAC</th>
              <th className="p-2 w-20 text-right">Qty / Units</th>
              <th className="p-2 w-28 text-right">Rate (₹)</th>
              <th className="p-2 w-32 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {items.map((item, idx) => (
              <tr key={item.id} className="divide-x divide-slate-800 hover:bg-slate-50/50">
                <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                <td className="p-2">
                  <div className="font-semibold text-slate-900">{item.description}</div>
                  {idx === 0 && proforma.notes && (
                    <div className="text-[10px] text-slate-500 italic mt-0.5">{proforma.notes}</div>
                  )}
                </td>
                <td className="p-2 text-center font-mono text-slate-600">
                  {item.hsnSac || '998313'}
                </td>
                <td className="p-2 text-right font-mono text-slate-700">
                  {item.quantity.toFixed ? item.quantity.toFixed(1) : item.quantity}
                </td>
                <td className="p-2 text-right font-mono text-slate-700">
                  {formatINR(item.rate)}
                </td>
                <td className="p-2 text-right font-mono font-bold text-slate-900">
                  {formatINR(item.amount)}
                </td>
              </tr>
            ))}

            {/* FILLER ROW FOR EXCEL LOOK IF FEW ITEMS */}
            {items.length === 1 && (
              <tr className="divide-x divide-slate-800 text-[10px] text-slate-400 italic">
                <td className="p-2 text-center">—</td>
                <td className="p-2">Sprint acceptance & cloud engineering milestones delivered as per PO scope</td>
                <td className="p-2 text-center">—</td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* TAX BREAKDOWN & TOTALS (MATCHING EXCEL SPREADSHEET FOOTER) */}
      <div className="border border-slate-800 mb-[-1px]">
        <div className="grid grid-cols-12 divide-x divide-slate-800">
          {/* AMOUNT IN WORDS & TERMS (LEFT 7 COLS) */}
          <div className="col-span-7 p-3 flex flex-col justify-between space-y-2">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                Amount Chargeable (in words):
              </span>
              <div className="font-bold text-slate-900 italic text-[11px] leading-snug">
                {amountInWords}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                Proforma Invoice Conditions:
              </span>
              <ul className="list-disc pl-3 text-[9.5px] text-slate-600 space-y-0.5">
                <li>This is an estimate for milestone deliverables and <strong>not a final Tax Invoice</strong>.</li>
                <li>This document does <strong>not debit client PO balance</strong> until formally approved & issued.</li>
                <li>Payment to be released within 30 days from official invoice generation.</li>
              </ul>
            </div>
          </div>

          {/* FINANCIAL TOTALS STRIP (RIGHT 5 COLS) */}
          <div className="col-span-5 divide-y divide-slate-800 bg-slate-50/40 text-[11px]">
            <div className="p-2 flex justify-between">
              <span className="text-slate-600">Taxable Value (Before Tax):</span>
              <span className="font-mono font-bold text-slate-900">{formatINR(proforma.amountExclGst)}</span>
            </div>

            <div className="p-2 flex justify-between text-slate-600">
              <span>Central GST (CGST) @ {cgstRate}%:</span>
              <span className="font-mono">{formatINR(cgstAmount)}</span>
            </div>

            <div className="p-2 flex justify-between text-slate-600">
              <span>State GST (SGST) @ {sgstRate}%:</span>
              <span className="font-mono">{formatINR(sgstAmount)}</span>
            </div>

            <div className="p-2 flex justify-between text-slate-600 font-medium">
              <span>Total GST ({proforma.gstRate}%):</span>
              <span className="font-mono font-bold text-slate-800">{formatINR(proforma.gstAmount)}</span>
            </div>

            <div className="p-2.5 bg-indigo-50/80 flex justify-between items-center text-xs">
              <span className="font-bold text-indigo-950 uppercase">Total Proforma (INR):</span>
              <span className="font-mono font-black text-indigo-900 text-sm">
                {formatINR(proforma.totalAmountInclGst)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BANK DETAILS & SIGNATURE (TWO COMPACT BOXES) */}
      <div className="border border-slate-800">
        <div className="grid grid-cols-12 divide-x divide-slate-800">
          {/* BANK REMITTANCE (LEFT 6 COLS) */}
          <div className="col-span-6 p-3 space-y-1 text-[10px]">
            <span className="font-bold text-slate-700 uppercase tracking-wider block">
              Company Bank Account For Remittance:
            </span>
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              <span className="text-slate-500">Bank Name:</span>
              <span className="col-span-2 font-bold text-slate-900">{bankDetails.bankName}</span>

              <span className="text-slate-500">A/C Name:</span>
              <span className="col-span-2 font-bold text-slate-900">{bankDetails.accountName}</span>

              <span className="text-slate-500">A/C No:</span>
              <span className="col-span-2 font-mono font-bold text-slate-900">{bankDetails.accountNumber}</span>

              <span className="text-slate-500">IFSC Code:</span>
              <span className="col-span-2 font-mono font-bold text-slate-900">{bankDetails.ifscCode}</span>

              <span className="text-slate-500">Branch:</span>
              <span className="col-span-2 text-slate-700">{bankDetails.branch}</span>
            </div>
          </div>

          {/* SIGNATURE & DECLARATION (RIGHT 6 COLS) */}
          <div className="col-span-6 p-3 flex flex-col justify-between text-[10px]">
            <div>
              <span className="font-bold text-slate-700 block uppercase">
                Declaration:
              </span>
              <p className="text-slate-600 text-[9.5px] leading-tight pt-0.5">
                We declare that this proforma invoice shows the actual price of the services described and that all particulars are true and correct.
              </p>
            </div>

            <div className="text-right pt-4">
              <div className="font-bold text-slate-900 text-[10px] uppercase">
                For {companyInfo.name}
              </div>
              <div className="h-9 flex items-center justify-end">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[9px] font-bold">
                  <ShieldCheck className="w-3 h-3 text-indigo-600" />
                  Digitally Authenticated Pre-Bill
                </span>
              </div>
              <div className="text-slate-500 font-semibold text-[9.5px]">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER NOTICE */}
      <div className="text-center pt-2 text-[9px] text-slate-400">
        Subject to Bengaluru Jurisdiction · Generated by Prime Star Enterprise HRMS & Financial Operations
      </div>
    </div>
  );
};
