import { describe, expect, it } from 'vitest';
import { fromPaise, Money, toPaise } from './money.js';

describe('money', () => {
  it('round-trips amounts through paise without float error', () => {
    for (const value of ['0.00', '0.1', '1250000.50', '-42.07', '999999999999.99']) {
      expect(fromPaise(toPaise(value))).toBe(Number(value).toFixed(2));
    }
  });

  it('adds exactly where floats would drift', () => {
    expect(fromPaise(toPaise('0.10') + toPaise('0.20'))).toBe('0.30');
  });

  it('rejects more than two decimal places', () => {
    expect(Money.safeParse('10.001').success).toBe(false);
  });
});
