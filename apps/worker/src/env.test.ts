import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = {
  DIRECT_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MAIL_FROM: 'no-reply@example.com',
};

describe('validateEnv', () => {
  it('applies defaults to a valid environment', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.BREVO_API_KEY).toBeUndefined();
  });

  it('lists every invalid variable', () => {
    expect(() => validateEnv({ DIRECT_DATABASE_URL: 'mysql://x', MAIL_FROM: 'nope' })).toThrow(
      /DIRECT_DATABASE_URL[\s\S]*MAIL_FROM/,
    );
  });

  it('requires a Brevo key in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/BREVO_API_KEY/);
  });
});
