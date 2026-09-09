import { Injectable } from '@nestjs/common';
import { templateForNotification } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../database/prisma.service';
import { MessageSenderService } from './message-sender.service';
import { MessagingQueue } from './messaging.queue';
import type {
  NotificationChannel,
  NotificationMessage,
} from '../notifications/channels/notification-channel.interface';
import type { MessageChannel } from './messaging.repository';

/**
 * Bridges the notification dispatcher to the message sender.
 *
 * The dispatcher has already decided this notification should go out on this channel: it has
 * applied the recipient's preferences, de-duplication, grouping, quiet hours and the rate limit.
 * What is left here is finding the address, choosing a template and queueing the send.
 */
abstract class MessagingChannel implements NotificationChannel {
  abstract readonly key: MessageChannel;

  constructor(
    protected readonly sender: MessageSenderService,
    protected readonly queue: MessagingQueue,
    protected readonly prisma: PrismaService,
    protected readonly logger: PinoLogger,
  ) {}

  /**
   * Configuration is per tenant, and the dispatcher's interface has no organization to pass, so
   * this answers for the deployment as a whole. The real per-tenant check happens in `send`,
   * where the organization is known.
   */
  isConfigured(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<void> {
    const template = templateForNotification(message.type);
    if (!template) {
      // Not every notification type has an outside-the-app equivalent. One without a template
      // stays in-app rather than being sent with some invented wording.
      return;
    }

    const recipient = await this.recipientFor(message.recipientUserId, message.organizationId);
    if (!recipient) {
      return;
    }

    const request = {
      organizationId: message.organizationId,
      channel: this.key,
      template,
      destination: recipient.destination,
      recipientUserId: message.recipientUserId,
      recipientName: recipient.name,
      organizationName: recipient.organizationName,
      title: message.title,
      body: message.body,
      link: message.link,
      entityType: message.type,
      // The notification's own dedupe key already distinguishes repeat events; reusing it keeps
      // the two layers from disagreeing about what counts as the same message.
      occurrence: message.link ?? null,
    };

    const outcome = await this.sender.queue(request);
    if (outcome.status === 'queued') {
      await this.queue.enqueueSend({ messageId: outcome.messageId, request });
    }
  }

  /** The address or number to send to, plus the names the template needs. */
  protected abstract recipientFor(
    userId: string,
    organizationId: string,
  ): Promise<{ destination: string; name: string; organizationName: string } | null>;
}

@Injectable()
export class EmailNotificationChannel extends MessagingChannel {
  readonly key = 'EMAIL' as const;

  constructor(
    sender: MessageSenderService,
    queue: MessagingQueue,
    prisma: PrismaService,
    logger: PinoLogger,
  ) {
    super(sender, queue, prisma, logger);
    this.logger.setContext(EmailNotificationChannel.name);
  }

  protected async recipientFor(userId: string, organizationId: string) {
    const [user, organization] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { name: true, email: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
    ]);
    if (!user?.email || !organization) {
      return null;
    }
    return {
      destination: user.email,
      name: user.name,
      organizationName: organization.name,
    };
  }
}

@Injectable()
export class WhatsAppNotificationChannel extends MessagingChannel {
  readonly key = 'WHATSAPP' as const;

  constructor(
    sender: MessageSenderService,
    queue: MessagingQueue,
    prisma: PrismaService,
    logger: PinoLogger,
  ) {
    super(sender, queue, prisma, logger);
    this.logger.setContext(WhatsAppNotificationChannel.name);
  }

  /**
   * A number is needed, and most users have none. Returning null is the ordinary case, not an
   * error: the dispatcher simply has nothing to send on this channel for that person.
   */
  protected async recipientFor(userId: string, organizationId: string) {
    const [user, organization] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { name: true, phone: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
    ]);
    if (!user?.phone || !organization) {
      return null;
    }
    return { destination: user.phone, name: user.name, organizationName: organization.name };
  }
}
