/**
 * Moving one invoice's balance when a payment lands on it.
 *
 * A free function rather than a method: it touches nothing on the service but the transaction it
 * is handed, and keeping it here makes the locking rules readable on their own.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { InvoiceStatus } from '@ashniva/types';

import { toMoney, type Money } from './money';
import { isAllocatable } from './payment-allocation';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Moves one invoice's balance and records it.
 *
 * The row is locked first. `increment`/`decrement` alone stop one transaction *losing* the
 * other's total, but not overpaying: the plan is built from a balance read before the
 * transaction opened, so two payments each covering the full amount both pass `planAllocation`
 * and together drive `balanceDue` negative. `SELECT … FOR UPDATE` makes them queue, and the
 * balance is then re-checked and the status re-derived from the row as it actually stands —
 * which also fixes two partial payments that together settle an invoice both computing
 * PARTIALLY_PAID and leaving it unpaid at a zero balance.
 */
export async function applyPaymentToInvoice(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entry: { invoiceId: string; amount: Money; newStatus: InvoiceStatus; newBalanceDue: Money },
  actorId: string,
  reference: string,
): Promise<InvoiceStatus> {
  // Scoped by organization as well as by id, so the message below is true. Nothing can reach
  // here with another tenant's id today — the plan is built from `openInvoicesFor` — but this is
  // the only place in billing that reads and writes an invoice, and it should not rely on that.
  const [locked] = await tx.$queryRaw<{ status: InvoiceStatus; balance_due: Money }[]>`
    SELECT status, balance_due FROM invoices
    WHERE id = ${entry.invoiceId}::uuid AND organization_id = ${organizationId}::uuid
    FOR UPDATE`;
  if (!locked) {
    throw new NotFoundException('One of the invoices does not exist or is not yours');
  }

  // The status is re-checked, not just re-read. Voiding an invoice leaves `balanceDue` where it
  // was, so a payment planned against an ISSUED invoice and applied after a concurrent void
  // would pass the balance check and write PAID over VOID — a transition the table forbids, on
  // a document that has been withdrawn and whose PDF the client can no longer reach.
  if (!isAllocatable(locked.status)) {
    throw new ConflictException(
      `That invoice is now ${locked.status} and cannot take a payment. ` +
        'Someone changed it while you were working; reload and try again.',
    );
  }

  const balanceDue = toMoney(locked.balance_due);
  if (entry.amount.greaterThan(balanceDue)) {
    throw new ConflictException(
      `${entry.amount.toFixed(2)} is more than the ${balanceDue.toFixed(2)} now outstanding ` +
        'on that invoice. Someone recorded a payment while you were working; reload and try again.',
    );
  }

  const before = { status: locked.status };
  // Derived under the lock, not from the plan: PAID the moment the balance reaches zero.
  const newStatus: InvoiceStatus = balanceDue.minus(entry.amount).isZero()
    ? 'PAID'
    : entry.newStatus;

  await tx.invoice.update({
    where: { id: entry.invoiceId },
    data: {
      amountPaid: { increment: entry.amount },
      balanceDue: { decrement: entry.amount },
      status: newStatus,
    },
  });

  await tx.invoiceHistory.create({
    data: {
      invoiceId: entry.invoiceId,
      fromStatus: before.status,
      toStatus: newStatus,
      note: `Payment ${reference}: ${entry.amount.toFixed(2)} applied`,
      changedById: actorId,
    },
  });

  return newStatus;
}
