/**
 * Runs one occurrence of a scheduled job now, through BullMQ's own API.
 *
 *   node --import tsx scripts/enqueue-scheduled-job.ts <queue> <job>
 *   (in the API image: `entrypoint.sh sweep <queue> <job>`)
 *
 * The runbook used to say to do this with `redis-cli LPUSH "bull:<queue>:wait" '{"name":…}'`.
 * That is wrong in a way that only shows up in production: the `wait` list holds job **ids**, not
 * payloads, and the job's hash, the counters and `bull:<queue>:meta` are written together by
 * BullMQ's `addJob` Lua script. Pasting a JSON payload into `wait` leaves an entry no worker can
 * load — a poison record in a live queue, created during the incident it was meant to resolve.
 *
 * `Queue.add` runs that script. There is nothing else here: no application, no database, no
 * workers. The instance that is already running picks the job up, which is the point — if nothing
 * does, the workers are not running, and that is a different problem.
 */
import { Queue } from 'bullmq';

import {
  SCHEDULED_SWEEPS,
  isQueueName,
  sweepUsage,
} from '../src/infrastructure/queue/scheduled-sweeps';

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const [queueName, jobName] = process.argv.slice(2);
  if (!queueName || !jobName) {
    fail(sweepUsage());
    return;
  }
  if (!isQueueName(queueName)) {
    fail(`Unknown queue "${queueName}".\n\n${sweepUsage()}`);
    return;
  }
  if (!SCHEDULED_SWEEPS[queueName].includes(jobName)) {
    fail(`Queue "${queueName}" has no scheduled job "${jobName}".\n\n${sweepUsage()}`);
    return;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    fail('REDIS_URL is not set.');
    return;
  }

  const queue = new Queue(queueName, { connection: { url } });
  try {
    // One attempt: a sweep that fails should be read in the log and re-run deliberately, not
    // retried behind the back of whoever is holding the incident.
    const job = await queue.add(jobName, {}, { attempts: 1, removeOnComplete: true });
    // `console.warn`, like the seed's own output: the lint rule allows warn and error, because
    // application code has a logger and `console.log` in it is a leftover. This is a CLI whose
    // output is the point, and its one line of it belongs on stderr with the errors above.
    console.warn(`Enqueued ${jobName} on ${queueName} as job ${job.id ?? '(no id)'}.`);
  } finally {
    await queue.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
