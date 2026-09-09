import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  isAtLeastAsUrgent,
  TICKET_SOURCE,
  VISIBILITY,
  normalizeWorkArea,
  toClientVisibleTicketStatus,
  type ExternalTicketStatus,
  type Priority,
  type SupportIngressResult,
  type SupportTierPolicy,
  type TicketStatus,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../database/prisma.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { fingerprintTicket } from '../tickets/ticket-fingerprint';
import { ticketKey } from '../tickets/tickets.mapper';
import { TicketSlaService } from '../sla-escalations/ticket-sla.service';
import { CallbackEmitterService } from '../support-callbacks/callback-emitter.service';
import { ExternalTicketStatusReader } from '../support-callbacks/external-ticket-status.reader';
import { SupportTierPolicyService } from '../support-tiers/support-tier-policy.service';
import type { RaiseSupportTicketDto } from './dto/support-ingress.dto';
import { IngressAttachmentsService, type StagedAttachment } from './ingress-attachments.service';
import type { AuthenticatedProduct } from './product-context';
import { ProductsRepository } from './products.repository';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/**
 * Turning an authenticated external request into an ordinary Desk ticket.
 *
 * The rule this file exists to enforce: **nothing about where the ticket goes comes from the
 * request**. Organization, project, client organization, source policy and routing policy are all
 * read from the product record the credential resolved to. A caller supplies content — a title, a
 * description, who was affected — and nothing else. A caller that could name its own project
 * could route its tickets to any team in the product.
 *
 * The ticket it produces is an ordinary ticket in every respect: the same table, the same
 * workflow, the same SLA clock, and the same package 8b router. There is deliberately no second
 * routing path for API tickets — a parallel one would drift, and the drift would only be visible
 * to whoever was on call at the time.
 */
