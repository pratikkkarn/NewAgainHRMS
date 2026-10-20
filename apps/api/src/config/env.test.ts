import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  DIRECT_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CLOUDINARY_CLOUD_NAME: 'cloud',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  MAIL_FROM: 'no-reply@example.com',
};

describe('validateEnv', () => {
  it('applies defaults to a valid environment', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.CLOUDINARY_FOLDER).toBe('primestar-hrms/dev');
  });

  it('lists every invalid variable', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short', APP_URL: 'nope' })).toThrow(
      /JWT_ACCESS_SECRET[\s\S]*APP_URL|APP_URL[\s\S]*JWT_ACCESS_SECRET/,
    );
  });

  it('requires production secrets in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /FIELD_ENCRYPTION_KEY, JOB_TRIGGER_SECRET, BREVO_API_KEY/,
    );
  });

  it('trusts one proxy by default and accepts a hop count', () => {
    expect(validateEnv(base).TRUST_PROXY_HOPS).toBe(1);
    expect(validateEnv({ ...base, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    expect(() => validateEnv({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('runs the worker in-process by default', () => {
    expect(validateEnv(base).RUN_WORKER).toBe(true);
    expect(validateEnv({ ...base, RUN_WORKER: 'false' }).RUN_WORKER).toBe(false);
  });
});
