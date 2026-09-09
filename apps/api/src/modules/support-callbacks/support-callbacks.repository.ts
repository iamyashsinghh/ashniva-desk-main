import { Injectable } from '@nestjs/common';
import type { SupportCallbackEvent, SupportCallbackPayload } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export type CallbackDeliveryRow = Prisma.SupportCallbackDeliveryGetPayload<object>;

export interface ClaimDeliveryInput {
  /**
   * The row's id, chosen by the caller.
   *
   * Supplied rather than generated, because the id is also the delivery id inside the signed
   * payload. Letting the database mint it would mean building the payload, inserting, and then
   * rewriting the payload with the id — two writes, and a window in which the stored body and the
   * body a receiver would deduplicate on disagree.
   */
  id: string;
  organizationId: string;
  productId: string;
  ticketId: string | null;
  event: SupportCallbackEvent;
  idempotencyKey: string;
  url: string;
  /** Typed rather than free JSON, so the column can only ever hold the external-safe shape. */
  payload: SupportCallbackPayload;
}

/**
 * Delivery rows, with `MessagingRepository`'s semantics reproduced exactly.
 *
 * Not similar semantics — the same ones, for the same reasons, because the failure modes are the
 * same. An outbound HTTP call and an outbound email are both "we handed something to somebody
 * else's system and may never learn what happened to it", and every rule below exists because of
 * that shared shape. Where a comment here repeats one from `messaging.repository.ts`, that is
 * deliberate: the two files should be readable side by side and be seen to agree.
 */
@Injectable()
export class SupportCallbacksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserves the right to deliver this event, or reports that someone already has.
   *
   * The unique index on (organization, idempotencyKey) is the whole mechanism: two concurrent
   * emissions both call this, one row is created and the other gets a constraint violation, so
   * exactly one delivery happens. Checking for an existing row first and then inserting would
   * leave a window between the two where both see nothing and both send.
   */
  async claim(input: ClaimDeliveryInput): Promise<CallbackDeliveryRow | null> {
    try {
      return await this.prisma.supportCallbackDelivery.create({
        data: {
          ...input,
          // Prisma's `InputJsonValue` cannot express an interface with an optional property, so
          // the narrower type has to be widened here. The cast is at the boundary, and the
          // parameter above is what actually constrains what may be written.
          payload: input.payload as unknown as Prisma.InputJsonValue,
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

  findById(organizationId: string, id: string): Promise<CallbackDeliveryRow | null> {
    return this.prisma.supportCallbackDelivery.findFirst({ where: { id, organizationId } });
  }

  /**
   * Claims the delivery for one attempt, or returns null if it is not claimable.
   *
   * Conditional on the status, not a plain update. BullMQ can re-run a job whose worker was
   * killed, and a worker killed after the endpoint accepted the request but before `markSent`
   * leaves the row in SENDING — re-entering delivery there sends it a second time, which is the
   * one thing the delivery id is supposed to make unnecessary.
   *
   * Scoped by organization as well as by id. The delivery id and the organization arrive as two
   * independent fields of a queue payload, and the sender loads the signing secret from the
   * product that organization owns — so without this predicate a mismatched pair would sign one
   * tenant's payload with another tenant's secret and post it to their endpoint. RLS is no
   * backstop: a background job runs with no tenant set, which opens every policy.
   */
  async claimForSending(organizationId: string, id: string): Promise<CallbackDeliveryRow | null> {
    const claimed = await this.prisma.supportCallbackDelivery.updateMany({
      where: { id, organizationId, status: 'QUEUED' },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      return null;
    }
    return this.prisma.supportCallbackDelivery.findFirst({ where: { id, organizationId } });
  }

  markSent(id: string, responseStatus: number): Promise<CallbackDeliveryRow> {
    return this.prisma.supportCallbackDelivery.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), responseStatus, lastError: null },
    });
  }

  /** `retrying` keeps the row queued so the next attempt picks it up through the same guard. */
  markFailed(
    id: string,
    error: string,
    retrying: boolean,
    responseStatus: number | null,
  ): Promise<CallbackDeliveryRow> {
    return this.prisma.supportCallbackDelivery.update({
      where: { id },
      data: retrying
        ? { status: 'QUEUED', lastError: error, responseStatus }
        : { status: 'FAILED', failedAt: new Date(), lastError: error, responseStatus },
    });
  }

  /**
   * Settles a delivery that will never be sent — the endpoint was switched off, say.
   *
   * QUEUED only. A SENDING row is one a worker is holding, and overwriting a live claim is not
   * settling it; it would also race the stalled sweep, which writes a terminal state to the same
   * row. A re-run against a SENDING row changes nothing and the sweep settles it, which is the
   * component that exists for exactly that case.
   */
  async markSkipped(organizationId: string, id: string, reason: string): Promise<number> {
    const { count } = await this.prisma.supportCallbackDelivery.updateMany({
      where: { id, organizationId, status: 'QUEUED' },
      data: { status: 'SKIPPED', lastError: reason },
    });
    return count;
  }

  /**
   * Fails claims no worker ever came back from.
   *
   * FAILED, never back to QUEUED. Whether the endpoint actually received the callback is genuinely
   * unknown: the worker may have died before the request or after it was accepted. Re-queueing
   * would gamble on the first case and post the same event twice; FAILED is the honest statement
   * that the attempt is over and nobody knows how it ended. An operator who decides it did not
   * arrive can redeliver it by hand.
   *
   * `updatedAt` is the claim time and needs no column of its own: on a row that is still SENDING
   * the claim is by definition the most recent write, because every other transition moves it out
   * of SENDING. The status predicate is in the `where`, so a worker that finishes between the
   * query planning and the write is not overwritten.
   */
  async failStalledClaims(claimedBefore: Date, reason: string): Promise<number> {
    const { count } = await this.prisma.supportCallbackDelivery.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: claimedBefore } },
      data: { status: 'FAILED', failedAt: new Date(), lastError: reason },
    });
    return count;
  }

  /** Puts a settled delivery back in the queue. See `SupportCallbackRedeliveryService`. */
  async requeue(organizationId: string, id: string): Promise<number> {
    const { count } = await this.prisma.supportCallbackDelivery.updateMany({
      where: { id, organizationId, status: { in: ['FAILED', 'SKIPPED', 'SENT'] } },
      data: { status: 'QUEUED', lastError: null },
    });
    return count;
  }

  history(filter: {
    organizationId: string;
    productId: string;
    limit: number;
    cursor?: string;
  }): Promise<CallbackDeliveryRow[]> {
    return this.prisma.supportCallbackDelivery.findMany({
      where: { organizationId: filter.organizationId, productId: filter.productId },
      orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
  }
}

/** Prisma reports a unique-index conflict as P2002. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}