@Injectable()
export class SupportIngressService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly prisma: PrismaService,
    private readonly attachments: IngressAttachmentsService,
    private readonly auditLog: AuditLogService,
    private readonly tiers: SupportTierPolicyService,
    private readonly sla: TicketSlaService,
    private readonly callbacks: CallbackEmitterService,
    private readonly statuses: ExternalTicketStatusReader,
    private readonly logger: PinoLogger,
    @InjectQueue(QUEUE_NAMES.ROUTING_MONITOR) private readonly routingQueue: Queue,
  ) {
    this.logger.setContext(SupportIngressService.name);
  }

  async raise(
    product: AuthenticatedProduct,
    dto: RaiseSupportTicketDto,
    idempotencyKey: string | undefined,
  ): Promise<SupportIngressResult> {
    const tier = await this.tiers.forTier(product.organizationId, product.supportTier);
    this.assertOpen(product, tier);

    if (idempotencyKey) {
      const seen = await this.products.findIngressRequest(product.productId, idempotencyKey);
      if (seen) {
        return this.describe(product, seen.ticketId, true);
      }
    }

    const source = this.resolveSource(product, dto);
    const raisedPriority = raisePriority(
      dto.priority ?? product.defaultPriority,
      tier.minimumPriority,
    );
    const module = this.resolveWorkArea(product, dto.module);
    const now = new Date();

    const externalRequester = dto.externalUserId
      ? await this.products.upsertExternalRequester(
          product.organizationId,
          product.productId,
          dto.externalUserId,
          { name: dto.requesterName, email: dto.requesterEmail, phone: dto.requesterPhone },
          now,
        )
      : null;

    const description = this.composeDescription(dto);
    const attachments = await this.attachments.stage(product, dto.attachments);

    let ticketId: string;
    try {
      ticketId = await this.createTicket(product, {
        dto,
        source,
        module,
        description,
        priority: raisedPriority,
        externalRequesterId: externalRequester?.id ?? null,
        idempotencyKey,
        attachments,
      });
    } catch (error) {
      // The only expected failure here is the idempotency key's unique constraint, which means a
      // concurrent duplicate committed first. Re-read it and hand back the same ticket, which is
      // what the caller wanted: one request, one ticket, whichever of them raced ahead.
      if (idempotencyKey) {
        const winner = await this.products.findIngressRequest(product.productId, idempotencyKey);
        if (winner) {
          await this.attachments.discard(attachments);
          return this.describe(product, winner.ticketId, true);
        }
      }
      throw error;
    }

    await this.auditLog.record({
      action: AUDIT_ACTION.SUPPORT_INGRESS_ACCEPTED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: ticketId,
      organizationId: product.organizationId,
      // The credential's public id, the product, the caller's own reference. Never the secret,
      // and never the payload — a description can contain anything the reporter typed.
      after: {
        productCode: product.code,
        credentialKeyId: product.credentialKeyId,
        source,
        externalReference: dto.externalReference ?? null,
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    /**
     * The SLA clock, started exactly as an ordinary raise starts it.
     *
     * An ingress ticket is an ordinary ticket in every other respect and should be one here too:
     * without this it would sit with no first-response target at all, invisible to the monitor and
     * to every SLA screen — and the support tier's whole point is that it selects a policy.
     */
    await this.sla.start({
      id: ticketId,
      organizationId: product.organizationId,
      clientOrganizationId: product.clientOrganizationId,
      projectId: product.projectId,
      priority: raisedPriority,
      status: 'NEW',
      product: { supportTier: product.supportTier },
    });

    if (product.autoRouteEnabled) {
      await this.requestRouting(product.organizationId, ticketId);
    }
    // Next to the routing request, and for the same reason: both are things that follow a ticket
    // existing, neither may fail the raise, and a caller that has been told its ticket exists must
    // not have that answer depend on somebody else's endpoint being up.
    await this.callbacks.ticketCreated(product.organizationId, ticketId);
    return this.describe(product, ticketId, false);
  }

  /**
   * What the calling product may read back about its own ticket.
   *
   * Delegated to `ExternalTicketStatusReader`, which is also what builds a callback payload. One
   * reader means the poll and the push can never come to disagree about what an external system
   * may see — and it means there is exactly one place where widening the allow-list is possible.
   *
   * Scoped to `productId` so one product cannot read another's tickets by guessing an id, and —
   * when the caller is a browser rather than the customer's server — to the end user the session
   * was minted for. Without that second scope the widget token's whole reason to exist is unused
   * on the read path: every user of a product could read every other user's ticket, its title,
   * its priority and its public replies, by guessing a uuid. A machine credential passes no
   * requester and keeps the product-wide view it is entitled to.
   */
  status(
    product: AuthenticatedProduct,
    ticketId: string,
    externalUserId?: string,
  ): Promise<ExternalTicketStatus> {
    return this.statuses.read(product.organizationId, ticketId, product.productId, externalUserId);
  }

  /**
   * The ticket, the idempotency claim and the attachments, in one transaction.
   *
   * One transaction is what makes the idempotency guarantee real. The claim row and the ticket
   * commit together, so a concurrent duplicate either sees the committed claim and returns that
   * ticket, or loses the unique constraint and rolls its own ticket back. There is no ordering in
   * which two tickets exist for one request.
   */
  private async createTicket(
    product: AuthenticatedProduct,
    input: {
      dto: RaiseSupportTicketDto;
      source: string;
      module: string | null;
      description: string;
      priority: Priority;
      externalRequesterId: string | null;
      idempotencyKey: string | undefined;
      attachments: StagedAttachment[];
    },
  ): Promise<string> {
    const requesterId = product.supportRequesterId;
    if (!requesterId) {
      throw new BadRequestException(
        'This product has no support requester configured; support cannot accept tickets yet',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.organizationCounter.upsert({
        where: {
          organizationId_kind: { organizationId: product.organizationId, kind: 'TICKET' },
        },
        update: { value: { increment: 1 } },
        create: { organizationId: product.organizationId, kind: 'TICKET', value: 1 },
      });
      const title = input.dto.title.trim();
      const productVersion = input.dto.productVersion?.trim() || null;
      const ticket = await tx.ticket.create({
        data: {
          organizationId: product.organizationId,
          clientOrganizationId: product.clientOrganizationId,
          number: counter.value,
          title,
          description: input.description,
          type: input.dto.type ?? product.defaultType,
          priority: input.priority,
          source: input.source as never,
          projectId: product.projectId,
          module: input.module,
          productVersion,
          // The composed description, not the raw one: the context and metadata a caller sends
          // are often where the version string and the error code actually are.
          ...fingerprintTicket({
            title,
            description: input.description,
            module: input.module,
            productId: product.productId,
            productVersion,
          }),
          requesterId,
          productId: product.productId,
          externalRequesterId: input.externalRequesterId,
          externalReference: input.dto.externalReference ?? null,
          statusHistory: {
            create: {
              toStatus: 'NEW',
              changedById: requesterId,
              note: `Raised through ${product.name}`,
            },
          },
        },
        select: { id: true },
      });

      if (input.idempotencyKey) {
        await tx.supportIngressRequest.create({
          data: {
            organizationId: product.organizationId,
            productId: product.productId,
            idempotencyKey: input.idempotencyKey,
            ticketId: ticket.id,
            credentialKeyId: product.credentialKeyId,
            externalReference: input.dto.externalReference ?? null,
          },
        });
      }

      for (const file of input.attachments) {
        await tx.file.create({
          data: {
            organizationId: product.organizationId,
            uploadedById: requesterId,
            name: file.name,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
            storageKey: file.storageKey,
            // A reporter's screenshot is by definition something they can see.
            visibility: VISIBILITY.CLIENT,
            ticketId: ticket.id,
          },
        });
      }

      return ticket.id;
    });
  }

  private async describe(
    product: AuthenticatedProduct,
    ticketId: string,
    duplicate: boolean,
  ): Promise<SupportIngressResult> {
    const ticket = await this.prisma.ticket.findFirstOrThrow({
      where: { id: ticketId, organizationId: product.organizationId },
      select: { id: true, number: true, organizationId: true, status: true, createdAt: true },
    });
    return {
      ticketId: ticket.id,
      key: ticketKey(ticket),
      // One vocabulary on this wire: the raise answer and the status read a moment later describe
      // the same ticket, so they must not be in two different languages — and the internal one is
      // not the calling product's business either way. See `ExternalTicketStatus.status`.
      status: toClientVisibleTicketStatus(ticket.status as TicketStatus),
      createdAt: ticket.createdAt.toISOString(),
      duplicate,
    };
  }

  /** The same queued job an ordinary raise posts. One router, one path. */
  private async requestRouting(organizationId: string, ticketId: string): Promise<void> {
    try {
      await this.routingQueue.add(
        'route-ticket',
        { organizationId, ticketId },
        { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
      );
    } catch (error) {
      // The ticket exists and is visible in the support queue. Routing can be re-run by hand.
      this.logger.warn({ err: error, ticketId }, 'Could not queue routing for an ingress ticket');
    }
  }

  /**
   * Whether this product may raise a ticket at all.
   *
   * Three independent gates, one message. The tier gate joins the two switches rather than getting
   * a sentence of its own on purpose: the refusal an external caller sees stays uniform, so a probe
   * cannot map a tenant's commercial arrangements by watching which products answer differently.
   * The screens get the sentence instead, from `SupportTierPolicyService.raiseRefusal`.
   */
  private assertOpen(product: AuthenticatedProduct, tier: SupportTierPolicy): void {
    // Uniform refusals: a caller learns that it may not raise a ticket, not which switch is off.
    if (!product.supportEnabled) {
      throw new ForbiddenException('Support is not enabled for this product');
    }
    if (!product.projectId) {
      throw new ForbiddenException('Support is not enabled for this product');
    }
    if (!tier.admissionEnabled) {
      throw new ForbiddenException('Support is not enabled for this product');
    }
  }

  private resolveSource(product: AuthenticatedProduct, dto: RaiseSupportTicketDto): string {
    const requested = dto.source ?? TICKET_SOURCE.API;
    if (product.allowedSources.length > 0 && !product.allowedSources.includes(requested)) {
      throw new BadRequestException(`This product may not raise tickets from ${requested}`);
    }
    return requested;
  }

  private resolveWorkArea(
    product: AuthenticatedProduct,
    module: string | undefined,
  ): string | null {
    if (!module) {
      return null;
    }
    const area = normalizeWorkArea(module);
    if (product.allowedWorkAreas.length > 0 && !product.allowedWorkAreas.includes(area)) {
      throw new BadRequestException(`${area} is not a work area this product may raise against`);
    }
    return area;
  }

  /**
   * The reporter's description, plus the context they gave, as one body.
   *
   * Folded into the description rather than stored as loose columns because a developer reading
   * the ticket wants the screen it happened on next to the words, and because every extra
   * structured field is one more thing to keep client-safe.
   */
  private composeDescription(dto: RaiseSupportTicketDto): string {
    const parts = [dto.description.trim()];
    if (dto.context) {
      parts.push(`Where: ${dto.context}`);
    }
    const metadata = Object.entries(dto.metadata ?? {});
    if (metadata.length > 0) {
      parts.push(metadata.map(([key, value]) => `${key}: ${value}`).join('\n'));
    }
    return parts.join('\n\n');
  }
}

/**
 * The priority a ticket is actually filed at.
 *
 * A tier's floor raises a priority and never lowers one: a customer who says their problem is
 * critical is not overruled by an entitlement, and a tier that promises HIGH does not have to
 * argue with a reporter who left the field alone. Null means the tier sets no floor, which is what
 * every unconfigured tier does.
 */
export function raisePriority(requested: Priority, floor: Priority | null): Priority {
  if (!floor || isAtLeastAsUrgent(requested, floor)) {
    return requested;
  }
  return floor;
}
