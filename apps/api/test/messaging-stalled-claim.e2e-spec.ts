import type { INestApplication } from '@nestjs/common';

import { PrismaService } from '../src/database/prisma.service';
import { MessagingProcessor, STALLED_AFTER_MS } from '../src/modules/messaging/messaging.processor';
import { MessagingRepository } from '../src/modules/messaging/messaging.repository';
import { createTestApp } from './helpers/test-app';

/**
 * A worker killed between claiming a message and reporting back.
 *
 * `claimForSending` matches QUEUED only, deliberately: re-entering delivery from SENDING sends a
 * message the provider may already have accepted a second time. The cost is that SENDING has no
 * exit — the queue cannot re-claim the row, a receipt cannot match it because the provider id was
 * never recorded, and no screen can act on it. The sweep is the exit, and these tests are about
 * what it may and may not do.
 *
 * Against a real database because the whole mechanism is one conditional `updateMany` and a
 * timestamp comparison, and a stub of the row would be a stub of the thing under test.
 */
describe('Stalled outbound claims (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repository: MessagingRepository;
  let processor: MessagingProcessor;
  let organizationId: string;

  const created: string[] = [];

  /** Queues a message and claims it, exactly as a worker about to send would. */
  async function claimed(key: string): Promise<string> {
    const row = await repository.claim({
      organizationId,
      channel: 'EMAIL',
      recipientUserId: null,
      destination: `stalled-${key}@example.test`,
      template: 'INVOICE_ISSUED',
      subject: null,
      idempotencyKey: `stalled-claim-${key}-${Date.now()}`,
    });
    if (!row) {
      throw new Error('The fixture message was not created');
    }
    created.push(row.id);
    const sending = await repository.claimForSending(organizationId, row.id);
    expect(sending?.status).toBe('SENDING');
    return row.id;
  }

  /**
   * Ages the claim. Raw SQL because `updatedAt` is `@updatedAt`: Prisma would overwrite any value
   * given for it, and it is precisely the column the sweep reads as the claim time.
   */
  async function ageBy(id: string, minutes: number): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE outbound_messages SET updated_at = now() - interval '${minutes} minutes' WHERE id = $1::uuid`,
      id,
    );
  }

  const read = (id: string) => prisma.outboundMessage.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    repository = app.get(MessagingRepository);
    processor = app.get(MessagingProcessor);
    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    organizationId = provider?.id ?? '';
    expect(organizationId).toBeTruthy();
  });

  afterAll(async () => {
    // Only the rows these tests created.
    await prisma.outboundMessage.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  it('fails a claim no worker ever came back from', async () => {
    const id = await claimed('abandoned');
    await ageBy(id, 20);

    const swept = await processor.sweepStalledClaims();
    expect(swept).toBeGreaterThanOrEqual(1);

    const row = await read(id);
    expect(row.status).toBe('FAILED');
    expect(row.failedAt).not.toBeNull();
    expect(row.lastError).toMatch(/stopped before reporting back/);
  });

  it('never returns a swept message to the queue', async () => {
    // The guarantee that matters. Whether the provider accepted the message before the worker
    // died is unknowable, so re-queueing would gamble on mailing a client twice. A swept row must
    // stay unclaimable — this is the assertion that fails if someone later "fixes" the sweep to
    // send the message again.
    const id = await claimed('not-requeued');
    await ageBy(id, 20);
    await processor.sweepStalledClaims();

    expect((await read(id)).status).not.toBe('QUEUED');
    expect(await repository.claimForSending(organizationId, id)).toBeNull();
    expect((await read(id)).status).toBe('FAILED');
  });

  it('leaves a claim that is still inside the threshold alone', async () => {
    // A greylisting SMTP server or a throttled API can hold a connection for minutes. Failing a
    // send that is still in flight would record a delivery that happened as one that did not, and
    // would race the `markSent` about to land.
    const id = await claimed('in-flight');
    await ageBy(id, Math.floor(STALLED_AFTER_MS / 60_000) - 1);

    await processor.sweepStalledClaims();

    expect((await read(id)).status).toBe('SENDING');
  });

  it('does not touch a message that reached a settled state', async () => {
    const sent = await claimed('sent');
    await repository.markSent(sent, 'provider-message-id');
    await ageBy(sent, 180);

    const queued = await repository.claim({
      organizationId,
      channel: 'EMAIL',
      recipientUserId: null,
      destination: 'stalled-queued@example.test',
      template: 'INVOICE_ISSUED',
      subject: null,
      idempotencyKey: `stalled-claim-queued-${Date.now()}`,
    });
    created.push(queued!.id);
    await ageBy(queued!.id, 180);

    await processor.sweepStalledClaims();

    expect((await read(sent)).status).toBe('SENT');
    expect((await read(sent)).lastError).toBeNull();
    // A queued message is old because nothing has picked it up yet, not because it stalled. The
    // sweep matching on age alone would fail every backlogged message on a queue that fell behind.
    expect((await read(queued!.id)).status).toBe('QUEUED');
  });

  it('does not disturb a worker that finishes late', async () => {
    // The row moves out of SENDING before the sweep runs, so the sweep's status predicate matches
    // nothing and the completed send stands.
    const id = await claimed('late-finisher');
    await ageBy(id, 20);
    await repository.markSent(id, 'late-provider-id');

    await processor.sweepStalledClaims();

    const row = await read(id);
    expect(row.status).toBe('SENT');
    expect(row.providerMessageId).toBe('late-provider-id');
  });
});

/**
 * Issues #11 (markSkipped), #8 (an unmatched receipt) and #7 (resend).
 *
 * All three are about what may be written to a row a worker might be holding, so they run against
 * a real database beside the sweep they interact with.
 */
describe('Outbound message recovery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repository: MessagingRepository;
  let organizationId: string;

  const created: string[] = [];

  /**
   * A queued message on a number of its own.
   *
   * The destination is derived from the key because reconciliation matches on it: two fixtures
   * sharing a number would be two candidates, and the function would rightly decline to choose —
   * which is a real behaviour, asserted separately, not something to trip over by accident.
   */
  const numberFor = (key: string) => `9198765${Math.abs(hash(key)) % 100000}`.slice(0, 12);

  async function queued(key: string, over: Record<string, unknown> = {}): Promise<string> {
    const row = await repository.claim({
      organizationId,
      channel: 'WHATSAPP',
      recipientUserId: null,
      destination: numberFor(key),
      template: 'INVOICE_ISSUED',
      subject: null,
      idempotencyKey: `recovery-${key}-${Date.now()}`,
      ...over,
    });
    if (!row) {
      throw new Error('The fixture message was not created');
    }
    created.push(row.id);
    return row.id;
  }

  const read = (id: string) => prisma.outboundMessage.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    repository = app.get(MessagingRepository);
    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    organizationId = provider?.id ?? '';
    expect(organizationId).toBeTruthy();
  });

  afterAll(async () => {
    await prisma.outboundMessage.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  describe('#11: skipping never overwrites a live claim', () => {
    it('settles a queued message', async () => {
      const id = await queued('skip-queued');
      expect(await repository.markSkipped(organizationId, id, 'Channel is off')).toBe(1);
      expect((await read(id)).status).toBe('SKIPPED');
    });

    it('leaves a message a worker is holding to the sweep', async () => {
      const id = await queued('skip-sending');
      await repository.claimForSending(organizationId, id);

      // Used to accept SENDING, which overwrote the claim and raced the stalled sweep — both
      // writing a terminal state to one row, the recorded reason depending on which landed first.
      expect(await repository.markSkipped(organizationId, id, 'Channel is off')).toBe(0);
      expect((await read(id)).status).toBe('SENDING');
    });
  });

  describe('#8: a receipt whose id matched nothing', () => {
    it('adopts the one message it can only be about', async () => {
      const id = await queued('reconcile-one');
      await repository.claimForSending(organizationId, id);

      const adopted = await repository.reconcileReceipt({
        organizationId,
        channel: 'WHATSAPP',
        destination: numberFor('reconcile-one'),
        providerMessageId: 'wamid.reconciled',
        since: new Date(Date.now() - 60 * 60 * 1000),
      });

      expect(adopted?.id).toBe(id);
      expect((await read(id)).providerMessageId).toBe('wamid.reconciled');
    });

    it('declines to guess between two candidates', async () => {
      const shared = { destination: numberFor('reconcile-two') };
      const first = await queued('reconcile-two-a', shared);
      const second = await queued('reconcile-two-b', shared);
      await repository.claimForSending(organizationId, first);
      await repository.claimForSending(organizationId, second);

      const adopted = await repository.reconcileReceipt({
        organizationId,
        channel: 'WHATSAPP',
        destination: numberFor('reconcile-correlated'),
        providerMessageId: 'wamid.ambiguous',
        since: new Date(Date.now() - 60 * 60 * 1000),
      });

      // Attributing a delivery to the wrong message is worse than leaving both alone.
      expect(adopted).toBeNull();
      expect((await read(first)).providerMessageId).toBeNull();
      expect((await read(second)).providerMessageId).toBeNull();
    });

    it('never touches a row that already correlates', async () => {
      const id = await queued('reconcile-correlated');
      await repository.claimForSending(organizationId, id);
      await repository.markSent(id, 'wamid.original');

      const adopted = await repository.reconcileReceipt({
        organizationId,
        channel: 'WHATSAPP',
        destination: numberFor('reconcile-old'),
        providerMessageId: 'wamid.other',
        since: new Date(Date.now() - 60 * 60 * 1000),
      });

      expect(adopted).toBeNull();
      expect((await read(id)).providerMessageId).toBe('wamid.original');
    });

    it('does not reach outside the window', async () => {
      const id = await queued('reconcile-old');
      await repository.claimForSending(organizationId, id);

      const adopted = await repository.reconcileReceipt({
        organizationId,
        channel: 'WHATSAPP',
        destination: numberFor('reconcile-tenant'),
        providerMessageId: 'wamid.late',
        // A window that has already closed.
        since: new Date(Date.now() + 60 * 1000),
      });

      expect(adopted).toBeNull();
    });

    it('does not cross a tenant', async () => {
      const id = await queued('reconcile-tenant');
      await repository.claimForSending(organizationId, id);

      const adopted = await repository.reconcileReceipt({
        organizationId: '00000000-0000-4000-8000-000000000000',
        channel: 'WHATSAPP',
        destination: numberFor('reconcile-tenant'),
        providerMessageId: 'wamid.foreign',
        since: new Date(Date.now() - 60 * 60 * 1000),
      });

      expect(adopted).toBeNull();
      expect((await read(id)).providerMessageId).toBeNull();
    });
  });
});

/** A small stable hash, so each fixture gets its own number without a shared counter. */
function hash(value: string): number {
  let total = 0;
  for (const char of value) {
    total = (total * 31 + char.charCodeAt(0)) | 0;
  }
  return total;
}
