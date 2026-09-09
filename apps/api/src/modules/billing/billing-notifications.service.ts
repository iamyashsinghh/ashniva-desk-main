import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, PERMISSIONS } from '@ashniva/types';

import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import type { InvoiceDetailRow } from './billing.repository';

/**
 * Billing events, routed through the existing notification system.
 *
 * Nothing about preferences, quiet hours, de-duplication, rate limiting or retries is repeated
 * here — the dispatcher owns all of that, and email and WhatsApp follow from it. This service
 * only decides who should hear about what, and what the message says.
 *
 * Amounts appear in the title because a notification about an invoice without its value is
 * useless; nothing internal — margin, cost, internal notes — is ever included.
 */
@Injectable()
export class BillingNotificationsService {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /** The client is told a bill has been raised. */
  async invoiceIssued(invoice: InvoiceDetailRow, actorUserId: string): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONTRACT_RENEWAL,
      title: `Invoice ${invoice.numberLabel} for ${money(invoice)}`,
      body: `Due ${day(invoice.dueDate)}.`,
      link: `/portal/invoices/${invoice.id}`,
      entityType: 'invoice',
      entityId: invoice.id,
      // An invoice is issued once; the key needs no occurrence.
      dedupeKey: `invoice-issued:${invoice.id}`,
      recipients: await this.clientRecipients(invoice),
      excludeUserId: actorUserId,
    });
  }

  /** The provider's billing people are told money arrived. */
  async paymentRecorded(
    invoice: InvoiceDetailRow,
    reference: string,
    amount: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONTRACT_RENEWAL,
      title: `Payment ${amount} against ${invoice.numberLabel}`,
      body: `Reference ${reference}. Balance ${invoice.balanceDue.toFixed(2)}.`,
      link: `/invoices/${invoice.id}`,
      entityType: 'invoice',
      entityId: invoice.id,
      // One key per payment, so two payments on one invoice both notify.
      dedupeKey: `payment-recorded:${invoice.id}:${reference}`,
      recipients: await this.recipients.withPermission(
        invoice.organizationId,
        PERMISSIONS.PAYMENT_READ,
      ),
      excludeUserId: actorUserId,
    });
  }

  async invoicePaid(invoice: InvoiceDetailRow, actorUserId: string): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONTRACT_RENEWAL,
      title: `${invoice.numberLabel} is settled`,
      body: `${money(invoice)} received in full.`,
      link: `/invoices/${invoice.id}`,
      entityType: 'invoice',
      entityId: invoice.id,
      dedupeKey: `invoice-paid:${invoice.id}`,
      recipients: await this.recipients.withPermission(
        invoice.organizationId,
        PERMISSIONS.INVOICE_READ,
      ),
      excludeUserId: actorUserId,
    });
  }

  /** A reminder before the due date. Keyed on the date so it can repeat on later runs. */
  async paymentDueSoon(invoice: InvoiceDetailRow, on: Date): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONTRACT_EXPIRY,
      title: `Invoice ${invoice.numberLabel} is due ${day(invoice.dueDate)}`,
      body: `${invoice.balanceDue.toFixed(2)} outstanding.`,
      link: `/portal/invoices/${invoice.id}`,
      entityType: 'invoice',
      entityId: invoice.id,
      dedupeKey: `invoice-due-soon:${invoice.id}:${day(on)}`,
      recipients: await this.clientRecipients(invoice),
    });
  }

  async invoiceOverdue(invoice: InvoiceDetailRow, on: Date): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONTRACT_EXPIRY,
      title: `Invoice ${invoice.numberLabel} is overdue`,
      body: `${invoice.balanceDue.toFixed(2)} was due on ${day(invoice.dueDate)}.`,
      link: `/portal/invoices/${invoice.id}`,
      entityType: 'invoice',
      entityId: invoice.id,
      // Dated, so a long-unpaid invoice is chased again rather than silenced forever.
      dedupeKey: `invoice-overdue:${invoice.id}:${day(on)}`,
      recipients: await this.clientRecipients(invoice),
    });
  }

  async invoiceCancelled(
    invoice: InvoiceDetailRow,
    reason: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.CONTRACT_RENEWAL,
      title: `Invoice ${invoice.numberLabel} has been withdrawn`,
      body: reason,
      link: `/portal/invoices/${invoice.id}`,
      entityType: 'invoice',
      entityId: invoice.id,
      dedupeKey: `invoice-cancelled:${invoice.id}`,
      // Only told if they were ever sent it; a cancelled draft reaches nobody.
      recipients:
        invoice.status === 'CANCELLED' && invoice.issuedAt === null
          ? []
          : await this.clientRecipients(invoice),
      excludeUserId: actorUserId,
    });
  }

  /**
   * Who at the client should hear about an invoice.
   *
   * Scoped to the client organization and to people who can act on it, so a client employee with
   * no billing role is not told about money.
   */
  private clientRecipients(invoice: InvoiceDetailRow) {
    return this.recipients.withPermission(invoice.clientOrganizationId, PERMISSIONS.CONTRACT_READ);
  }
}

function money(invoice: InvoiceDetailRow): string {
  return `${invoice.currency} ${invoice.total.toFixed(2)}`;
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
