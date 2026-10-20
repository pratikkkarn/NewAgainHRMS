// GST type follows the place of supply: the same state as Prime Star's registration
// is an intra-state supply (CGST + SGST, half each); a different state is inter-state (IGST).
// The type is pre-filled from the billing state and can still be changed by hand.

export type GstType = 'CGST_SGST' | 'IGST';

export const GST_TYPE_LABELS: Record<GstType, string> = {
  CGST_SGST: 'CGST + SGST (same state)',
  IGST: 'IGST (other state)',
};

// Prime Star's GST registration state. Moves to a company setting when the backend exists.
export const COMPANY_GST_STATE = 'Karnataka';

// States and union territories with their GST state codes.
export const INDIAN_STATES: { name: string; code: string }[] = [
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Assam', code: '18' },
  { name: 'Bihar', code: '10' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { name: 'Delhi', code: '07' },
  { name: 'Goa', code: '30' },
  { name: 'Gujarat', code: '24' },
  { name: 'Haryana', code: '06' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Karnataka', code: '29' },
  { name: 'Kerala', code: '32' },
  { name: 'Ladakh', code: '38' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Manipur', code: '14' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Mizoram', code: '15' },
  { name: 'Nagaland', code: '13' },
  { name: 'Odisha', code: '21' },
  { name: 'Puducherry', code: '34' },
  { name: 'Punjab', code: '03' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Sikkim', code: '11' },
  { name: 'Tamil Nadu', code: '33' },
  { name: 'Telangana', code: '36' },
  { name: 'Tripura', code: '16' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'West Bengal', code: '19' },
];

export function defaultGstType(billingState: string | undefined, companyState = COMPANY_GST_STATE): GstType {
  if (!billingState) return 'CGST_SGST';
  return billingState.trim().toLowerCase() === companyState.trim().toLowerCase() ? 'CGST_SGST' : 'IGST';
}

export interface GstSplit {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

// Splits the GST on an amount by type. Rounded to paise; CGST and SGST are equal halves.
export function splitGst(amountExclGst: number, ratePercent: number, type: GstType): GstSplit {
  const total = Math.round(amountExclGst * ratePercent) / 100;
  if (type === 'IGST') return { cgst: 0, sgst: 0, igst: total, total };
  const half = Math.round((total / 2) * 100) / 100;
  return { cgst: half, sgst: Math.round((total - half) * 100) / 100, igst: 0, total };
}
