import { Injectable } from '@nestjs/common';
import type { IntegrationProvider } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export type IntegrationConnectionRow = Prisma.IntegrationConnectionGetPayload<object>;
export type IntegrationEventRow = Prisma.IntegrationEventGetPayload<object>;

/**
 * Data access for integration connections and inbound webhook events.
 *
 * Every method takes `organizationId` first and puts it in the where clause. That is the first
 * layer; the row-level-security policies added in 20260906100000_phase3_integration_foundation
 * are the second, for the query that forgets.
 */
@Injectable()
export class IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(organizationId: string): Promise<IntegrationConnectionRow[]> {
    return this.prisma.integrationConnection.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { provider: 'asc' },
    });
  }

  findByProvider(
    organizationId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationConnectionRow | null> {
    return this.prisma.integrationConnection.findFirst({
      where: { organizationId, provider, deletedAt: null },
    });
  }

  /**
   * The connection that owns a provider-side account id.
   *
   * Deliberately not scoped to an organization: this *is* how an unauthenticated webhook is
   * attributed to a tenant. The caller must verify the delivery's signature against this
   * connection's own secret before acting on anything.
   */
  /**
   * Every connection claiming an external account id, for the webhook path.
   *
   * All of them, not the first. `external_account_id` carries no unique constraint — nothing stops
   * a second tenant entering the same WhatsApp business account id — so `findFirst` would return
   * an arbitrary row and hand another tenant's deliveries to whoever the planner picked. The
   * caller decides between candidates by which secret verifies the signature.
   *
   * Capped: this runs before any authentication, so the work an unauthenticated caller can ask
   * for has to be bounded. A genuine account id is claimed once.
   */
  findAllByExternalAccount(
    provider: IntegrationProvider,
    externalAccountId: string,
  ): Promise<IntegrationConnectionRow[]> {
    return this.prisma.integrationConnection.findMany({
      where: { provider, externalAccountId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  findById(organizationId: string, id: string): Promise<IntegrationConnectionRow | null> {
    return this.prisma.integrationConnection.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  /**
   * Creates the connection, or updates the existing one for this provider. The unique index on
   * (organization_id, provider) means a tenant can never end up with two of the same provider.
   */
  upsert(
    organizationId: string,
    provider: IntegrationProvider,
    createdById: string,
    data: Prisma.IntegrationConnectionUncheckedUpdateInput,
  ): Promise<IntegrationConnectionRow> {
    return this.prisma.integrationConnection.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: {
        ...(data as Prisma.IntegrationConnectionUncheckedCreateInput),
        // After the spread: the identity of the row is decided by the caller's arguments, never
        // by whatever the update payload happens to contain.
        organizationId,
        provider,
        createdById,
      },
      update: data,
    });
  }

  update(
    id: string,
    data: Prisma.IntegrationConnectionUncheckedUpdateInput,
  ): Promise<IntegrationConnectionRow> {
    return this.prisma.integrationConnection.update({ where: { id }, data });
  }

  /**
   * Disconnect wipes the credentials but keeps the row, so the audit trail and the linked
   * repositories survive and reconnecting does not lose their history.
   */
  clearCredentials(id: string): Promise<IntegrationConnectionRow> {
    return this.prisma.integrationConnection.update({
      where: { id },
      data: {
        encryptedCredentials: null,
        webhookSecretEncrypted: null,
        credentialsExpireAt: null,
        externalAccountId: null,
        scopes: [],
        status: 'DISCONNECTED',
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });
  }

  listEvents(
    organizationId: string,
    limit: number,
    provider?: IntegrationProvider,
  ): Promise<IntegrationEventRow[]> {
    return this.prisma.integrationEvent.findMany({
      where: { organizationId, ...(provider ? { provider } : {}) },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Records an inbound webhook.
   *
   * Returns null when the provider has sent this delivery id before: the unique index on
   * (provider, external_event_id) rejects the insert, and that rejection *is* the duplicate
   * protection — no read-then-write race can slip a second copy through.
   */
  async recordEvent(
    data: Prisma.IntegrationEventUncheckedCreateInput,
  ): Promise<IntegrationEventRow | null> {
    try {
      return await this.prisma.integrationEvent.create({ data });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: unknown }).code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  markEventProcessed(id: string): Promise<IntegrationEventRow> {
    return this.prisma.integrationEvent.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  }

  markEventFailed(id: string, lastError: string): Promise<IntegrationEventRow> {
    return this.prisma.integrationEvent.update({
      where: { id },
      data: { status: 'FAILED', lastError, attempts: { increment: 1 } },
    });
  }
}
