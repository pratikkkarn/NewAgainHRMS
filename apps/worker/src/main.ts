import { PrismaClient } from '@primestar/db';
import { createBrevoClient, MAIL_QUEUE, runMailBatch } from '@primestar/mail';
import PgBoss from 'pg-boss';
import { JOB_NAMES, JobName, JobPayloads } from '@primestar/shared';
import { validateEnv } from './env';
import { JobHandler, handlers, schedules } from './jobs';

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const boss = new PgBoss({ connectionString: env.DIRECT_DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (error) => console.error('[worker] pg-boss error', error));
  await boss.start();

  for (const name of JOB_NAMES) {
    await boss.createQueue(name);
  }

  // Emails are sent in batches: up to 10 at a time, 5 in parallel, each job settled on its own.
  const prisma = new PrismaClient({ datasourceUrl: env.DIRECT_DATABASE_URL });
  const mailDeps = {
    prisma,
    brevo: env.BREVO_API_KEY
      ? createBrevoClient({ apiKey: env.BREVO_API_KEY, sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM } })
      : null,
    log: { info: console.log, warn: console.warn, error: console.error },
  };
  await boss.work(MAIL_QUEUE, { batchSize: 10 }, async (jobs) => {
    await runMailBatch(mailDeps, boss, jobs);
  });

  for (const name of JOB_NAMES) {
    if (name === MAIL_QUEUE) continue; // handled above
    const handler = handlers[name] as JobHandler<JobName> | undefined;
    if (!handler) continue;
    await boss.work(name, async (jobs) => {
      for (const job of jobs) {
        await handler(JobPayloads[name].parse(job.data ?? {}));
      }
    });
  }

  for (const [name, cron] of Object.entries(schedules)) {
    await boss.schedule(name, cron, {}, { tz: 'Asia/Kolkata' });
  }

  const handled = [MAIL_QUEUE, ...JOB_NAMES.filter((name) => name !== MAIL_QUEUE && handlers[name])];
  console.log(`[worker] started; handling ${handled.join(', ')}`);

  const shutdown = async (): Promise<void> => {
    await boss.stop({ graceful: true });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('[worker] failed to start', error);
  process.exit(1);
});
