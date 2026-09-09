import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { maskDestination } from './destination-mask';
import { MessagingQueue } from './messaging.queue';
import { MessagingRepository, type OutboundMessageRow } from './messaging.repository';
import type { SendRequest } from './message-sender.service';

/**
 * Sending a failed outbound message again.
 *
 * **Why this is a new row rather than a re-queue.** The row being resent is FAILED, and FAILED
 * means one of two things: the attempts ran out, or the provider accepted the message and then
 * reported a failure. There is a third case the sweep produces — a worker killed after the
 * provider accepted the message but before `markSent` — where the message may well have arrived.
 * Putting any of those back into the queue would re-enter delivery on a row that might already
 * have been sent, which is precisely the double-send `claimForSending` refuses to allow.
 *
 * So a resend does not touch the failed row at all. It creates a new one, with its own
 * idempotency key, pointing back at the original through `resentFromId`. The history keeps both:
 * what failed, and what was sent instead. Nothing is replayed, because nothing is reused.
 *
 * **Why it is explicit.** An automatic retry cannot tell "never arrived" from "arrived and the
 * receipt says otherwise", so it would mail some clients twice. A person can look at the failure
 * and decide. That is why this needs its own permission and writes its own audit record.
 */
@Injectable()
export class MessageResendService {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly queue: MessagingQueue,
    private readonly auditLog: AuditLogService,
  ) {}

  async resend(actor: AuthenticatedUser, messageId: string): Promise<OutboundMessageRow> {
    const original = await this.repository.findById(actor.organizationId, messageId);
    if (!original) {
      throw new NotFoundException('That message does not exist');
    }

    // Only a failed message. A SENT one has arrived; a QUEUED or SENDING one still has its
    // attempt ahead of it and resending would race the worker holding it; a SKIPPED one was
    // settled on purpose because the channel is off, and turning it back on is the fix.
    if (original.status !== 'FAILED') {
      throw new ConflictException(
        `Only a failed message can be sent again; this one is ${original.status}`,
      );
    }

    const request = readPayload(original);
    if (!request) {
      // Rows written before the payload column existed. Refused with the reason rather than
      // resent with invented content.
      throw new BadRequestException(
        'This message was recorded before its content was kept, so it cannot be sent again',
      );
    }

    const resend: SendRequest = {
      ...request,
      organizationId: actor.organizationId,
      // A new key, or the unique index would refuse the row as a duplicate of the event that
      // produced the original — which is exactly what it is for, and exactly not what this is.
      idempotencyKey: `resend:${original.id}`,
      resentFromId: original.id,
    };

    // Channel and template come from the stored request, which is typed as a sendable message.
    // The row's own columns are wider — `channel` there covers in-app notifications too — and a
    // resend must only ever be one of the channels a provider exists for.
    if (resend.channel !== original.channel || resend.template !== original.template) {
      throw new BadRequestException('The stored content does not match the message being resent');
    }

    const created = await this.repository.claim({
      organizationId: actor.organizationId,
      channel: resend.channel,
      recipientUserId: original.recipientUserId,
      destination: original.destination,
      template: resend.template,
      subject: original.subject,
      idempotencyKey: `resend:${original.id}`,
      payload: resend as unknown as Parameters<MessagingRepository['claim']>[0]['payload'],
      resentFromId: original.id,
    });

    // Null means a row for `resend:<id>` already exists: this message has been resent before.
    // Refused rather than sent again, so a double-click is one message and not two.
    if (!created) {
      throw new ConflictException('This message has already been sent again');
    }

    await this.queue.enqueueSend({ messageId: created.id, request: resend });

    await this.auditLog.record({
      action: AUDIT_ACTION.MESSAGE_RESENT,
      entityType: AUDIT_ENTITY_TYPE.MESSAGE,
      entityId: created.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        resentFrom: original.id,
        channel: resend.channel,
        template: resend.template,
        // Masked, like every other place a destination reaches a response or a log.
        destination: maskDestination(resend.channel, original.destination),
        originalError: original.lastError,
      },
    });

    return created;
  }
}

/** The stored request, or null when the row predates the column. */
function readPayload(row: OutboundMessageRow): SendRequest | null {
  const payload = (row as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const candidate = payload as Partial<SendRequest>;
  // Enough of the shape to send: anything less and the message would go out wrong.
  return candidate.template && candidate.destination && candidate.title
    ? (candidate as SendRequest)
    : null;
}
