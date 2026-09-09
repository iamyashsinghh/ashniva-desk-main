import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  canTransitionInvoice,
  type AuthenticatedUser,
  type InvoiceStatus,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import { BillingRepository, type InvoiceDetailRow } from './billing.repository';
import { invoiceNumberLabel, nextNumberFor } from './invoice-numbering';
import { buildInvoiceSnapshot } from './invoice-snapshot';
import { InvoicesService } from './invoices.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * What happens to an invoice after it is drafted: issuing, withdrawing, chasing.
 *
 * Separate from `InvoicesService` because these are the operations with consequences outside the
 * system — a number an auditor will look for, a document a client has already received — and they
 * deserve to be read without the drafting logic in the way.
 */
@Injectable()
export class InvoiceLifecycleService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly repository: BillingRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Issues the invoice: assigns its number, freezes a snapshot and closes it to editing.
   *
   * The number is taken inside the same transaction that writes it, with the profile row locked,
   * so two people clicking Issue at the same moment cannot be handed the same number. A unique
   * index on (organization, numberLabel) is the backstop if that reasoning is ever wrong.
   */
  async issue(actor: AuthenticatedUser, id: string): Promise<InvoiceDetailRow> {
    const current = await this.invoices.detail(actor, id);
    if (current.status !== 'DRAFT') {
      throw new ConflictException(`An invoice that is ${current.status} has already been issued`);
    }
    if (current.lineItems.length === 0) {
      throw new ConflictException('An invoice needs at least one line before it is issued');
    }
    // A zero-total invoice would be issued into a dead end: `openInvoicesFor` requires a balance
    // above zero, so no payment can ever be applied, the overdue sweep skips it, and reminders
    // throw — it would sit in the client's portal as outstanding forever with nothing owed.
    if (current.total.lessThanOrEqualTo(0)) {
      throw new ConflictException('An invoice with nothing to pay cannot be issued');
    }

    const snapshot = await buildInvoiceSnapshot(
      this.prisma,
      this.repository,
      actor.organizationId,
      current,
    );

    await this.prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE. Any other transaction reaching this line waits, so the sequence
      // is read and advanced by one issuer at a time.
      const locked = await tx.$queryRaw<
        { next_sequence: number; sequence_year: string; invoice_prefix: string }[]
      >`
        SELECT next_sequence, sequence_year, invoice_prefix
        FROM billing_profiles
        WHERE organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;
      const profile = locked[0];
      if (!profile) {
        throw new BadRequestException('Set up your billing profile before issuing an invoice');
      }

      // The year in the label comes back from `nextNumberFor`, not from the invoice: a back-dated
      // draft continues the current series rather than rewinding the counter into a closed year.
      // That year is authoritative for the invoice row too — see the write below.
      const { sequence, financialYear } = nextNumberFor(
        { nextSequence: profile.next_sequence, sequenceYear: profile.sequence_year },
        current.financialYear,
      );
      const numberLabel = invoiceNumberLabel(profile.invoice_prefix, financialYear, sequence);

      await tx.billingProfile.update({
        where: { organizationId: actor.organizationId },
        data: { nextSequence: sequence + 1, sequenceYear: financialYear },
      });

      // Conditional on the status, not just the id. The DRAFT check above runs before the
      // transaction opens, so two people clicking Issue at the same moment both reach here; the
      // profile lock makes them queue rather than collide, and each would otherwise take a
      // number and overwrite the other's. Matching on DRAFT means the second one matches nothing,
      // and the throw rolls back its sequence increment — so the number it took is not spent.
      const claimed = await tx.invoice.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          number: sequence,
          numberLabel,
          // Written here, from the same value the label was built from.
          //
          // The column was set at create time from the draft's issue date and never revisited, so
          // a back-dated draft ended up numbered in one year and filed under another: label
          // "INV/2026-27/0042" against `financial_year` "2025-26". `nextNumberFor` picking the
          // current series is deliberate — restarting on any mismatch bricks the sequence — but
          // the row has to say the year the number was actually taken from, because that is the
          // series an auditor reconciles against and the field reports group by.
          financialYear,
          status: 'ISSUED',
          issuedById: actor.userId,
          issuedAt: new Date(),
          snapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This invoice was issued a moment ago by someone else');
      }

      await tx.invoiceHistory.create({
        data: {
          invoiceId: id,
          fromStatus: 'DRAFT',
          toStatus: 'ISSUED',
          note: `Issued as ${numberLabel}`,
          changedById: actor.userId,
          documentSnapshot: snapshot as Prisma.InputJsonValue,
        },
      });
    });

    const issued = await this.invoices.detail(actor, id);
    await this.auditLog.record({
      action: AUDIT_ACTION.INVOICE_ISSUED,
      entityType: AUDIT_ENTITY_TYPE.INVOICE,
      entityId: id,
      organizationId: actor.organizationId,
      after: { numberLabel: issued.numberLabel, total: issued.total.toFixed(2) },
    });
    return issued;
  }

  /** Withdraws an invoice. Cancel is for one nobody relied on; void keeps the number in use. */
  async close(
    actor: AuthenticatedUser,
    id: string,
    action: 'cancel' | 'void',
    reason: string,
  ): Promise<InvoiceDetailRow> {
    const current = await this.invoices.detail(actor, id);
    const target: InvoiceStatus = action === 'cancel' ? 'CANCELLED' : 'VOID';

    if (!canTransitionInvoice(current.status as InvoiceStatus, target)) {
      throw new ConflictException(`An invoice that is ${current.status} cannot be ${action}led`);
    }
    if (!reason.trim()) {
      throw new BadRequestException('A reason is required');
    }

    const snapshot = await buildInvoiceSnapshot(
      this.prisma,
      this.repository,
      actor.organizationId,
      current,
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the status the transition was checked against, for the same reason issuing
      // is: `canTransitionInvoice` ran on a row read before the transaction. A cancel racing an
      // issue would otherwise land an invoice that has a number, a PDF and a notified client in
      // CANCELLED — the state reserved for one nobody relied on.
      const claimed = await tx.invoice.updateMany({
        where: { id, status: current.status as InvoiceStatus },
        data:
          action === 'cancel'
            ? {
                status: target,
                cancelledById: actor.userId,
                cancelledAt: now,
                cancelReason: reason,
              }
            : { status: target, voidedById: actor.userId, voidedAt: now, voidReason: reason },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          `This invoice changed while you were working on it and can no longer be ${action}led`,
        );
      }

      await tx.invoiceHistory.create({
        data: {
          invoiceId: id,
          fromStatus: current.status,
          toStatus: target,
          note: reason,
          changedById: actor.userId,
          // The document as it stood is kept, so what the client was sent stays readable.
          documentSnapshot: snapshot as Prisma.InputJsonValue,
          pdfFileId: current.pdfFileId,
        },
      });

      // Cancelling hides the invoice from the portal, so its PDF must stop being downloadable
      // too: both the row-level-security branch and `clientMayRead` match a client to a file
      // through `invoices.pdf_file_id`, and clearing it closes the door the portal's own 404 does
      // not. The document itself is kept — the history row above still points at it, provider-side.
      //
      // Voiding is the opposite case and must not do this. A void invoice stays client-visible by
      // design (`CLIENT_VISIBLE_INVOICE_STATUSES`) precisely because the client relied on it; the
      // number stays used and they keep the document. Unlinking it here took the PDF away from a
      // client who is still shown the invoice.
      if (action === 'cancel') {
        await tx.invoice.update({ where: { id }, data: { pdfFileId: null } });
      }
    });

    await this.auditLog.record({
      action: action === 'cancel' ? AUDIT_ACTION.INVOICE_CANCELLED : AUDIT_ACTION.INVOICE_VOIDED,
      entityType: AUDIT_ENTITY_TYPE.INVOICE,
      entityId: id,
      organizationId: actor.organizationId,
      before: { status: current.status },
      after: { status: target, reason },
    });

    return this.invoices.detail(actor, id);
  }

  /** Records that a reminder was sent, so the list can show who has been chased. */
  async markReminded(actor: AuthenticatedUser, id: string): Promise<InvoiceDetailRow> {
    const current = await this.invoices.detail(actor, id);
    if (current.balanceDue.lessThanOrEqualTo(0)) {
      throw new ConflictException('This invoice has nothing outstanding');
    }
    await this.repository.update(id, { lastReminderAt: new Date() });
    return this.invoices.detail(actor, id);
  }
}
