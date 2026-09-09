import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { NotificationsModule } from '../notifications/notifications.module';

import { BillingNotificationsService } from './billing-notifications.service';
import { BillingProcessor } from './billing.processor';
import { BillingProfileService } from './billing-profile.service';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { ClientBillingController } from './client-billing.controller';
import { ClientBillingProfileService } from './client-billing-profile.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { PortalBillingController } from './portal-billing.controller';

/**
 * Billing and invoicing: the billing profile, invoices and their GST breakdown, payments and
 * their allocation, the PDF, and the client-portal view.
 *
 * Money is `Decimal` throughout — never a JavaScript number — and every figure on an invoice is
 * computed by the API from the line items rather than accepted from a caller.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.BILLING }), NotificationsModule],
  controllers: [BillingController, ClientBillingController, PortalBillingController],
  providers: [
    BillingRepository,
    BillingProfileService,
    ClientBillingProfileService,
    InvoicesService,
    InvoiceLifecycleService,
    PaymentsService,
    InvoicePdfService,
    BillingNotificationsService,
    BillingProcessor,
  ],
  exports: [BillingRepository, InvoicesService, InvoiceLifecycleService],
})
export class BillingModule {}
