import { Injectable } from '@nestjs/common';
import type { MessageTemplate, OutboundMessageStatus } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { redactMessage } from '../integrations/redact';
import type { Prisma } from '../../generated/prisma/client';

export type OutboundMessageRow = Prisma.OutboundMessageGetPayload<object>;

export type MessageChannel = 'EMAIL' | 'WHATSAPP';

export interface ClaimInput {
  organizationId: string;
  channel: MessageChannel;
  recipientUserId: string | null;
  destination: string;
  template: MessageTemplate;
  subject: string | null;
  idempotencyKey: string;
  /** The rendered request, kept so a failed message can be sent again. */
  payload?: Prisma.InputJsonValue;
  /** Set when this row was created by resending an earlier one. */
  resentFromId?: string;
}

@Injectable()
export class MessagingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserves the right to send this message, or reports that someone already has.
   *
   * The unique index on (organization, channel, idempotencyKey) is the whole mechanism: two
   * concurrent workers both call this, one row is created and the other gets a constraint
   * violation, so exactly one of them sends. Checking for an existing row first and then
   * inserting would leave a window between the two where both see nothing.
   */
  async claim(input: ClaimInput): Promise<OutboundMessageRow | null> {
    try {
      return await this.prisma.outboundMessage.create({
        data: {
          organizationId: input.organizationId,
          channel: input.channel,
          recipientUserId: input.recipientUserId,
          destination: input.destination,
          template: input.template,
          subject: input.subject,
          idempotencyKey: input.idempotencyKey,
          ...(input.payload === undefined ? {} : { payload: input.payload }),
          ...(input.resentFromId === undefined ? {} : { resentFromId: input.resentFromId }),
          status: 'QUEUED',
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  findById(organizationId: string, id: string): Promise<OutboundMessageRow | null> {
    return this.prisma.outboundMessage.findFirst({ where: { id, organizationId } });
  }

  /**
   * Claims the message for one delivery attempt, or returns null if it is not claimable.
   *
   * Conditional on the status, not a plain update. BullMQ can re-run a job whose worker was
   * killed, and a worker killed after the provider accepted the message but before `markSent`
   * leaves the row in SENDING — re-entering delivery there sends it a second time.
   *
   * QUEUED only. A retry does not leave the row FAILED: `markFailed(…, retrying = true)` puts it
   * back to QUEUED, so the queue picks it up through this same guard. FAILED means one of two
   * things, and neither may be re-sent — the attempts ran out, or the provider accepted the
   * message and then reported a delivery failure through a receipt, which arrives on a row that
   * already has a `providerMessageId`.
   *
   * Scoped by organization as well as by id. The message id and the organization arrive as two
   * independent fields of a queue payload, and the caller loads the provider credentials from the
   * organization — so without this predicate a mismatched pair would send one tenant's message
   * through another tenant's SMTP or WhatsApp account. RLS is no backstop: a background job runs
   * with no tenant set, which opens every policy.
   */
  async claimForSending(organizationId: string, id: string): Promise<OutboundMessageRow | null> {
    const claimed = await this.prisma.outboundMessage.updateMany({
      where: { id, organizationId, status: 'QUEUED' },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      return null;
    }
    return this.prisma.outboundMessage.findFirst({ where: { id, organizationId } });
  }

  /**
   * Fails claims no worker ever came back from.
   *
   * `claimForSending` matches QUEUED only, deliberately: a worker killed after the provider
   * accepted the message but before `markSent` leaves the row SENDING, and re-entering delivery
   * there sends it twice. The cost of that guard is that SENDING has no exit — a killed worker
   * leaves a row no retry can claim, no receipt can match (the provider id was never recorded)
   * and no screen can act on. This is the exit, and it is one way only.
   *
   * FAILED, never back to QUEUED. Whether the message actually reached anyone is genuinely
   * unknown: the worker may have died before the provider call or after it was accepted.
   * Re-queueing would gamble on the second case and mail a client twice; FAILED is the honest
   * statement that the attempt is over and nobody knows how it ended.
   *
   * `updatedAt` is the claim time and needs no column of its own. On a row that is still SENDING
   * the claim is by definition the most recent write — every other transition moves it out of
   * SENDING — so it cannot be made stale by an unrelated update.
   *
   * The status predicate is in the `where`, so a worker that finishes between the query planning
   * and the write is not overwritten: it has already moved the row out of SENDING and this
   * matches nothing.
   */
  async failStalledClaims(claimedBefore: Date, reason: string): Promise<number> {
    const { count } = await this.prisma.outboundMessage.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: claimedBefore } },
      data: { status: 'FAILED', failedAt: new Date(), lastError: reason },
    });
    return count;
  }

  markSent(id: string, providerMessageId: string | null): Promise<OutboundMessageRow> {
    return this.prisma.outboundMessage.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId, lastError: null },
    });
  }

  /** `retrying` keeps the row queued so the next attempt picks it up. */
  markFailed(id: string, error: string, retrying: boolean): Promise<OutboundMessageRow> {
    return this.prisma.outboundMessage.update({
      where: { id },
      data: retrying
        ? { status: 'QUEUED', lastError: error }
        : { status: 'FAILED', failedAt: new Date(), lastError: error },
    });
  }

  /**
   * Marks a message as never attempted — the channel is not configured.
   *
   * Conditional, like the claim. This runs before the claim in `deliver`, so a re-run of a job
   * whose message was already sent, after the tenant switched the channel off, would otherwise
   * rewrite a SENT row to SKIPPED and drop its `lastError` — destroying the delivery record the
   * table exists to keep.
   */
  /**
   * Settles a message that will never be sent — the channel is switched off, say.
   *
   * QUEUED only. SENDING used to be accepted too, so that a re-run of a job whose channel had
   * since been turned off could still settle the row; but a SENDING row is one a worker is
   * holding, and overwriting a live claim is not settling it. It also raced the stalled-claim
   * sweep, which writes a terminal state to the same row — neither ordering corrupts data, but
   * the reason recorded against the message depended on which landed first.
   *
   * A re-run against a SENDING row now changes nothing and the sweep settles it, which is the
   * component that exists for exactly that case and records a reason that says so.
   */
  async markSkipped(organizationId: string, id: string, reason: string): Promise<number> {
    const { count } = await this.prisma.outboundMessage.updateMany({
      where: { id, organizationId, status: 'QUEUED' },
      data: { status: 'SKIPPED', lastError: reason },
    });
    return count;
  }

  /**
   * Applies a delivery receipt from the provider.
   *
   * Scoped by organization as well as by the provider's id: the id comes from a webhook, and a
   * webhook must not be able to reach into another tenant's rows even after its signature has
   * been verified. `updateMany` rather than `update` so an id we do not recognise is a no-op
   * instead of an exception.
   */
  async applyDeliveryStatus(
    organizationId: string,
    providerMessageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    error: string | null,
  ): Promise<number> {
    const failed = status === 'failed';
    const result = await this.prisma.outboundMessage.updateMany({
      where: { organizationId, providerMessageId },
      data: failed
        ? // Redacted and length-capped: `error` is built from the provider's free-text `title`
          // and `message` fields in the webhook body, and this column is returned to anyone with
          // `integration:read`. Every other writer of a `last_error` column already does this.
          { status: 'FAILED', failedAt: new Date(), lastError: error ? redactMessage(error) : null }
        : { status: 'SENT', sentAt: new Date() },
    });
    return result.count;
  }

  /**
   * Attaches a receipt that matched no row to the message it is almost certainly about.
   *
   * The gap this closes: a worker killed after the provider accepted the message but before
   * `markSent` leaves the row with no `provider_message_id`, and the stalled sweep then fails it.
   * A receipt arriving afterwards matches nothing, so the row stays FAILED for a message that was
   * in fact delivered.
   *
   * Deliberately narrow, because this is the one heuristic in the module:
   *
   *  * only rows the provider could plausibly have taken — SENDING, or FAILED by the sweep — and
   *    only ones with no provider id, so a row that already correlates is never touched;
   *  * same tenant, same channel, same destination;
   *  * inside a window, so an old row cannot be revived by an unrelated receipt;
   *  * and **only when exactly one row matches**. Two candidates mean the evidence does not say
   *    which, and attributing a delivery to the wrong message is worse than leaving both alone.
   *
   * Returns the row it adopted, or null when it declined to guess.
   */
  async reconcileReceipt(input: {
    organizationId: string;
    channel: MessageChannel;
    destination: string;
    providerMessageId: string;
    since: Date;
  }): Promise<OutboundMessageRow | null> {
    const candidates = await this.prisma.outboundMessage.findMany({
      where: {
        organizationId: input.organizationId,
        channel: input.channel,
        destination: input.destination,
        providerMessageId: null,
        status: { in: ['SENDING', 'FAILED'] },
        queuedAt: { gte: input.since },
      },
      take: 2,
    });
    if (candidates.length !== 1) {
      return null;
    }
    const [candidate] = candidates as [OutboundMessageRow];

    // Conditional on the id still being absent: another receipt may have claimed this row
    // between the read and the write.
    const { count } = await this.prisma.outboundMessage.updateMany({
      where: { id: candidate.id, providerMessageId: null },
      data: { providerMessageId: input.providerMessageId },
    });
    return count === 1 ? candidate : null;
  }

  async history(filter: {
    organizationId: string;
    channel: MessageChannel;
    status?: OutboundMessageStatus[];
    limit: number;
    cursor?: string;
  }): Promise<{ items: OutboundMessageRow[]; nextCursor: string | null; total: number }> {
    const where: Prisma.OutboundMessageWhereInput = {
      organizationId: filter.organizationId,
      channel: filter.channel,
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.outboundMessage.count({ where }),
      this.prisma.outboundMessage.findMany({
        where,
        orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }
}

/** Prisma reports a unique-index conflict as P2002. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}
