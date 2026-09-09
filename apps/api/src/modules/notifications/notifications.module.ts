import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { ContractsModule } from '../contracts/contracts.module';
import { MessagingModule } from '../messaging/messaging.module';
import {
  EmailNotificationChannel,
  WhatsAppNotificationChannel,
} from '../messaging/messaging-notification.channel';
import { NOTIFICATION_CHANNELS } from './channels/notification-channel.interface';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationRemindersService } from './notification-reminders.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationRecipientsService } from './recipients.service';

/**
 * In-app notifications: one dispatcher applying preferences, de-duplication, grouping, quiet
 * hours and rate limits; Socket.IO delivery; the notification center and preferences API; the
 * queue jobs for deferred delivery and daily reminders. Email and WhatsApp go out through the
 * messaging module, which decides per tenant whether either is configured at all.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    ContractsModule,
    MessagingModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationRecipientsService,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [EmailNotificationChannel, WhatsAppNotificationChannel],
      useFactory: (email: EmailNotificationChannel, whatsapp: WhatsAppNotificationChannel) => [
        email,
        whatsapp,
      ],
    },
    NotificationDispatcher,
    NotificationsService,
    NotificationRemindersService,
    NotificationsProcessor,
  ],
  exports: [NotificationDispatcher, NotificationRecipientsService],
})
export class NotificationsModule {}
