import { MAIL_QUEUE, runMailBatch, type Logger, type MailDeps, type MailQueue } from './processor';

/** What the drain needs from pg-boss. */
export interface DrainQueue extends MailQueue {
  fetch(name: string, options: { batchSize: number }): Promise<{ id: string; data: unknown }[]>;
  /** Jobs waiting, including ones waiting for a retry. */
  getQueueSize(name: string): Promise<number>;
}

export interface DrainOptions {
  queue: DrainQueue;
  deps: MailDeps;
  /** Jobs per batch. */
  batchSize?: number;
  /** When jobs are still waiting for a retry, look again after this long. */
  retryCheckMs?: number;
  log?: Logger;
}

/**
 * Works through the mail queue on demand instead of polling it all day.
 *
 * Polling would keep the free database awake around the clock and use up its compute hours, so the API
 * calls `kick()` right after it queues an email, and the drain runs until the queue is empty. If jobs are
 * left waiting for a retry, it comes back after `retryCheckMs`, and stops once nothing is waiting.
 */
export class MailDrain {
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly options: DrainOptions) {}

  /** Start working without waiting for it. Calling it while a run is in progress makes that run look again. */
  kick(): void {
    void this.drain().catch((error: unknown) => {
      this.options.log?.error(`mail drain failed: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleRetryCheck();
    });
  }

  async drain(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        for (let guard = 0; guard < 1000; guard++) {
          const jobs = await this.options.queue.fetch(MAIL_QUEUE, { batchSize: this.options.batchSize ?? 10 });
          if (jobs.length === 0) break;
          await runMailBatch(this.options.deps, this.options.queue, jobs);
        }
      } while (this.again && !this.stopped);
    } finally {
      this.running = false;
    }
    await this.checkPending();
  }

  private async checkPending(): Promise<void> {
    if (this.stopped) return;
    const waiting = await this.options.queue.getQueueSize(MAIL_QUEUE).catch(() => 0);
    if (waiting > 0) this.scheduleRetryCheck();
  }

  private scheduleRetryCheck(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick();
    }, this.options.retryCheckMs ?? 65_000);
    // A pending check must never keep the process alive on shutdown.
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
