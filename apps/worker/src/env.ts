import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DIRECT_DATABASE_URL: z.string().startsWith('postgres'),

  BREVO_API_KEY: optional,
  MAIL_FROM: z.email(),
  MAIL_FROM_NAME: z.string().min(1).default('Prime Star HRMS'),

  // Invoice PDFs are uploaded here. Optional until the invoice.render-pdf handler exists.
  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,
  CLOUDINARY_FOLDER: z.string().min(1).default('primestar-hrms/dev'),

  SENTRY_DSN: optional,
});

export type Env = z.infer<typeof EnvSchema>;

/** Fails fast at boot with every invalid variable listed. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production' && !env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is required in production');
  }
  return env;
}
