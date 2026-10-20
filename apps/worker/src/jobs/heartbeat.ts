import type { JobHandler } from './index';

export const heartbeat: JobHandler<'system.heartbeat'> = async () => {
  console.log(`[worker] heartbeat ${new Date().toISOString()}`);
};
