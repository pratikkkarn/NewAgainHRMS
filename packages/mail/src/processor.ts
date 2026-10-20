import type { PrismaClient } from '@primestar/db';
import { JobPayloads } from '@primestar/shared';
import { BrevoError, type BrevoClient } from './brevo';
import { renderEmail, TemplateError } from './templates';

/**
 * Turns `mail.send` jobs into sent emails, one EmailLog row per job.
 *
 *  - Each job succeeds or fails on its own: one bad address never fails the others in its batch.
 *  - A retried job never sends twice: the log row is keyed by the job id, and a row that is already
 *    sent (or finally failed) is left alone.
 *  - Failures Brevo says could pass (429, 5xx, no connection) are retried by the queue; the rest
 *    (bad address, bad sender, bad key) are recorded as failed and not retried.
 */

export const MAIL_QUEUE = 'mail.send';

/** The queue retries 5 times (see QueueService), so a job runs at most 6 times. */
export const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_CONCURRENCY = 5;

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface MailDeps {
  prisma: Pick<PrismaClient, 'emailLog'>;
  /** Null means "no key": emails are logged as skipped instead of sent. */
  brevo: BrevoClient | null;
  log?: Logger;
  maxAttempts?: number;
}

export type MailOutcome = 'sent' | 'skipped' | 'failed' | 'retry';

/**
 * Addresses that can never receive mail: the reserved test domains. The development accounts use them, so
 * sending to them would only create bounces on a real sender account.
 */
const RESERVED_DOMAIN = /(@|\.)(test|invalid|localhost|example|example\.com|example\.org|example\.net)$/i;
export const isReservedAddress = (address: string): boolean => RESERVED_DOMAIN.test(address.trim());

const trim = (value: string): string => (value.length > 500 ? `${value.slice(0, 497)}...` : value);
const noop: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export async function processMailJob(deps: MailDeps, job: { id: string; data: unknown }): Promise<MailOutcome> {
  const log = deps.log ?? noop;
  const parsed = JobPayloads['mail.send'].safeParse(job.data);
  if (!parsed.success) {
    // Without a valid address there is nothing to log against, and retrying can't fix it.
    log.error(`mail job ${job.id} has an invalid payload: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    return 'failed';
  }
  const { to, template, params } = parsed.data;
  const db = deps.prisma.emailLog;

  let rendered;
  try {
    rendered = renderEmail(template, params);
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    await db.upsert({
      where: { dedupeKey: job.id },
      create: { to, template, status: 'FAILED', error: trim(error.message), dedupeKey: job.id },
      update: { status: 'FAILED', error: trim(error.message) },
    });
    log.error(`mail ${job.id} (${template}) not sent: ${error.message}`);
    return 'failed';
  }

  const row = await db.upsert({
    where: { dedupeKey: job.id },
    create: { to, template, subject: rendered.subject, status: 'QUEUED', dedupeKey: job.id },
    update: {},
  });
  // Already handled by an earlier run of this same job (the worker died after sending, or Brevo answered late).
  if (row.status === 'SENT') return 'sent';
  if (row.status === 'SKIPPED') return 'skipped';
  if (row.status === 'FAILED') return 'failed';

  const attempts = row.attempts + 1;

  if (isReservedAddress(to)) {
    await db.update({ where: { id: row.id }, data: { status: 'SKIPPED', attempts, error: 'Test address: reserved domains cannot receive email.' } });
    log.info(`mail ${template} to ${to} skipped (test address)`);
    return 'skipped';
  }
  if (!deps.brevo) {
    await db.update({ where: { id: row.id }, data: { status: 'SKIPPED', attempts, error: 'No Brevo API key is set, so nothing was sent.' } });
    log.warn(`mail ${template} to ${to} skipped: no BREVO_API_KEY`);
    return 'skipped';
  }

  try {
    const { messageId } = await deps.brevo.send({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    await db.update({ where: { id: row.id }, data: { status: 'SENT', attempts, brevoMessageId: messageId, sentAt: new Date(), error: null } });
    log.info(`mail ${template} to ${to} sent (${messageId})`);
    return 'sent';
  } catch (error) {
    const retryable = error instanceof BrevoError ? error.retryable : true;
    const message = error instanceof Error ? error.message : String(error);
    const final = !retryable || attempts >= (deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    await db.update({ where: { id: row.id }, data: { status: final ? 'FAILED' : 'QUEUED', attempts, error: trim(message) } });
    log[final ? 'error' : 'warn'](`mail ${template} to ${to} ${final ? 'failed' : `will be retried (attempt ${attempts})`}: ${message}`);
    return final ? 'failed' : 'retry';
  }
}

/** The part of the queue that settles jobs. pg-boss provides it. */
export interface MailQueue {
  complete(name: string, ids: string[]): Promise<unknown>;
  fail(name: string, id: string, data?: object): Promise<unknown>;
}

export interface BatchResult {
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

/**
 * Handles a batch of jobs at most `concurrency` at a time, then settles each job on its own:
 * finished ones (sent, skipped or finally failed) are completed, and ones worth retrying are failed so the
 * queue schedules another try. Never throws for a single job's problem.
 */
export async function runMailBatch(
  deps: MailDeps,
  queue: MailQueue,
  jobs: { id: string; data: unknown }[],
  concurrency = DEFAULT_CONCURRENCY,
): Promise<BatchResult> {
  const outcomes = new Map<string, MailOutcome>();
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      try {
        outcomes.set(job.id, await processMailJob(deps, job));
      } catch (error) {
        // Something unexpected (the database was unreachable): let the queue try this job again later.
        deps.log?.error(`mail job ${job.id} crashed: ${error instanceof Error ? error.message : String(error)}`);
        outcomes.set(job.id, 'retry');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, lane));

  const result: BatchResult = { sent: 0, skipped: 0, failed: 0, retried: 0 };
  const done: string[] = [];
  for (const [id, outcome] of outcomes) {
    if (outcome === 'retry') {
      result.retried++;
      await queue.fail(MAIL_QUEUE, id, { reason: 'retry' }).catch(() => undefined);
    } else {
      result[outcome]++;
      done.push(id);
    }
  }
  if (done.length > 0) await queue.complete(MAIL_QUEUE, done);
  return result;
}
