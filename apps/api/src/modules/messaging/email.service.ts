import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ConnectionTestResult,
  type EmailEncryption,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { testIdempotencyKey } from './idempotency';
import { MessageSenderService } from './message-sender.service';
import { MessagingQueue } from './messaging.queue';
import { MessagingRepository } from './messaging.repository';
import type { IntegrationConnectionRow } from '../integrations/integrations.repository';
import type { OutboundMessageRow } from './messaging.repository';

export interface EmailSettingsInput {
  senderName: string;
  senderEmail: string;
  replyTo?: string | null;
  host: string;
  port: number;
  encryption: EmailEncryption;
  username?: string | null;
  /** Omitted on an edit that is not changing it; the stored one is kept. */
  password?: string;
  enabled?: boolean;
}

/**
 * The email channel's own concerns: its settings shape and its test message.
 *
 * Everything else — queueing, idempotency, rendering, retries — is `MessageSenderService`,
 * shared with WhatsApp.
 */
@Injectable()
export class EmailService {
  constructor(
    private readonly connections: IntegrationsRepository,
    private readonly messages: MessagingRepository,
    private readonly sender: MessageSenderService,
    private readonly queue: MessagingQueue,
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly auditLog: AuditLogService,
  ) {}

  settings(actor: AuthenticatedUser): Promise<IntegrationConnectionRow | null> {
    return this.connections.findByProvider(actor.organizationId, 'EMAIL');
  }

  /**
   * Saves the settings.
   *
   * The password is written only when one was supplied, so saving the form after changing the
   * port does not wipe a credential the administrator cannot see and would have to retype.
   */
  async saveSettings(
    actor: AuthenticatedUser,
    input: EmailSettingsInput,
  ): Promise<IntegrationConnectionRow> {
    const row = await this.connections.upsert(actor.organizationId, 'EMAIL', actor.userId, {
      displayName: `${input.host}:${input.port}`,
      enabled: input.enabled ?? true,
      status: 'CONNECTED',
      settings: {
        senderName: input.senderName,
        senderEmail: input.senderEmail,
        replyTo: input.replyTo ?? null,
        host: input.host,
        port: input.port,
        encryption: input.encryption,
        username: input.username ?? null,
      },
      // Written only when one was supplied; otherwise the stored ciphertext is left alone.
      ...(input.password ? { encryptedCredentials: this.cipher.encrypt(input.password) } : {}),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.EMAIL_SETTINGS_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      // Host and sender only. The password is not recorded even as "changed to ***".
      after: { host: input.host, port: input.port, senderEmail: input.senderEmail },
    });

    return row;
  }

  /** Opens a connection to the configured server and closes it. Sends nothing. */
  testConnection(actor: AuthenticatedUser): Promise<ConnectionTestResult> {
    return this.sender.verify(actor.organizationId, 'EMAIL');
  }

  /**
   * Sends one real message, to the person who asked for it.
   *
   * Deliberately not to an address of their choosing: a settings screen that will email anyone
   * on request is an open relay for anybody who can reach it.
   */
  async sendTest(actor: AuthenticatedUser): Promise<{ queued: boolean; message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { name: true, email: true },
    });
    const organization = await this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: { name: true },
    });
    if (!user?.email || !organization) {
      throw new BadRequestException('Your account has no email address');
    }

    const request = {
      organizationId: actor.organizationId,
      channel: 'EMAIL' as const,
      template: 'TEST' as const,
      destination: user.email,
      recipientUserId: actor.userId,
      recipientName: user.name,
      organizationName: organization.name,
      title: 'Your email settings are working',
      body: 'This test was sent from the email settings screen. Nobody else received it.',
      link: '/settings/email',
      // A fresh key each time, so the button can be pressed twice.
      idempotencyKey: testIdempotencyKey(user.email, new Date()),
    };

    const outcome = await this.sender.queue(request);
    if (outcome.status === 'unconfigured') {
      throw new BadRequestException('Save your email settings before sending a test');
    }
    if (outcome.status === 'duplicate') {
      return { queued: false, message: 'A test to this address is already on its way' };
    }

    await this.queue.enqueueSend({ messageId: outcome.messageId, request });
    await this.auditLog.record({
      action: AUDIT_ACTION.EMAIL_TEST_SENT,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: outcome.messageId,
      organizationId: actor.organizationId,
    });

    return { queued: true, message: `Sending a test to your own address` };
  }

  history(
    actor: AuthenticatedUser,
    query: { limit?: number; cursor?: string },
  ): Promise<{ items: OutboundMessageRow[]; nextCursor: string | null; total: number }> {
    return this.messages.history({
      organizationId: actor.organizationId,
      channel: 'EMAIL',
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
  }
}
