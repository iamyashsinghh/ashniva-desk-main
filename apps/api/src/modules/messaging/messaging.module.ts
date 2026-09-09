import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { MessageResendService } from './message-resend.service';
import { MessageSenderService } from './message-sender.service';
import {
  EmailNotificationChannel,
  WhatsAppNotificationChannel,
} from './messaging-notification.channel';
import { MessagingProcessor } from './messaging.processor';
import { MessagingQueue } from './messaging.queue';
import { MessagingRepository } from './messaging.repository';
import { CloudWhatsAppProvider } from './providers/cloud-whatsapp.provider';
import { MockEmailProvider } from './providers/mock-email.provider';
import { MockWhatsAppProvider } from './providers/mock-whatsapp.provider';
import { MESSAGE_PROVIDERS, type MessageProvider } from './providers/message-provider.interface';
import { SafeSmtpTransportFactory } from './providers/safe-smtp';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhooksController } from './whatsapp-webhooks.controller';

/**
 * Outbound email and WhatsApp.
 *
 * `MESSAGING_PROVIDER=mock` swaps the real providers for in-memory ones that reach nothing, for
 * the automated tests and the local preview. Any other value uses the real ones, so a
 * deployment cannot end up on the mock by forgetting to set the variable.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.MESSAGING }), IntegrationsModule],
  controllers: [EmailController, WhatsAppController, WhatsAppWebhooksController],
  providers: [
    MessagingRepository,
    MessagingQueue,
    MessageSenderService,
    MessageResendService,
    MessagingProcessor,
    EmailService,
    WhatsAppService,
    EmailNotificationChannel,
    WhatsAppNotificationChannel,
    SafeSmtpTransportFactory,
    SmtpEmailProvider,
    CloudWhatsAppProvider,
    MockEmailProvider,
    MockWhatsAppProvider,
    {
      provide: MESSAGE_PROVIDERS,
      inject: [
        AppConfigService,
        SmtpEmailProvider,
        CloudWhatsAppProvider,
        MockEmailProvider,
        MockWhatsAppProvider,
      ],
      useFactory: (
        config: AppConfigService,
        smtp: SmtpEmailProvider,
        cloud: CloudWhatsAppProvider,
        mockEmail: MockEmailProvider,
        mockWhatsApp: MockWhatsAppProvider,
      ): MessageProvider[] =>
        config.messaging.useMockProviders ? [mockEmail, mockWhatsApp] : [smtp, cloud],
    },
  ],
  exports: [
    MessageSenderService,
    MessagingQueue,
    EmailNotificationChannel,
    WhatsAppNotificationChannel,
    MockEmailProvider,
    MockWhatsAppProvider,
  ],
})
export class MessagingModule {}
