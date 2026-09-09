import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  SUPPORT_CALLBACK_EVENT,
  TICKET_STATUS,
  type SupportCallbackEvent,
  type SupportCallbackPayload,
  type TicketStatus,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { CallbackEndpointsRepository } from './callback-endpoints.repository';
import { subscribes } from './callback-sender.service';
import { ExternalTicketStatusReader } from './external-ticket-status.reader';
import { SupportCallbacksQueue } from './support-callbacks.queue';
import { SupportCallbacksRepository } from './support-callbacks.repository';

/** Which status a ticket moved to maps to which event. Anything else is not an event. */
const STATUS_EVENTS: Partial<Record<TicketStatus, SupportCallbackEvent>> = {
  [TICKET_STATUS.ASSIGNED]: SUPPORT_CALLBACK_EVENT.TICKET_ASSIGNED,
  [TICKET_STATUS.AUTO_ASSIGNED]: SUPPORT_CALLBACK_EVENT.TICKET_ASSIGNED,
  [TICKET_STATUS.WAITING_CLIENT]: SUPPORT_CALLBACK_EVENT.TICKET_WAITING_CLIENT,
  [TICKET_STATUS.IN_PROGRESS]: SUPPORT_CALLBACK_EVENT.TICKET_IN_PROGRESS,
  [TICKET_STATUS.RESOLVED]: SUPPORT_CALLBACK_EVENT.TICKET_RESOLVED,
  [TICKET_STATUS.CLOSED]: SUPPORT_CALLBACK_EVENT.TICKET_CLOSED,
};

/**
 * What the rest of the application calls when something a product should hear about happens.
 *
 * Every emission point does the same three things and none of them may be skipped: build the
 * payload from the external allow-list, claim a delivery row against an idempotency key, and post
 * a job. Doing that once here rather than at each call site is what keeps the payload honest —
 * a caller cannot pass a ticket and have it serialised, because this never takes one.
 *
 * **Nothing here throws into its caller.** A ticket that was resolved has been resolved; failing
 * the resolve because a customer's endpoint is unreachable would make Desk's own workflow depend
 * on somebody else's uptime. A failure to emit is logged and the delivery simply does not exist.
 */
@Injectable()
export class CallbackEmitterService {
  constructor(
    private readonly deliveries: SupportCallbacksRepository,
    private readonly endpoints: CallbackEndpointsRepository,
    private readonly statuses: ExternalTicketStatusReader,
    private readonly queue: SupportCallbacksQueue,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CallbackEmitterService.name);
  }

  /** A ticket arrived through the ingress. Emitted next to the routing request, for the same reason. */
  ticketCreated(organizationId: string, ticketId: string, occurredAt = new Date()): Promise<void> {
    return this.emit(organizationId, ticketId, SUPPORT_CALLBACK_EVENT.TICKET_CREATED, occurredAt);
  }

  /** A status transition. Statuses with no external meaning produce nothing. */
  ticketStatusChanged(
    organizationId: string,
    ticketId: string,
    status: TicketStatus,
    occurredAt = new Date(),
  ): Promise<void> {
    const event = STATUS_EVENTS[status];
    return event ? this.emit(organizationId, ticketId, event, occurredAt) : Promise.resolve();
  }

  /**
   * A public reply.
   *
   * Only ever called for `VISIBILITY.CLIENT`; there is no overload for an internal note, and the
   * payload has no field one could be put in.
   */
  publicComment(
    organizationId: string,
    ticketId: string,
    comment: { id: string; body: string; createdAt: Date },
  ): Promise<void> {
    return this.emit(
      organizationId,
      ticketId,
      SUPPORT_CALLBACK_EVENT.SUPPORT_UPDATE,
      comment.createdAt,
      { at: comment.createdAt.toISOString(), body: comment.body },
      `${SUPPORT_CALLBACK_EVENT.SUPPORT_UPDATE}:${comment.id}`,
    );
  }

  private async emit(
    organizationId: string,
    ticketId: string,
    event: SupportCallbackEvent,
    occurredAt: Date,
    update?: { at: string; body: string },
    idempotencyKey?: string,
  ): Promise<void> {
    try {
      await this.tenantContext.runAsSystem(async () => {
        const product = await this.productOf(organizationId, ticketId);
        if (!product) {
          return;
        }
        const endpoint = await this.endpoints.find(organizationId, product.id);
        if (!endpoint || !endpoint.enabled || !subscribes(endpoint.events, event)) {
          return;
        }

        const deliveryId = randomUUID();
        const payload: SupportCallbackPayload = {
          deliveryId,
          event,
          occurredAt: occurredAt.toISOString(),
          product: { id: product.id, code: product.code },
          ticket: await this.statuses.read(organizationId, ticketId, product.id),
          ...(update ? { update } : {}),
        };

        const row = await this.deliveries.claim({
          id: deliveryId,
          organizationId,
          productId: product.id,
          ticketId,
          event,
          // The default key names the event, the ticket and the moment — the moment the *caller*
          // gives, which is what makes the collision real rather than lucky. A caller whose
          // emission can be repeated for one and the same fact passes that fact's own timestamp
          // (`TicketTransitionsService.finish` passes the transition's `updatedAt`), so two
          // emissions of it produce one delivery; a genuine second visit to the same status
          // (resolved, reopened, resolved again) carries a later timestamp and is a second
          // delivery. Defaulting to `new Date()` would make every repeat a millisecond-distinct
          // key, and this line would protect nothing.
          idempotencyKey: idempotencyKey ?? `${event}:${ticketId}:${occurredAt.toISOString()}`,
          url: endpoint.url,
          payload: { ...payload },
        });
        if (!row) {
          return;
        }
        await this.queue.enqueue({ organizationId, deliveryId: row.id });
      });
    } catch (error) {
      // The ticket change itself has already happened and is visible. A callback that could not be
      // queued is a callback an operator can send again from the delivery log.
      this.logger.warn({ err: error, ticketId, event }, 'Could not queue a support callback');
    }
  }

  private productOf(organizationId: string, ticketId: string) {
    return this.prisma.product.findFirst({
      where: { organizationId, deletedAt: null, tickets: { some: { id: ticketId } } },
      select: { id: true, code: true },
    });
  }
}
