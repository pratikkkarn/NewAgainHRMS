import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url(),
  /**
   * How many proxies sit in front of the API, for the client IP used by rate limits and audit rows.
   * Render alone is 1. Behind the Vercel /api rewrite (Vercel, then Render) it is 2. Check the audit
   * log's IPs after deploying: if every user shows the same address, this is set too low.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  DATABASE_URL: z.string().startsWith('postgres'),
  DIRECT_DATABASE_URL: z.string().startsWith('postgres'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  FIELD_ENCRYPTION_KEY: optional,

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  /** Top-level folder per environment, so dev uploads never mix with production. */
  CLOUDINARY_FOLDER: z.string().min(1).default('primestar-hrms/dev'),

  /**
   * The worker runs inside the API process on Render's free tier (Architecture doc).
   * Set to false once the worker moves to its own service.
   */
  RUN_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // Brevo, used by the in-process worker. Leave empty locally to log emails instead of sending.
  BREVO_API_KEY: optional,
  MAIL_FROM: z.email(),
  MAIL_FROM_NAME: z.string().min(1).default('Prime Star HRMS'),

  /** Shared secret for POST /api/jobs/daily-alerts, called by GitHub Actions at 09:00 IST. */
  JOB_TRIGGER_SECRET: optional,

  SENTRY_DSN: optional,
});

export type Env = z.infer<typeof EnvSchema>;

/** Used by ConfigModule. Fails fast at boot with every invalid variable listed. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    const required: Record<string, string | undefined> = {
      FIELD_ENCRYPTION_KEY: env.FIELD_ENCRYPTION_KEY,
      JOB_TRIGGER_SECRET: env.JOB_TRIGGER_SECRET,
      ...(env.RUN_WORKER ? { BREVO_API_KEY: env.BREVO_API_KEY } : {}),
    };
    const missing = Object.keys(required).filter((key) => !required[key]);
    if (missing.length > 0) {
      throw new Error(`Required in production: ${missing.join(', ')}`);
    }
  }
  return env;
}
