import { readdirSync } from 'node:fs';
import path from 'node:path';

import { validateEnv } from '../../config/env.validation';
import { AiSummariesProcessor } from '../../modules/ai-summaries/ai-summaries.processor';
import { BillingProcessor } from '../../modules/billing/billing.processor';
import { CallMonitorProcessor } from '../../modules/call-logs/call-monitor.processor';
import { ContractsProcessor } from '../../modules/contracts/contracts.processor';
import { MessagingProcessor } from '../../modules/messaging/messaging.processor';
import { NotificationsProcessor } from '../../modules/notifications/notifications.processor';
import { ReleaseNotesProcessor } from '../../modules/release-notes/release-notes.processor';
import { DailyReportsProcessor } from '../../modules/reports/daily-reports.processor';
import { SlaMonitorProcessor } from '../../modules/sla-escalations/sla-monitor.processor';
import { SupportCallbacksProcessor } from '../../modules/support-callbacks/support-callbacks.processor';
import { RoutingMonitorProcessor } from '../../modules/ticket-routing/routing-monitor.processor';

/**
 * How much of the connection pool the background workers can claim between them.
 *
 * Every API instance is also a worker: the processors and the HTTP server share one
 * `PrismaService`, and therefore one pool of `DB_POOL_MAX` connections. A job that is running
 * holds one, so the workers' *aggregate* concurrency — the sum across every queue, not any one
 * number — is what HTTP requests are competing with. When it reaches `DB_POOL_MAX`, background
 * work can hold every connection and requests fail at `DB_POOL_ACQUIRE_TIMEOUT_MS`.
 *
 * Ten queues at a concurrency of one is already exactly the default `DB_POOL_MAX` of ten. There
 * is no headroom to spend, which is why three queues briefly carrying 5 + 3 + 2 — each with a
 * comment claiming its own number was "well under DB_POOL_MAX" — put the total at nineteen. The
 * number that matters is never the one in front of you.
 *
 * So: raising any queue's concurrency means raising `DB_POOL_MAX` in the same change, and this is
 * the test that says so.
 */
const PROCESSORS = [
  AiSummariesProcessor,
  BillingProcessor,
  CallMonitorProcessor,
  ContractsProcessor,
  MessagingProcessor,
  NotificationsProcessor,
  ReleaseNotesProcessor,
  DailyReportsProcessor,
  SlaMonitorProcessor,
  RoutingMonitorProcessor,
  SupportCallbacksProcessor,
];

/**
 * Worker options `@Processor(name, options)` stored on the class.
 *
 * The key is `@nestjs/bullmq`'s, spelled out because the package does not export its constants.
 * If it ever changes, every concurrency below reads as 1 and the totals only get smaller, so this
 * test cannot pass by accident on a stale key — the count of processors it found would still be
 * checked below.
 */
const WORKER_METADATA = 'bullmq:worker_metadata';

function declaredConcurrency(processor: object): number {
  const options: unknown = Reflect.getMetadata(WORKER_METADATA, processor);
  if (options && typeof options === 'object' && 'concurrency' in options) {
    const value = (options as { concurrency: unknown }).concurrency;
    return typeof value === 'number' ? value : 1;
  }
  return 1;
}

/** Every `*.processor.ts` under src/modules, so a new one cannot skip the budget. */
function processorFiles(): string[] {
  const root = path.resolve(__dirname, '../../modules');
  return readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (entry) => entry.endsWith('.processor.ts') && !entry.endsWith('.spec.ts'),
  );
}

describe('aggregate worker concurrency', () => {
  const poolMax = validateEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_BUCKET: 'bucket',
    STORAGE_ACCESS_KEY: 'key',
    STORAGE_SECRET_KEY: 'secret',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  }).DB_POOL_MAX;

  it('checks every processor in the repository', () => {
    // Otherwise the budget below is a budget for whichever classes somebody remembered to import.
    expect(PROCESSORS).toHaveLength(processorFiles().length);
  });

  it('stays within DB_POOL_MAX, which the HTTP server shares', () => {
    const total = PROCESSORS.reduce((sum, processor) => sum + declaredConcurrency(processor), 0);
    const perQueue = Object.fromEntries(
      PROCESSORS.map((processor) => [processor.name, declaredConcurrency(processor)]),
    );

    expect({ total, poolMax, perQueue }).toMatchObject({ total: PROCESSORS.length });
    expect(total).toBeLessThanOrEqual(poolMax);
  });
});
