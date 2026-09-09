import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ConnectionTestResult,
  type MessageTemplate,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { safeEqual, verifyHmacSha256 } from '../../common/crypto/webhook-signature';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { IntegrationsService } from '../integrations/integrations.service';
import { redactMessage } from '../integrations/redact';
import { testIdempotencyKey } from './idempotency';
import { MessageSenderService } from './message-sender.service';
import { MessagingQueue } from './messaging.queue';
import { MessagingRepository } from './messaging.repository';
import {
  parseWhatsAppWebhook,
  type WhatsAppEvent,
  type InboundStatusEvent,
} from './whatsapp-webhook';
import { readWhatsAppConfig } from './providers/whatsapp-settings';
import type { IntegrationConnectionRow } from '../integrations/integrations.repository';
import type { OutboundMessageRow } from './messaging.repository';

export interface WhatsAppSettingsInput {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  verifyToken?: string | null;
  appSecret?: string | null;
  apiVersion?: string;
  templateNames?: Partial<Record<MessageTemplate, string>>;
  templateLanguage?: string;
  /** Omitted on an edit that is not changing it; the stored one is kept. */
  accessToken?: string;
  enabled?: boolean;
}

export type WebhookOutcome =
  | { status: 'accepted'; events: number }
  | { status: 'duplicate' }
  | { status: 'rejected'; reason: string };

/**
 * How far back a receipt may reach when its id matched nothing.
 *
 * Longer than the stalled-claim sweep's 15 minutes, so the row it is looking for has had time to
 * be failed and is still in range; short enough that an unrelated later message to the same
 * number is not a candidate.
 */
