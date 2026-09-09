import { QUEUE_NAMES, type QueueName } from './queue-names';

/**
 * The scheduled jobs an operator may re-run by hand, by the queue that owns them.
 *
 * String literals rather than imports of the processors' own constants, so that
 * `scripts/enqueue-scheduled-job.ts` — a one-off CLI in a container during an incident — costs a
 * Redis connection and nothing else, instead of loading the whole application graph to learn nine
 * strings. `scheduled-sweeps.spec.ts` compares this list against those constants and against the
 * table in `docs/production-runbook.md`, so it cannot quietly drift from either.
 */
export const SCHEDULED_SWEEPS: Record<QueueName, readonly string[]> = {
  [QUEUE_NAMES.NOTIFICATIONS]: ['deliver-deferred', 'daily-reminders'],
  [QUEUE_NAMES.SLA_MONITOR]: ['sla-monitor'],
  [QUEUE_NAMES.ROUTING_MONITOR]: ['routing-monitor'],
  [QUEUE_NAMES.DAILY_REPORTS]: ['daily-snapshot'],
  [QUEUE_NAMES.CONTRACTS]: ['contract-daily'],
  [QUEUE_NAMES.IVR_EVENTS]: ['call-monitor'],
  [QUEUE_NAMES.MESSAGING]: ['stalled-send-sweep'],
  [QUEUE_NAMES.BILLING]: ['billing-sweep'],
  [QUEUE_NAMES.SUPPORT_CALLBACKS]: ['stalled-callback-sweep'],
  // Nothing is scheduled on these two: their jobs are enqueued when a person asks for a summary
  // or a release-note draft, so there is no missed occurrence to re-run.
  [QUEUE_NAMES.RELEASE_NOTES]: [],
  [QUEUE_NAMES.AI_SUMMARIES]: [],
};

export function isQueueName(value: string): value is QueueName {
  return (Object.values(QUEUE_NAMES) as string[]).includes(value);
}

/** The queues and job names `sweep` accepts, ready to print. */
export function sweepUsage(): string {
  const lines = Object.entries(SCHEDULED_SWEEPS)
    .filter(([, jobs]) => jobs.length > 0)
    .map(([queue, jobs]) => `  ${queue} ${jobs.join(' | ')}`);
  return ['Usage: sweep <queue> <job>', '', 'Queues and their scheduled jobs:', ...lines].join(
    '\n',
  );
}
