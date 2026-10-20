import { createHash, randomBytes } from 'node:crypto';

/** SHA-256, hex. Used for refresh, invite and reset tokens: only the hash is ever stored. */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** 256 bits of randomness as URL-safe text (43 characters). */
export const randomToken = (): string => randomBytes(32).toString('base64url');

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);
export const addDays = (date: Date, days: number): Date => addMinutes(date, days * 24 * 60);
