import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { CallbackEndpointsRepository } from './callback-endpoints.repository';
import { CallbackEndpointsService } from './callback-endpoints.service';
import { CallbackEmitterService } from './callback-emitter.service';
import { CallbackRedeliveryService } from './callback-redelivery.service';
import { CallbackSenderService } from './callback-sender.service';
import {
  CALLBACK_TRANSPORT,
  HttpCallbackTransport,
  MockCallbackTransport,
  type CallbackTransport,
} from './callback-transport';
import { ExternalTicketStatusReader } from './external-ticket-status.reader';
import { SupportCallbacksController } from './support-callbacks.controller';
import { SupportCallbacksProcessor } from './support-callbacks.processor';
import { SupportCallbacksQueue } from './support-callbacks.queue';
import { SupportCallbacksRepository } from './support-callbacks.repository';

/**
 * Outbound status callbacks.
 *
 * Imports nothing from tickets or products, and is imported by both: the emitter takes ids and
 * reads what it needs itself, so the module that owns a ticket can tell this one that something
 * happened without either of them knowing about the other's services.
 *
 * `SUPPORT_CALLBACK_TRANSPORT=mock` swaps the real transport for one that reaches nothing, for the
 * automated tests and the local preview — the same mock/real `useFactory` switch, and the same
 * reasoning, as `messaging.module.ts`. Any other value uses the real one, so a deployment cannot
 * end up on the mock by forgetting to set the variable.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SUPPORT_CALLBACKS })],
  controllers: [SupportCallbacksController],
  providers: [
    SupportCallbacksRepository,
    CallbackEndpointsRepository,
    ExternalTicketStatusReader,
    SupportCallbacksQueue,
    CallbackSenderService,
    CallbackEmitterService,
    CallbackEndpointsService,
    CallbackRedeliveryService,
    SupportCallbacksProcessor,
    HttpCallbackTransport,
    MockCallbackTransport,
    {
      provide: CALLBACK_TRANSPORT,
      inject: [AppConfigService, HttpCallbackTransport, MockCallbackTransport],
      useFactory: (
        config: AppConfigService,
        http: HttpCallbackTransport,
        mock: MockCallbackTransport,
      ): CallbackTransport => (config.supportCallbacks.useMockTransport ? mock : http),
    },
  ],
  exports: [CallbackEmitterService, ExternalTicketStatusReader, MockCallbackTransport],
})
export class SupportCallbacksModule {}
