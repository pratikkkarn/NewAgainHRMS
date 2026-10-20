import { z } from 'zod';

/**
 * Background job contracts between the API (producer) and the worker (consumer).
 * The API enqueues with pg-boss using these names; the worker validates each payload
 * against the same schema before handling it. Changing a schema needs both owners.
 */
export const JobPayloads = {
  /** Liveness check. Scheduled by the worker itself. */
  'system.heartbeat': z.object({}),
  /** Daily scan for expiring POs, POs running out and upcoming milestones. */
  'alerts.daily-scan': z.object({}),
  /** Renders an invoice PDF with Puppeteer and stores it in Cloudinary. */
  'invoice.render-pdf': z.object({ invoiceId: z.uuid() }),
  /** Sends one transactional email through Brevo. */
  'mail.send': z.object({
    to: z.email(),
    template: z.string().min(1),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
} as const;

export type JobName = keyof typeof JobPayloads;
export type JobPayload<N extends JobName> = z.infer<(typeof JobPayloads)[N]>;

export const JOB_NAMES = Object.keys(JobPayloads) as JobName[];
