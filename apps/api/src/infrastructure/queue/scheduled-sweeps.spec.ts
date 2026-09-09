import { readFileSync } from 'node:fs';
import path from 'node:path';

import { BILLING_SWEEP_JOB } from '../../modules/billing/billing.processor';
import { CALL_MONITOR_JOB } from '../../modules/call-logs/call-monitor.processor';
import { CONTRACT_DAILY_JOB } from '../../modules/contracts/contracts.processor';
import { STALLED_SEND_SWEEP_JOB } from '../../modules/messaging/messaging.processor';
import { DELIVER_JOB, REMINDERS_JOB } from '../../modules/notifications/notifications.processor';
import { DAILY_SNAPSHOT_JOB } from '../../modules/reports/daily-reports.processor';
import { SLA_MONITOR_JOB } from '../../modules/sla-escalations/sla-monitor.processor';
import { STALLED_CALLBACK_SWEEP_JOB } from '../../modules/support-callbacks/support-callbacks.processor';
import { ROUTING_MONITOR_JOB } from '../../modules/ticket-routing/routing-monitor.processor';
import { QUEUE_NAMES } from './queue-names';
import { SCHEDULED_SWEEPS, isQueueName, sweepUsage } from './scheduled-sweeps';

const RUNBOOK = path.resolve(__dirname, '../../../../../docs/production-runbook.md');
const runbook = readFileSync(RUNBOOK, 'utf8');

describe('SCHEDULED_SWEEPS', () => {
  it('names the job each processor actually registers', () => {
    // The catalogue is string literals so the `sweep` CLI stays cheap. This is what stops those
    // literals drifting from the processors: rename a job constant and this fails.
    expect(SCHEDULED_SWEEPS).toEqual({
      [QUEUE_NAMES.NOTIFICATIONS]: [DELIVER_JOB, REMINDERS_JOB],
      [QUEUE_NAMES.SLA_MONITOR]: [SLA_MONITOR_JOB],
      [QUEUE_NAMES.ROUTING_MONITOR]: [ROUTING_MONITOR_JOB],
      [QUEUE_NAMES.DAILY_REPORTS]: [DAILY_SNAPSHOT_JOB],
      [QUEUE_NAMES.CONTRACTS]: [CONTRACT_DAILY_JOB],
      [QUEUE_NAMES.IVR_EVENTS]: [CALL_MONITOR_JOB],
      [QUEUE_NAMES.MESSAGING]: [STALLED_SEND_SWEEP_JOB],
      [QUEUE_NAMES.BILLING]: [BILLING_SWEEP_JOB],
      [QUEUE_NAMES.SUPPORT_CALLBACKS]: [STALLED_CALLBACK_SWEEP_JOB],
      [QUEUE_NAMES.RELEASE_NOTES]: [],
      [QUEUE_NAMES.AI_SUMMARIES]: [],
    });
  });

  it('covers every queue, so a new one has to say whether it has a sweep', () => {
    expect(Object.keys(SCHEDULED_SWEEPS).sort()).toEqual(Object.values(QUEUE_NAMES).sort());
  });

  it('recognises a queue name and refuses anything else', () => {
    expect(isQueueName(QUEUE_NAMES.BILLING)).toBe(true);
    expect(isQueueName('bull:billing')).toBe(false);
  });

  it('prints the queues that have a sweep, and no empty ones', () => {
    const usage = sweepUsage();
    expect(usage).toContain(`${QUEUE_NAMES.BILLING} ${BILLING_SWEEP_JOB}`);
    expect(usage).not.toContain(QUEUE_NAMES.AI_SUMMARIES);
  });
});

describe('the runbook agrees with the code', () => {
  it('lists the same queue and job for every scheduled sweep', () => {
    // The old instruction told an operator to enqueue "<job> from the table above" while the
    // table held prose descriptions, not job names. Now the table holds the names, and this is
    // what keeps them the names the workers answer to.
    for (const [queue, jobs] of Object.entries(SCHEDULED_SWEEPS)) {
      for (const job of jobs) {
        expect(runbook).toContain(`| \`${queue}\` | \`${job}\` |`);
      }
    }
  });

  it('never tells anybody to write a job into Redis by hand', () => {
    // `bull:<queue>:wait` holds job ids; the hash, the counters and `bull:<queue>:meta` are
    // written together by BullMQ's addJob script. An LPUSH of a payload is a record no worker can
    // load — pasted, by design, into a live production queue during an incident.
    expect(runbook).not.toMatch(/LPUSH\s+["']?bull:/i);
    expect(runbook).toContain('sweep <queue> <job>');
  });
});
