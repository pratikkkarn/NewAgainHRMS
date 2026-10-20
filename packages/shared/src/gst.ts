import { fromPaise, type Money, toPaise } from './money.js';

/**
 * GST type follows the place of supply: the same state as Prime Star's registration is an intra-state
 * supply (CGST + SGST, half each); a different state is inter-state (IGST). The type is pre-filled from
 * the PO's billing state and can still be changed by hand.
 */

export type GstTypeName = 'CGST_SGST' | 'IGST';

/** States and union territories with their 2-digit GST state codes. */
export const INDIAN_STATES: readonly { name: string; code: string }[] = [
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

export const isStateCode = (code: string): boolean => INDIAN_STATES.some((state) => state.code === code);

/** Same state is CGST + SGST, anything else is IGST. With no billing state, assume the common case. */
export function defaultGstType(billingStateCode: string | null | undefined, companyStateCode: string): GstTypeName {
  if (!billingStateCode) return 'CGST_SGST';
  return billingStateCode === companyStateCode ? 'CGST_SGST' : 'IGST';
}

/** "18" or "12.5" as hundredths of a percent: 1800 and 1250. */
export function rateToHundredths(rate: string): bigint {
  const [whole = '0', frac = ''] = rate.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2));
}

export interface GstSplit {
  cgst: Money;
  sgst: Money;
  igst: Money;
  total: Money;
}

/**
 * GST on an amount, rounded once to the nearest paisa (half up). CGST and SGST are equal halves; when the
 * total is an odd number of paise, the extra paisa goes to SGST so the two always add up exactly.
 */
export function splitGst(amountExGst: Money, ratePercent: string, type: GstTypeName): GstSplit {
  const amount = toPaise(amountExGst);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const raw = (abs * rateToHundredths(ratePercent) + 5000n) / 10000n;
  const total = negative ? -raw : raw;
  if (type === 'IGST') return { cgst: fromPaise(0n), sgst: fromPaise(0n), igst: fromPaise(total), total: fromPaise(total) };
  const cgst = total / 2n;
  return { cgst: fromPaise(cgst), sgst: fromPaise(total - cgst), igst: fromPaise(0n), total: fromPaise(total) };
}

/** Amount including GST. */
export function addGst(amountExGst: Money, ratePercent: string): Money {
  return fromPaise(toPaise(amountExGst) + toPaise(splitGst(amountExGst, ratePercent, 'IGST').total));
}
