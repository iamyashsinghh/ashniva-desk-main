import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type InvoiceStatus,
  type PaymentMethod,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import { BillingNotificationsService } from './billing-notifications.service';
import { BillingRepository, type PaymentRow } from './billing.repository';
import { parseScaled, toMoney, type Money } from './money';
import { autoAllocate, planAllocation, type AllocationRequest } from './payment-allocation';
import { applyPaymentToInvoice } from './payment-apply';

/** Every money column in the payments tables is numeric(14,2). */
const MONEY_SCALE = 2;

export interface RecordPaymentInput {
  clientOrganizationId: string;
  reference: string;
  method: PaymentMethod;
  paidAt: string;
  amount: string;
  notes?: string;
  internalNotes?: string;
  /** Leave out to spread the payment across open invoices, oldest first. */
  allocations?: { invoiceId: string; amount: string }[];
  /** Record the money without applying it to anything yet. */
  leaveUnallocated?: boolean;
}

/**
 * Money received, and what it settles.
 *
 * Two protections matter here and both are enforced by the database rather than by a check the
 * code could skip: the reference is unique per organization, so the same bank transfer cannot be
 * entered twice by two people reading the same statement; and every balance change happens
 * inside one transaction, so a payment can never be half-applied.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: BillingNotificationsService,
  ) {}

  list(
    actor: AuthenticatedUser,
    query: { clientOrganizationId?: string; limit?: number; cursor?: string },
  ) {
    return this.repository.listPayments({
      organizationId: actor.organizationId,
      clientOrganizationId: query.clientOrganizationId,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<PaymentRow> {
    const row = await this.repository.findPayment(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Payment not found');
    }
    return row;
  }

  /**
   * Records a payment and applies it.
   *
   * The whole thing is one transaction: the payment row, the allocations and every invoice
   * balance move together or not at all. A partial apply would leave the ledger disagreeing with
   * the invoices, which is the one state that is genuinely hard to unpick later.
   */
  async record(actor: AuthenticatedUser, input: RecordPaymentInput): Promise<PaymentRow> {
    // `payments.amount` is numeric(14,2): a figure with more precision would be banked rounded,
    // a paisa away from what was recorded, and after the over-payment check had used the other one.
    const amount = parseScaled(input.amount, MONEY_SCALE, 'A payment amount');
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('A payment must be greater than zero');
    }
    const reference = input.reference.trim();
    if (!reference) {
      throw new BadRequestException('A payment reference is required');
    }
    // The same check `InvoicesService.create` makes. Without it a payment could be recorded
    // against the provider's own organization, a soft-deleted one, or any uuid at all: nothing
    // else validates the target, `openInvoicesFor` simply returns nothing for it, and the row
    // then sits in the ledger forever with no invoice it could ever be applied to.
    await this.assertClient(actor.organizationId, input.clientOrganizationId);
    // A payment cannot arrive before it is sent.
    const paidAt = new Date(input.paidAt);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (paidAt > tomorrow) {
      throw new BadRequestException('A payment cannot be dated in the future');
    }

    const duplicate = await this.prisma.payment.findFirst({
      where: { organizationId: actor.organizationId, reference },
      select: { id: true, paidAt: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Reference "${reference}" was already recorded on ` +
          `${duplicate.paidAt.toISOString().slice(0, 10)}`,
      );
    }

    // The currency the payment is recorded in. Taken from the billing profile rather than left to
    // the column default, because the allocator now compares it against the invoice's and a
    // default standing in for a real value would make that comparison meaningless.
    const profile = await this.repository.findProfile(actor.organizationId);
    const currency = profile?.currency ?? 'INR';

    const openInvoices = await this.repository.openInvoicesFor(
      actor.organizationId,
      input.clientOrganizationId,
    );
    const allocatable = openInvoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status as InvoiceStatus,
      balanceDue: invoice.balanceDue,
      currency: invoice.currency,
    }));
    const dueDates = new Map(openInvoices.map((invoice) => [invoice.id, invoice.dueDate]));

    const requests: AllocationRequest[] = input.leaveUnallocated
      ? []
      : (input.allocations?.map((entry) => ({
          invoiceId: entry.invoiceId,
          amount: parseScaled(entry.amount, MONEY_SCALE, 'An allocation amount'),
        })) ?? autoAllocate(amount, allocatable));

    const plan = planAllocation(
      amount,
      toMoney(0),
      requests,
      allocatable,
      new Date(),
      dueDates,
      currency,
    );
    if (!plan.ok) {
      throw plan.reason === 'unknown-invoice'
        ? new NotFoundException(plan.message)
        : new BadRequestException(plan.message);
    }

    const settled = new Map<string, InvoiceStatus>();
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          organizationId: actor.organizationId,
          clientOrganizationId: input.clientOrganizationId,
          reference,
          method: input.method,
          paidAt,
          amount,
          currency,
          unallocatedAmount: plan.unallocated,
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          recordedById: actor.userId,
        },
      });

      for (const entry of inLockOrder(plan.entries)) {
        // The invoice is locked first, then the allocation row is written. The other order
        // deadlocks: inserting an allocation takes a FOR KEY SHARE on the invoice it references,
        // two concurrent payments against one invoice both get it, and each then blocks on the
        // other's FOR UPDATE.
        settled.set(
          entry.invoiceId,
          await applyPaymentToInvoice(tx, actor.organizationId, entry, actor.userId, reference),
        );
        await tx.paymentAllocation.create({
          data: {
            paymentId: created.id,
            invoiceId: entry.invoiceId,
            amount: entry.amount,
            allocatedById: actor.userId,
          },
        });
      }

      return created;
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.PAYMENT_RECORDED,
      entityType: AUDIT_ENTITY_TYPE.PAYMENT,
      entityId: payment.id,
      organizationId: actor.organizationId,
      after: {
        reference,
        amount: amount.toFixed(2),
        allocations: plan.entries.length,
      },
    });

    await this.announce(actor, plan.entries, reference, settled);
    return this.detail(actor, payment.id);
  }

  /** The money must be coming from a real client of this provider, not from any uuid. */
  private async assertClient(organizationId: string, clientOrganizationId: string): Promise<void> {
    const client = await this.prisma.organization.findFirst({
      where: { id: clientOrganizationId, deletedAt: null, isServiceProvider: false },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException('That client organization does not exist');
    }
    if (clientOrganizationId === organizationId) {
      throw new BadRequestException('A payment cannot be recorded against your own organization');
    }
  }

  /** Applies part of an already-recorded payment to further invoices. */
  async allocate(
    actor: AuthenticatedUser,
    paymentId: string,
    allocations: { invoiceId: string; amount: string }[],
  ): Promise<PaymentRow> {
    const payment = await this.detail(actor, paymentId);
    if (allocations.length === 0) {
      throw new BadRequestException('Nothing to allocate');
    }

    const openInvoices = await this.repository.openInvoicesFor(
      actor.organizationId,
      payment.clientOrganizationId,
    );
    const allocatable = openInvoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status as InvoiceStatus,
      balanceDue: invoice.balanceDue,
      currency: invoice.currency,
    }));
    const dueDates = new Map(openInvoices.map((invoice) => [invoice.id, invoice.dueDate]));

    const alreadyAllocated = toMoney(payment.amount.minus(payment.unallocatedAmount));
    const plan = planAllocation(
      payment.amount,
      alreadyAllocated,
      allocations.map((entry) => ({
        invoiceId: entry.invoiceId,
        amount: parseScaled(entry.amount, MONEY_SCALE, 'An allocation amount'),
      })),
      allocatable,
      new Date(),
      dueDates,
      payment.currency,
    );
    if (!plan.ok) {
      throw plan.reason === 'unknown-invoice'
        ? new NotFoundException(plan.message)
        : new BadRequestException(plan.message);
    }

    const settled = new Map<string, InvoiceStatus>();
    await this.prisma.$transaction(async (tx) => {
      // The payment is locked before anything is applied, and its unapplied balance is re-read
      // under that lock. `plan.unallocated` was derived from a read taken before the transaction
      // opened, and writing it back as an absolute value let two concurrent allocations against
      // one payment each believe the whole amount was free — applying twice what was received.
      const [lockedPayment] = await tx.$queryRaw<{ unallocated_amount: Money }[]>`
        SELECT unallocated_amount FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      if (!lockedPayment) {
        throw new NotFoundException('Payment not found');
      }
      const available = toMoney(lockedPayment.unallocated_amount);
      const requested = plan.entries.reduce((total, entry) => total.plus(entry.amount), toMoney(0));
      if (requested.greaterThan(available)) {
        throw new ConflictException(
          `Allocating ${requested.toFixed(2)} but only ${available.toFixed(2)} of this payment ` +
            'is unapplied. Someone allocated it while you were working; reload and try again.',
        );
      }

      for (const entry of inLockOrder(plan.entries)) {
        settled.set(
          entry.invoiceId,
          await applyPaymentToInvoice(
            tx,
            actor.organizationId,
            entry,
            actor.userId,
            payment.reference,
          ),
        );
        // Upsert: applying more to an invoice this payment already touched raises the existing
        // row rather than creating a second one against the same pair.
        await tx.paymentAllocation.upsert({
          where: { paymentId_invoiceId: { paymentId, invoiceId: entry.invoiceId } },
          create: {
            paymentId,
            invoiceId: entry.invoiceId,
            amount: entry.amount,
            allocatedById: actor.userId,
          },
          update: { amount: { increment: entry.amount } },
        });
      }

      // Relative, not absolute, for the same reason the invoice balances are.
      await tx.payment.update({
        where: { id: paymentId },
        data: { unallocatedAmount: { decrement: requested } },
      });
    });

    // Recorded after the transaction commits, so the log never claims an allocation that rolled
    // back. Every other money-moving path writes one; this one did not, which left a payee change
    // and the allocation of whatever then arrived with nothing tying them together.
    await this.auditLog.record({
      action: AUDIT_ACTION.PAYMENT_ALLOCATED,
      entityType: AUDIT_ENTITY_TYPE.PAYMENT,
      entityId: paymentId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        reference: payment.reference,
        currency: payment.currency,
        allocations: plan.entries.map((entry) => ({
          invoiceId: entry.invoiceId,
          amount: entry.amount.toFixed(2),
          invoiceStatusAfter: settled.get(entry.invoiceId) ?? null,
        })),
      },
    });

    await this.announce(actor, plan.entries, payment.reference, settled);
    return this.detail(actor, paymentId);
  }

  /**
   * Tells the right people that money arrived.
   *
   * After the transaction, never inside it: a notification failure must not roll back a payment
   * that was genuinely received.
   */
  private async announce(
    actor: AuthenticatedUser,
    entries: { invoiceId: string; amount: Money }[],
    reference: string,
    settled: Map<string, InvoiceStatus>,
  ): Promise<void> {
    for (const entry of entries) {
      const invoice = await this.repository.findDetail(actor.organizationId, entry.invoiceId);
      if (!invoice) {
        continue;
      }
      await this.notifications.paymentRecorded(
        invoice,
        reference,
        entry.amount.toFixed(2),
        actor.userId,
      );
      // The status the transaction actually wrote, not the one the plan predicted. Two partial
      // payments planned against the same balance both predict PARTIALLY_PAID; the second one
      // settles the invoice, and reading the plan meant nobody was told it was paid.
      if (settled.get(entry.invoiceId) === 'PAID') {
        await this.notifications.invoicePaid(invoice, actor.userId);
      }
    }
  }
}

/**
 * A stable order for taking invoice locks.
 *
 * The caller supplies the allocations, so two requests touching the same two invoices could take
 * their locks in opposite orders and deadlock — Postgres aborts one side with 40P01, which reaches
 * the client as an opaque 500. Sorting by id means every transaction queues in the same order.
 */
function inLockOrder<T extends { invoiceId: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
}
