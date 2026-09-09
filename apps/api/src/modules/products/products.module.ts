import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { AuthModule } from '../auth/auth.module';
import { SlaEscalationsModule } from '../sla-escalations/sla-escalations.module';
import { SupportCallbacksModule } from '../support-callbacks/support-callbacks.module';
import { IngressAttachmentsService } from './ingress-attachments.service';
import { MachineCredentialGuard } from './machine-credential.guard';
import { ProductCredentialsService } from './product-credentials.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { SupportIngressController } from './support-ingress.controller';
import { SupportIngressService } from './support-ingress.service';
import { SupportWidgetController } from './support-widget.controller';
import { SupportWidgetService } from './support-widget.service';
import { WidgetOriginRegistry } from './widget-origin.registry';
import { WidgetSessionGuard } from './widget-session.guard';
import { WidgetSessionService } from './widget-session.service';

/**
 * The product registry, the external support ingress and the embedded widget.
 *
 * Registers the routing queue rather than importing the routing module: an ingress ticket is
 * placed by posting the same job an ordinary raise posts, so there is one router and one path,
 * and this module stays acyclic with the one that owns it.
 *
 * `SlaEscalationsModule` is here for one reason — a product's support tier now selects an SLA
 * policy, so changing the tier has to reapply the clocks of that tenant's open tickets, exactly as
 * `SlaPoliciesService` does after a policy edit. `SupportCallbacksModule` is here so a raised
 * ticket can be pushed back to the product; it imports nothing from here in return.
 */
@Module({
  imports: [
    AuthModule,
    SlaEscalationsModule,
    SupportCallbacksModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ROUTING_MONITOR }),
  ],
  controllers: [ProductsController, SupportIngressController, SupportWidgetController],
  providers: [
    ProductsRepository,
    ProductsService,
    ProductCredentialsService,
    SupportIngressService,
    IngressAttachmentsService,
    SupportWidgetService,
    WidgetSessionService,
    WidgetOriginRegistry,
    MachineCredentialGuard,
    WidgetSessionGuard,
  ],
  exports: [
    ProductsRepository,
    ProductCredentialsService,
    WidgetSessionService,
    WidgetOriginRegistry,
  ],
})
export class ProductsModule {}
