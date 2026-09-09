import type { InvoiceStatus } from '@ashniva/types';

import { ZERO, sum, toMoney, type Money } from './money';

/**
 * Applying money to invoices.
 *
 * Pure, because the rules are worth testing without a database and because getting them wrong
 * means a client is told they owe something they have paid, or the reverse.
 */

export interface AllocationRequest {
  invoiceId: string;
  amount: Money;
}

export interface AllocatableInvoice {
  id: string;
  status: InvoiceStatus;
  balanceDue: Money;
  /** The invoice's own currency. Compared with the payment's; there is no conversion. */
  currency: string;
}

export type AllocationRefusal =
  | { ok: false; reason: 'unknown-invoice'; message: string }
  | { ok: false; reason: 'not-allocatable'; message: string }
  | { ok: false; reason: 'overpayment'; message: string }
  | { ok: false; reason: 'exceeds-payment'; message: string }
  | { ok: false; reason: 'invalid-amount'; message: string }
  | { ok: false; reason: 'duplicate-invoice'; message: string }
  | { ok: false; reason: 'currency-mismatch'; message: string };

export interface AllocationPlan {
  ok: true;
  /** Per invoice: how much to apply and what its status becomes. */
  entries: {
    invoiceId: string;
    /** The amount to add to this invoice, not its new total paid. */
    amount: Money;
    newBalanceDue: Money;
    newStatus: InvoiceStatus;
  }[];
  /** What remains on the payment afterwards. */
  unallocated: Money;
}

export type AllocationOutcome = AllocationPlan | AllocationRefusal;

/**
 * An invoice that can still receive money.
 *
 * A draft has not been sent; a void one is withdrawn; a paid one owes nothing. `PAID` used to be
 * in this set, which left the guard against double-allocation resting entirely on the balance
 * arithmetic downstream — a set named "allocatable" that included a settled invoice. The balance
 * check still runs; this makes the status say the same thing, so the two agree rather than one
 * covering for the other.
 */
export function isAllocatable(status: InvoiceStatus): boolean {
  return status === 'ISSUED' || status === 'PARTIALLY_PAID' || status === 'OVERDUE';
}

/**
 * The status an invoice reaches once a payment lands.
 *
 * Overdue is not preserved: once something is paid in part, "partially paid" is the more useful
 * fact, and the due date still says it is late.
 */
export function statusAfterPayment(
  current: InvoiceStatus,
  total: Money,
  amountPaid: Money,
  today: Date,
  dueDate: Date,
): InvoiceStatus {
  if (amountPaid.greaterThanOrEqualTo(total)) {
    return 'PAID';
  }
  if (amountPaid.greaterThan(0)) {
    return 'PARTIALLY_PAID';
  }
  // Nothing applied after all: fall back to whether it is late.
  if (dueDate < today || current === 'OVERDUE') {
    return 'OVERDUE';
  }
  return 'ISSUED';
}

/**
 * Works out what a payment should do, or why it cannot.
 *
 * Returns a plan rather than performing it, so the caller can apply every entry inside one
 * transaction. Nothing is partially applied: a request that overpays any invoice is refused
 * whole, because an overpayment silently absorbed is a discrepancy nobody notices until a
 * reconciliation months later.
 */
export function planAllocation(
  paymentAmount: Money,
  alreadyAllocated: Money,
  requests: AllocationRequest[],
  invoices: AllocatableInvoice[],
  today = new Date(),
  dueDates: Map<string, Date> = new Map(),
  /** The payment's currency. Omitted only by callers that predate the check. */
  paymentCurrency?: string,
): AllocationOutcome {
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const entries: AllocationPlan['entries'] = [];
  const seen = new Set<string>();

  for (const request of requests) {
    // Each entry below is checked against the invoice's balance on its own, so two entries for
    // the same invoice would each pass and together overpay it. Refusing the request is clearer
    // than adding them up silently: whoever sent two lines for one invoice meant something, and
    // guessing which is not this function's job.
    if (seen.has(request.invoiceId)) {
      return {
        ok: false,
        reason: 'duplicate-invoice',
        message: 'The same invoice appears twice. Send one amount per invoice.',
      };
    }
    seen.add(request.invoiceId);

    if (request.amount.lessThanOrEqualTo(0)) {
      return {
        ok: false,
        reason: 'invalid-amount',
        message: 'An allocation must be greater than zero',
      };
    }

    const invoice = byId.get(request.invoiceId);
    if (!invoice) {
      return {
        ok: false,
        reason: 'unknown-invoice',
        message: 'One of the invoices does not exist or is not yours',
      };
    }
    if (!isAllocatable(invoice.status)) {
      return {
        ok: false,
        reason: 'not-allocatable',
        message: `An invoice that is ${invoice.status} cannot take a payment`,
      };
    }

    // No conversion exists anywhere in this module, so two different currencies cannot be
    // compared, added, or allocated against one another. Refused rather than quietly treated as
    // the same number with a different label.
    if (paymentCurrency !== undefined && invoice.currency !== paymentCurrency) {
      return {
        ok: false,
        reason: 'currency-mismatch',
        message:
          `This payment is in ${paymentCurrency} and the invoice is in ${invoice.currency}. ` +
          'Record the payment in the invoice’s currency.',
      };
    }

    const amount = toMoney(request.amount);
    if (amount.greaterThan(invoice.balanceDue)) {
      return {
        ok: false,
        reason: 'overpayment',
        message:
          `${amount.toFixed(2)} is more than the ${invoice.balanceDue.toFixed(2)} outstanding ` +
          'on that invoice. Record the excess as unallocated instead.',
      };
    }

    const newBalanceDue = toMoney(invoice.balanceDue.minus(amount));
    const dueDate = dueDates.get(invoice.id) ?? today;

    entries.push({
      invoiceId: invoice.id,
      amount,
      newBalanceDue,
      newStatus: newBalanceDue.isZero()
        ? 'PAID'
        : statusAfterPayment(invoice.status, invoice.balanceDue, amount, today, dueDate),
    });
  }

  const requested = toMoney(sum(entries.map((entry) => entry.amount)));
  const available = toMoney(paymentAmount.minus(alreadyAllocated));

  if (requested.greaterThan(available)) {
    return {
      ok: false,
      reason: 'exceeds-payment',
      message:
        `Allocating ${requested.toFixed(2)} but only ${available.toFixed(2)} of this payment ` +
        'is unapplied',
    };
  }

  return { ok: true, entries, unallocated: toMoney(available.minus(requested)) };
}

/**
 * Spreads a payment across invoices oldest-first.
 *
 * The default when someone records a transfer without saying what it settles, and what most
 * accounting practice does: the oldest debt is cleared first.
 */
export function autoAllocate(
  available: Money,
  invoices: AllocatableInvoice[],
): AllocationRequest[] {
  const requests: AllocationRequest[] = [];
  let remaining = toMoney(available);

  for (const invoice of invoices) {
    if (remaining.lessThanOrEqualTo(0)) {
      break;
    }
    if (!isAllocatable(invoice.status) || invoice.balanceDue.lessThanOrEqualTo(0)) {
      continue;
    }
    const amount = remaining.greaterThan(invoice.balanceDue)
      ? toMoney(invoice.balanceDue)
      : remaining;
    requests.push({ invoiceId: invoice.id, amount });
    remaining = toMoney(remaining.minus(amount));
  }

  return requests;
}

/** What is left on a payment after its allocations, never below zero. */
export function unallocatedOf(amount: Money, allocations: Money[]): Money {
  const remaining = amount.minus(sum(allocations));
  return toMoney(remaining.isNegative() ? ZERO : remaining);
}
