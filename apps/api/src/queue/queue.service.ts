import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBrevoClient, MailDrain, type BrevoClient } from '@primestar/mail';
import type { JobPayload } from '@primestar/shared';
import PgBoss from 'pg-boss';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export type MailJob = JobPayload<'mail.send'>;

/** How long after boot the API looks for emails left over from before it last stopped. */
const STARTUP_DRAIN_DELAY_MS = 5_000;

/**
 * The job queue (pg-boss, stored in PostgreSQL): the API puts email jobs in it, and, while `RUN_WORKER` is on
 * (the free-tier setup), the same process sends them.
 *
 * Sending is driven by the queue filling, not by polling: right after a job is added the drain runs until the
 * queue is empty. Polling around the clock would keep the free database awake and use up its compute hours.
 * The queue itself is started on first use, with no maintenance timers, for the same reason.
 *
 * When the worker becomes its own service, set `RUN_WORKER=false`: the API only adds jobs, and the worker
 * (apps/worker) sends them with the same code from `@primestar/mail`.
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss: PgBoss | null = null;
  private starting: Promise<PgBoss> | null = null;
  private drain: MailDrain | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  private get runsWorker(): boolean {
    return this.config.get('RUN_WORKER', { infer: true });
  }

  private brevoClient(): BrevoClient | null {
    const apiKey = this.config.get('BREVO_API_KEY', { infer: true });
    if (!apiKey) return null;
    return createBrevoClient({
      apiKey,
      sender: { name: this.config.get('MAIL_FROM_NAME', { infer: true }), email: this.config.get('MAIL_FROM', { infer: true }) },
    });
  }

  private start(): Promise<PgBoss> {
    this.starting ??= (async () => {
      const boss = new PgBoss({
        connectionString: this.config.get('DIRECT_DATABASE_URL', { infer: true }),
        schema: 'pgboss',
        max: 2,
        supervise: false,
        schedule: false,
      });
      boss.on('error', (error) => this.logger.error('pg-boss error', error));
      await boss.start();
      await boss.createQueue('mail.send');
      this.boss = boss;

      if (this.runsWorker) {
        this.drain = new MailDrain({
          queue: {
            fetch: async (name, options) => boss.fetch(name, options),
            complete: (name, ids) => boss.complete(name, ids),
            fail: (name, id, data) => boss.fail(name, id, data),
            getQueueSize: (name) => boss.getQueueSize(name),
          },
          deps: {
            prisma: this.prisma,
            brevo: this.brevoClient(),
            log: {
              info: (message) => this.logger.log(message),
              warn: (message) => this.logger.warn(message),
              error: (message) => this.logger.error(message),
            },
          },
        });
      }
      return boss;
    })().catch((error: unknown) => {
      this.starting = null; // try again on the next call
      throw error;
    });
    return this.starting;
  }

  /** After a restart, sends anything that was queued but not sent before the API stopped (or went to sleep). */
  onApplicationBootstrap(): void {
    if (!this.runsWorker || this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.startupTimer = setTimeout(() => {
      this.start()
        .then(() => this.drain?.kick())
        .catch((error: unknown) => this.logger.error('Could not start the mail queue', error instanceof Error ? error.stack : String(error)));
    }, STARTUP_DRAIN_DELAY_MS);
    this.startupTimer.unref();
  }

  /**
   * Queues one email and, when this process is the worker, starts sending it. Never throws: a queue problem
   * must not fail the request that triggered it, so it returns false and the caller can tell the user to resend.
   * Invite and reset emails jump the queue ahead of alert emails.
   */
  async enqueueMail(job: MailJob, options: { priority?: number; singletonKey?: string } = {}): Promise<boolean> {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      // Dev convenience: show what is being sent, link included, because test addresses never receive mail.
      this.logger.log(`[mail:dev] ${job.template} to ${job.to} ${JSON.stringify(job.params)}`);
    }
    try {
      const boss = await this.start();
      await boss.send('mail.send', job, {
        priority: options.priority ?? 0,
        singletonKey: options.singletonKey,
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
        // How long a worker may spend on one email before the job counts as failed and is retried.
        expireInMinutes: 15,
      });
      this.drain?.kick();
      return true;
    } catch (error) {
      this.logger.error(`Could not queue ${job.template} email`, error instanceof Error ? error.stack : String(error));
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.drain?.stop();
    await this.boss?.stop({ graceful: false, wait: false });
  }
}
