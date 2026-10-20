import type { JobName, JobPayload } from '@primestar/shared';
import { heartbeat } from './heartbeat';

export type JobHandler<N extends JobName> = (payload: JobPayload<N>) => Promise<void>;

/**
 * Handlers by job name. A job with no handler here stays queued until one is added,
 * so the API can start enqueuing before the worker side is built.
 */
export const handlers: { [N in JobName]?: JobHandler<N> } = {
  'system.heartbeat': heartbeat,
};

/** Recurring jobs, as cron expressions in India time. */
export const schedules: { [N in JobName]?: string } = {
  'system.heartbeat': '*/15 * * * *',
};
