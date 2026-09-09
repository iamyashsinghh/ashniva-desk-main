import { Inject, Injectable } from '@nestjs/common';
import type { ConnectionTestResult, MessageTemplate } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import type { Prisma } from '../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { redactMessage } from '../integrations/redact';
import { classifyError } from './delivery-failure';
import { messageIdempotencyKey } from './idempotency';
import { renderMessage } from './message-templates';
import { MessagingRepository, type MessageChannel } from './messaging.repository';
import {
  MESSAGE_PROVIDERS,
  type MessageProvider,
  type ResolvedChannelConfig,
} from './providers/message-provider.interface';

/** Attempts before a message is given up on. Matches the queue's `attempts`. */
export const MAX_ATTEMPTS = 4;

export interface SendRequest {
  organizationId: string;
  channel: MessageChannel;
  template: MessageTemplate;
  destination: string;
  recipientUserId?: string | null;
  recipientName: string;
  organizationName: string;
  title: string;
  body?: string | null;
  /** Path into the app, e.g. `/tasks/abc`. Turned into an absolute URL here. */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Distinguishes repeat events about one entity that should each send. */
  occurrence?: string | null;
  /** Set when this send is a resend of an earlier row, for the audit trail. */
  resentFromId?: string;
  /** Supplied by a test send so the same address can be tested twice. */
  idempotencyKey?: string;
}

export type QueueOutcome =
  { status: 'queued'; messageId: string } | { status: 'duplicate' } | { status: 'unconfigured' };

/**
 * Everything both channels do the same way.
 *
 * Queueing, idempotency, rendering, provider selection, error classification and the retry
 * decision live here once. `EmailService` and `WhatsAppService` are thin: they know their own
 * settings shape and their own test message, and nothing else.
 */
@Injectable()
export class MessageSenderService {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly integrations: IntegrationsService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
    @Inject(MESSAGE_PROVIDERS) private readonly providers: MessageProvider[],
  ) {
    this.logger.setContext(MessageSenderService.name);
  }

  /**
   * Records the intent to send, if nobody has already.
   *
   * The row is written before the provider is called, not after, so a crash between the two
   * leaves evidence that the message was owed rather than losing it silently.
   */
  async queue(request: SendRequest): Promise<QueueOutcome> {
    const config = await this.configFor(request.organizationId, request.channel);
    if (!config) {
      return { status: 'unconfigured' };
    }

    const row = await this.repository.claim({
      organizationId: request.organizationId,
      channel: request.channel,
      recipientUserId: request.recipientUserId ?? null,
      destination: request.destination,
      template: request.template,
      subject: null,
      idempotencyKey: request.idempotencyKey ?? keyFor(request),
      // Kept beside the row so a failed message can be sent again. The queue job carries the same
      // fields, but a job is gone once it has run, and the columns alone do not say what the
      // message said.
      payload: request as unknown as Prisma.InputJsonValue,
      ...(request.resentFromId ? { resentFromId: request.resentFromId } : {}),
    });

    // Null means the unique index rejected it: this exact event already has a row for this
    // recipient, so a retried job or a redelivered webhook does not send a second message.
    return row ? { status: 'queued', messageId: row.id } : { status: 'duplicate' };
  }

  /**
   * Sends a queued message.
   *
   * Returns whether the caller should retry rather than throwing, so a permanent failure does
   * not go round the queue three more times on its way to the same answer.
   */
  async deliver(messageId: string, request: SendRequest): Promise<{ retry: boolean }> {
    const config = await this.configFor(request.organizationId, request.channel);
    const provider = this.providerFor(request.channel);

    if (!config || !provider || !provider.isConfigured(config)) {
      await this.repository.markSkipped(
        request.organizationId,
        messageId,
        'This channel is not configured',
      );
      return { retry: false };
    }

    const row = await this.repository.claimForSending(request.organizationId, messageId);
    if (!row) {
      // Already sent, already skipped, or in flight on another worker. Not an error and not worth
      // a retry: the message this job stands for has had its attempt.
      return { retry: false };
    }
    const rendered = renderMessage(request.template, {
      recipientName: request.recipientName,
      organizationName: request.organizationName,
      title: request.title,
      body: request.body ?? null,
      link: this.absoluteLink(request.link),
    });

    try {
      const outcome = await provider.send(config, {
        template: request.template,
        destination: request.destination,
        recipientName: request.recipientName,
        organizationName: request.organizationName,
        title: request.title,
        ...rendered,
      });
      await this.repository.markSent(messageId, outcome.providerMessageId);
      return { retry: false };
    } catch (error) {
      const failure = classifyError(error);
      const message = redactMessage(error);
      const exhausted = row.attempts >= MAX_ATTEMPTS;
      const retry = failure.retryable && !exhausted;

      await this.repository.markFailed(messageId, message, retry);
      this.logger.warn(
        {
          channel: request.channel,
          template: request.template,
          kind: failure.kind,
          attempt: row.attempts,
          message,
        },
        'Outbound message failed',
      );
      return { retry };
    }
  }

  /** Runs the provider's own check against the stored settings. Sends nothing to anyone. */
  async verify(organizationId: string, channel: MessageChannel): Promise<ConnectionTestResult> {
    const config = await this.configFor(organizationId, channel);
    const provider = this.providerFor(channel);
    if (!config || !provider) {
      return { ok: false, message: 'This channel has not been set up yet' };
    }
    try {
      return await provider.verify(config);
    } catch (error) {
      // A provider should return `{ ok: false }`, but an SDK may throw anyway; one badly
      // behaved provider must not turn a settings test into a 500.
      return { ok: false, message: redactMessage(error) };
    }
  }

  /** True when the tenant could send on this channel right now. */
  async isConfigured(organizationId: string, channel: MessageChannel): Promise<boolean> {
    const config = await this.configFor(organizationId, channel);
    const provider = this.providerFor(channel);
    return Boolean(config && provider?.isConfigured(config));
  }

  private async configFor(
    organizationId: string,
    channel: MessageChannel,
  ): Promise<ResolvedChannelConfig | null> {
    // channelConfigFor rather than credentialFor: an SMTP relay may legitimately have no
    // password, and that must not read as "email is not set up".
    const connection = await this.integrations.channelConfigFor(organizationId, channel);
    if (!connection) {
      return null;
    }
    return {
      organizationId,
      settings: connection.settings as Record<string, unknown>,
      secret: connection.secret,
    };
  }

  private providerFor(channel: MessageChannel): MessageProvider | undefined {
    return this.providers.find((provider) => provider.channel === channel);
  }

  /** A relative path is turned into a full URL; anything already absolute is left alone. */
  private absoluteLink(link: string | null | undefined): string | null {
    if (!link) {
      return null;
    }
    return link.startsWith('http') ? link : `${this.config.app.webUrl}${link}`;
  }
}

function keyFor(request: SendRequest): string {
  return messageIdempotencyKey({
    template: request.template,
    recipient: request.destination,
    entityType: request.entityType,
    entityId: request.entityId,
    occurrence: request.occurrence,
  });
}
