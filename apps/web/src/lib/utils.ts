import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Short Indian-style amounts: ₹1.25 Cr, ₹75 L, ₹4.5k. Trailing zeros are dropped.
export function formatINRCompact(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const a = Math.abs(amount);
  const trim = (n: number, digits: number) => n.toFixed(digits).replace(/\.?0+$/, '');
  if (a >= 10000000) return `${sign}₹${trim(a / 10000000, 2)} Cr`;
  if (a >= 100000) return `${sign}₹${trim(a / 100000, 2)} L`;
  if (a >= 1000) return `${sign}₹${trim(a / 1000, 1)}k`;
  return formatINR(amount);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

/**
 * Returns calendar day difference between expiry date and reference date (today by default).
 * Result: positive = days remaining, 0 = expires today, negative = days past expiry.
 * Returns null for invalid or missing dates.
 */
export function getDaysRemainingCalendar(expiryDate: string, refDateInput?: Date | string): number | null {
  if (!expiryDate || typeof expiryDate !== 'string') return null;
  const expClean = expiryDate.trim().split('T')[0];
  const expParts = expClean.split('-').map((p) => parseInt(p, 10));
  if (expParts.length !== 3 || expParts.some(isNaN)) return null;

  const [expY, expM, expD] = expParts;
  const expUtc = Date.UTC(expY, expM - 1, expD);

  let refY: number, refM: number, refD: number;
  if (refDateInput instanceof Date) {
    if (isNaN(refDateInput.getTime())) return null;
    refY = refDateInput.getFullYear();
    refM = refDateInput.getMonth() + 1;
    refD = refDateInput.getDate();
  } else if (typeof refDateInput === 'string' && refDateInput) {
    const refClean = refDateInput.trim().split('T')[0];
    const refParts = refClean.split('-').map((p) => parseInt(p, 10));
    if (refParts.length === 3 && !refParts.some(isNaN)) {
      [refY, refM, refD] = refParts;
    } else {
      const d = new Date(refDateInput);
      if (isNaN(d.getTime())) return null;
      refY = d.getFullYear();
      refM = d.getMonth() + 1;
      refD = d.getDate();
    }
  } else {
    const d = new Date();
    refY = d.getFullYear();
    refM = d.getMonth() + 1;
    refD = d.getDate();
  }

  const refUtc = Date.UTC(refY, refM - 1, refD);
  return Math.round((expUtc - refUtc) / (1000 * 60 * 60 * 24));
}

export function getDaysRemaining(expiryDate: string, refDateInput?: Date | string): number {
  const diff = getDaysRemainingCalendar(expiryDate, refDateInput);
  if (diff === null) return 999;
  return diff;
}

export function getExpiryCountdownLabel(expiryDate: string, refDateInput?: Date | string): string {
  const diff = getDaysRemainingCalendar(expiryDate, refDateInput);
  if (diff === null) return '—';
  if (diff > 60) {
    return `${diff} days left`;
  } else if (diff > 0) {
    return `Ends in ${diff} day${diff === 1 ? '' : 's'}`;
  } else if (diff === 0) {
    return `Expires today`;
  } else {
    const absDays = Math.abs(diff);
    return `Expired ${absDays} day${absDays === 1 ? '' : 's'} ago`;
  }
}

export function formatExpiringSoonSubtitle(expiringItems: { days: number }[]): string {
  if (expiringItems.length === 0) return 'Within 60 days';

  if (expiringItems.length === 1) {
    const d = expiringItems[0].days;
    if (d === 0) return '1 PO · Expires today';
    return `1 PO · ${d} day${d === 1 ? '' : 's'} remaining`;
  }

  if (expiringItems.length === 2) {
    const d1 = expiringItems[0].days;
    const d2 = expiringItems[1].days;
    const str1 = d1 === 0 ? 'Expires today' : `${d1} days`;
    const str2 = d2 === 0 ? 'Expires today' : `${d2} days`;
    return `2 POs · ${str1} and ${str2} remaining`;
  }

  const dayList = expiringItems.map((item) => (item.days === 0 ? '0d' : `${item.days}d`)).join(', ');
  return `${expiringItems.length} POs · ${dayList} remaining`;
}

export function numberToWordsINR(num: number): string {
  if (isNaN(num) || num <= 0) return 'Indian Rupees Zero Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return units[n];
    const t = tens[Math.floor(n / 10)];
    const u = units[n % 10];
    return u ? `${t} ${u}` : t;
  };

  const convertThreeDigits = (n: number): string => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += `${units[hundred]} Hundred`;
    }
    if (rest > 0) {
      const restWords = convertTwoDigits(rest);
      res = res ? `${res} ${restWords}` : restWords;
    }
    return res;
  };

  const absoluteNum = Math.abs(num);
  let integerPart = Math.floor(absoluteNum);
  const decimalPart = Math.round((absoluteNum - integerPart) * 100);
  let words = '';

  const crore = Math.floor(integerPart / 10000000);
  integerPart %= 10000000;

  const lakh = Math.floor(integerPart / 100000);
  integerPart %= 100000;

  const thousand = Math.floor(integerPart / 1000);
  integerPart %= 1000;

  const hundred = integerPart;

  if (crore > 0) {
    words += `${convertTwoDigits(crore)} Crore `;
  }
  if (lakh > 0) {
    words += `${convertTwoDigits(lakh)} Lakh `;
  }
  if (thousand > 0) {
    words += `${convertTwoDigits(thousand)} Thousand `;
  }
  if (hundred > 0) {
    words += `${convertThreeDigits(hundred)} `;
  }

  const finalStr = words.trim();
  let result = finalStr ? `Indian Rupees ${finalStr}` : 'Indian Rupees Zero';

  if (decimalPart > 0) {
    const paiseStr = convertTwoDigits(decimalPart);
    result = finalStr
      ? `${result} And ${paiseStr} Paise Only`
      : `Indian Rupees ${paiseStr} Paise Only`;
  } else {
    result = `${result} Only`;
  }

  return result;
}
