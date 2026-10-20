import { z } from 'zod';

/**
 * Money is Decimal(14,2) in the database and travels as a string, never a float.
 * Accepts up to 12 integer digits and 2 decimal places, e.g. "1250000.00".
 */
export const Money = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Must be an amount with at most 2 decimal places');
export type Money = z.infer<typeof Money>;

/** GST rate as a percentage string, e.g. "18.00". */
export const GstRate = z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, 'Must be a percentage like 18');

/** Plain calendar date (no time, no timezone), compared in India time. */
export const IsoDate = z.iso.date();

const PAISE = 100n;

/** Convert a Money string to integer paise for exact arithmetic. */
export function toPaise(amount: Money): bigint {
  const negative = amount.startsWith('-');
  const [whole = '0', frac = ''] = amount.replace('-', '').split('.');
  const paise = BigInt(whole) * PAISE + BigInt(frac.padEnd(2, '0'));
  return negative ? -paise : paise;
}

/** Convert integer paise back to a Money string with 2 decimals. */
export function fromPaise(paise: bigint): Money {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = abs / PAISE;
  const frac = (abs % PAISE).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}
