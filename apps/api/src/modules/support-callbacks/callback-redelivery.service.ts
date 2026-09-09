import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type SupportCallbackDeliverySummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { toDeliverySummary } from './support-callbacks.mapper';
import { SupportCallbacksQueue } from './support-callbacks.queue';
import { SupportCallbacksRepository } from './support-callbacks.repository';

/**
 * Sending a settled callback again.
 *
 * **Why this re-queues the same row, when `message-resend.service.ts` deliberately does not.**
 * That file explains at length why resending an email creates a *new* row: a FAILED email may in
 * fact have been delivered, nobody can tell, and putting the row back in the queue would gamble on
 * the wrong half of that and mail a client twice. Every word of it is right — about email.
 *
 * A callback is a different contract. Every delivery carries `X-Ashniva-Delivery`, and the
 * integration documentation tells receivers, in the same breath as the signature recipe, to treat
 * that id as an idempotency key and ignore one they have already processed. So a redelivery of the
 * same id is *defined* to be harmless: a receiver that has seen it discards it, and one that has
 * not gets the event it was owed. A new row would break exactly that guarantee, because it would
 * carry a new id and a correct receiver would process the same event twice.
 *
 * The divergence is therefore deliberate and rests entirely on the receiver contract. Anything
 * sent to somebody who was not told to deduplicate — a person's inbox, a telephone — must keep
 * following the messaging rule instead.
 *
 * It stays an explicit act with its own audit record for the same reason a resend does: an
 * automatic retry cannot tell "the receiver was down" from "the receiver rejected it and always
 * will", and a person looking at the failure can.
 */
@Injectable()
export class CallbackRedeliveryService {
  constructor(
    private readonly deliveries: SupportCallbacksRepository,
    private readonly queue: SupportCallbacksQueue,
    private readonly auditLog: AuditLogService,
  ) {}

  async redeliver(
    actor: AuthenticatedUser,
    deliveryId: string,
  ): Promise<SupportCallbackDeliverySummary> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The product registry is internal');
    }
    const original = await this.deliveries.findById(actor.organizationId, deliveryId);
    if (!original) {
      throw new NotFoundException('That callback delivery does not exist');
    }
    // A QUEUED or SENDING row still has its attempt ahead of it, and re-queueing would race the
    // worker holding it — which is the one case the delivery id cannot protect against, because
    // both copies would be in flight at once.
    if (original.status === 'QUEUED' || original.status === 'SENDING') {
      throw new ConflictException(`This callback is already ${original.status.toLowerCase()}`);
    }

    const requeued = await this.deliveries.requeue(actor.organizationId, deliveryId);
    if (requeued !== 1) {
      throw new ConflictException('This callback changed while it was being redelivered');
    }
    // Read back before the job is posted, so the response describes what this action did rather
    // than whatever a worker has already done to the row in the meantime.
    const requeuedRow = await this.deliveries.findById(actor.organizationId, deliveryId);
    await this.queue.enqueue(
      { organizationId: actor.organizationId, deliveryId },
      `redeliver-${original.attempts}-${Date.now()}`,
    );

    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CALLBACK_REDELIVERED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: original.productId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        deliveryId,
        event: original.event,
        wasStatus: original.status,
        previousError: original.lastError,
      },
    });

    return toDeliverySummary(requeuedRow ?? original);
  }
}