const RECONCILE_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly connections: IntegrationsRepository,
    private readonly integrations: IntegrationsService,
    private readonly messages: MessagingRepository,
    private readonly sender: MessageSenderService,
    private readonly queue: MessagingQueue,
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly auditLog: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WhatsAppService.name);
  }

  /**
   * A receipt that matched nothing, given one more chance to find its row.
   *
   * The row it is looking for is one the provider took but that never had its id written down —
   * a worker killed mid-send. `reconcileReceipt` refuses to guess between two candidates; when it
   * finds exactly one it adopts the id, and the status is then applied through the ordinary path
   * so there is one place that decides what a receipt means.
   */
  private async reconcile(organizationId: string, event: InboundStatusEvent): Promise<void> {
    if (!event.recipientId) {
      return;
    }
    const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
    const adopted = await this.messages.reconcileReceipt({
      organizationId,
      channel: 'WHATSAPP',
      destination: event.recipientId,
      providerMessageId: event.providerMessageId,
      since,
    });
    if (!adopted) {
      return;
    }
    await this.messages.applyDeliveryStatus(
      organizationId,
      event.providerMessageId,
      event.status,
      event.error,
    );
    this.logger.info(
      { organizationId, messageId: adopted.id },
      'Reconciled a delivery receipt with a message whose send was interrupted',
    );
  }

  // -------------------------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------------------------

  settings(actor: AuthenticatedUser): Promise<IntegrationConnectionRow | null> {
    return this.connections.findByProvider(actor.organizationId, 'WHATSAPP');
  }

  async saveSettings(
    actor: AuthenticatedUser,
    input: WhatsAppSettingsInput,
  ): Promise<IntegrationConnectionRow> {
    // The verify token is write-only, like the access token and the app secret: no endpoint ever
    // returns it, so a form editing an API version cannot send it back and an unconditional write
    // would erase it. Meta's next subscription handshake would then fail for a change that had
    // nothing to do with it. Omitted means "keep what is stored".
    const existing = await this.connections.findByProvider(actor.organizationId, 'WHATSAPP');
    const storedVerifyToken =
      readWhatsAppConfig((existing?.settings ?? {}) as Record<string, unknown>)?.verifyToken ??
      null;

    const row = await this.connections.upsert(actor.organizationId, 'WHATSAPP', actor.userId, {
      displayName: input.displayPhoneNumber ?? input.phoneNumberId,
      enabled: input.enabled ?? true,
      status: 'CONNECTED',
      externalAccountId: input.businessAccountId,
      settings: {
        businessAccountId: input.businessAccountId,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        verifyToken: input.verifyToken ?? storedVerifyToken ?? null,
        apiVersion: input.apiVersion ?? 'v21.0',
        templateNames: input.templateNames ?? {},
        templateLanguage: input.templateLanguage ?? 'en',
      },
      ...(input.accessToken
        ? { encryptedCredentials: this.cipher.encrypt(input.accessToken) }
        : {}),
      // The app secret signs inbound webhooks, so it lives in the webhook-secret column rather
      // than in `settings`, which is the non-secret blob.
      ...(input.appSecret ? { webhookSecretEncrypted: this.cipher.encrypt(input.appSecret) } : {}),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.WHATSAPP_SETTINGS_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      // Ids only. Neither the access token nor the app secret is recorded.
      after: {
        businessAccountId: input.businessAccountId,
        phoneNumberId: input.phoneNumberId,
      },
    });

    return row;
  }

  testConnection(actor: AuthenticatedUser): Promise<ConnectionTestResult> {
    return this.sender.verify(actor.organizationId, 'WHATSAPP');
  }

  history(
    actor: AuthenticatedUser,
    query: { limit?: number; cursor?: string },
  ): Promise<{ items: OutboundMessageRow[]; nextCursor: string | null; total: number }> {
    return this.messages.history({
      organizationId: actor.organizationId,
      channel: 'WHATSAPP',
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------------------------

  /**
   * Meta's subscription handshake: it GETs the URL with a challenge and the verify token.
   *
   * The token is compared in constant time against the one stored for the tenant that owns this
   * business account. An unknown account is refused rather than echoed back — otherwise the
   * endpoint would confirm any challenge to anybody.
   */
  async verifySubscription(
    businessAccountId: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string | null> {
    if (!businessAccountId || !token || !challenge) {
      return null;
    }
    // Every candidate is tried, and the comparison stays constant-time within each. The token is
    // what proves which tenant this handshake belongs to; a tenant that has entered someone
    // else's business account id does not hold their token and so cannot answer for them.
    for (const connection of await this.connectionsForAccount(businessAccountId)) {
      const settings = readWhatsAppConfig((connection.settings ?? {}) as Record<string, unknown>);
      if (settings?.verifyToken && safeEqual(token, settings.verifyToken)) {
        return challenge;
      }
    }
    return null;
  }

  /**
   * Handles one inbound webhook, in a fixed order the security depends on:
   *
   *   1. parse the payload defensively and read the business account id it *claims*;
   *   2. look that id up among the stored connections — this, and only this, decides the tenant,
   *      because a webhook carries no session;
   *   3. verify the signature over the raw bytes against that tenant's own app secret;
   *   4. record the event, whose unique index rejects a redelivery;
   *   5. only then act on it.
   *
   * Nothing before step 3 writes a row. An anonymous caller who invents a business account id
   * gets `rejected` at step 2 with no trace, and one who names a real id but cannot sign gets
   * `rejected` at step 3 — so neither can create tenant records.
   */
  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    body: unknown,
  ): Promise<WebhookOutcome> {
    const parsed = parseWhatsAppWebhook(body);
    if (!parsed.businessAccountId) {
      return { status: 'rejected', reason: 'unrecognised payload' };
    }

    const candidates = await this.connectionsForAccount(parsed.businessAccountId);
    if (candidates.length === 0) {
      // No connection means no tenant to attribute this to. Nothing is written: an unauthenticated
      // caller must not be able to create rows by guessing at ids.
      return { status: 'rejected', reason: 'unknown business account' };
    }

    // The signature picks the tenant. Two connections can name the same business account id, and
    // only the one holding Meta's app secret for it can produce a matching HMAC.
    let connection: IntegrationConnectionRow | null = null;
    for (const candidate of candidates) {
      const appSecret = candidate.webhookSecretEncrypted
        ? this.cipher.decrypt(candidate.webhookSecretEncrypted)
        : null;
      if (appSecret && verifyHmacSha256(rawBody, signature, appSecret)) {
        connection = candidate;
        break;
      }
    }

    if (!connection) {
      this.logger.warn(
        { businessAccountId: parsed.businessAccountId, candidates: candidates.length },
        'Rejected a WhatsApp webhook with a bad or missing signature',
      );
      return { status: 'rejected', reason: 'signature' };
    }

    const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
    const event = await this.integrations.recordEventFor(connection, {
      externalEventId: `digest-${payloadDigest}`,
      eventType: 'whatsapp.webhook',
      signatureVerified: true,
      payloadDigest,
    });
    if (!event) {
      // The unique index caught a redelivery. Answering 200 stops Meta retrying.
      return { status: 'duplicate' };
    }

    await this.applyEvents(connection.organizationId, parsed.events);
    return { status: 'accepted', events: parsed.events.length };
  }

  /** Applies delivery receipts. Inbound messages are recorded but not yet routed to a ticket. */
  private async applyEvents(organizationId: string, events: WhatsAppEvent[]): Promise<void> {
    for (const event of events) {
      if (event.kind !== 'status') {
        this.logger.debug({ organizationId }, 'Inbound WhatsApp message received');
        continue;
      }
      try {
        const matched = await this.messages.applyDeliveryStatus(
          organizationId,
          event.providerMessageId,
          event.status,
          event.error,
        );
        if (matched === 0) {
          await this.reconcile(organizationId, event);
        }
      } catch (error) {
        // One malformed receipt must not throw away the rest of the batch.
        this.logger.warn({ message: redactMessage(error) }, 'Could not apply a delivery status');
      }
    }
  }

  // -------------------------------------------------------------------------------------------

  /**
   * The connections claiming a business account id.
   *
   * Deliberately not scoped to a tenant: this *is* the tenant lookup, and it is the reason a
   * webhook can be attributed at all. It returns every candidate rather than one, because
   * `external_account_id` has no unique constraint and nothing stops a second tenant typing a
   * business account id that is not theirs. Choosing arbitrarily between them would let anyone
   * with `integration:manage` take over — or simply break — another tenant's deliveries. The
   * caller settles it with the secret.
   *
   * A disabled connection is excluded: pausing an integration has to stop inbound traffic too,
   * the same way `credentialFor` and `channelConfigFor` treat it.
   */
  private async connectionsForAccount(
    businessAccountId: string,
  ): Promise<IntegrationConnectionRow[]> {
    const rows = await this.connections.findAllByExternalAccount('WHATSAPP', businessAccountId);
    return rows.filter((row) => row.enabled);
  }

  /** Sends one template to the caller's own number, so a mapping can be checked end to end. */
  async sendTest(
    actor: AuthenticatedUser,
    template: MessageTemplate,
    toPhone: string,
  ): Promise<{ queued: boolean; message: string }> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: { name: true },
    });
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { name: true },
    });
    if (!organization || !user) {
      throw new BadRequestException('Your account could not be read');
    }

    const request = {
      organizationId: actor.organizationId,
      channel: 'WHATSAPP' as const,
      template,
      destination: toPhone,
      recipientUserId: actor.userId,
      recipientName: user.name,
      organizationName: organization.name,
      title: 'Test message from Ashniva Desk',
      link: '/settings/whatsapp',
      idempotencyKey: testIdempotencyKey(toPhone, new Date()),
    };

    const outcome = await this.sender.queue(request);
    if (outcome.status === 'unconfigured') {
      throw new BadRequestException('Save your WhatsApp settings before sending a test');
    }
    if (outcome.status === 'duplicate') {
      return { queued: false, message: 'A test to this number is already on its way' };
    }

    await this.queue.enqueueSend({ messageId: outcome.messageId, request });
    await this.auditLog.record({
      action: AUDIT_ACTION.WHATSAPP_TEST_SENT,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: outcome.messageId,
      organizationId: actor.organizationId,
    });

    return { queued: true, message: 'Sending a test message' };
  }
}
