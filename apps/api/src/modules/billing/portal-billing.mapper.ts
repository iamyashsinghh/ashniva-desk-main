import type {
  InvoiceLineItem,
  InvoiceStatus,
  PortalInvoiceDetail,
  PortalInvoiceSummary,
  SupplyType,
} from '@ashniva/types';
import { isSettledInvoiceStatus } from '@ashniva/types';

import type { InvoiceDetailRow, InvoiceSummaryRow } from './billing.repository';
import { appliedBreakdown, appliedTaxRate } from './invoice-calculator';
import { unitPriceText } from './money';

/**
 * What a client sees of their own invoices.
 *
 * A separate file from the internal mapper on purpose. Every field is named here, and the
 * portal types have nowhere for `internalNotes`, the approval history or the document snapshot
 * to land — so a field added to the invoice row later cannot reach a client by being spread.
 */

const day = (value: Date): string => value.toISOString().slice(0, 10);

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isOverdue(row: InvoiceSummaryRow): boolean {
  const settled = isSettledInvoiceStatus(row.status);
  return !settled && row.balanceDue.greaterThan(0) && row.dueDate < startOfToday();
}

export function toPortalInvoiceSummary(row: InvoiceSummaryRow): PortalInvoiceSummary {
  return {
    id: row.id,
    numberLabel: row.numberLabel,
    status: row.status as InvoiceStatus,
    issueDate: day(row.issueDate),
    dueDate: day(row.dueDate),
    currency: row.currency,
    total: row.total.toFixed(2),
    amountPaid: row.amountPaid.toFixed(2),
    balanceDue: row.balanceDue.toFixed(2),
    isOverdue: isOverdue(row),
  };
}

export function toPortalInvoiceDetail(row: InvoiceDetailRow): PortalInvoiceDetail {
  const supplyType = row.supplyType as SupplyType;
  return {
    ...toPortalInvoiceSummary(row),
    projectId: row.projectId,
    placeOfSupplyState: row.placeOfSupplyState,
    supplyType,
    reverseCharge: row.reverseCharge,
    subtotal: row.subtotal.toFixed(2),
    discountTotal: row.discountTotal.toFixed(2),
    taxableValue: row.taxableValue.toFixed(2),
    cgstTotal: row.cgstTotal.toFixed(2),
    sgstTotal: row.sgstTotal.toFixed(2),
    igstTotal: row.igstTotal.toFixed(2),
    taxTotal: row.taxTotal.toFixed(2),
    roundingAdjustment: row.roundingAdjustment.toFixed(2),
    amountInWords: row.amountInWords,
    // The client-facing note. `internalNotes` is deliberately absent from the type.
    notes: row.notes,
    lineItems: row.lineItems.map((line) => toPortalLine(line, supplyType)),
    taxBreakdown: appliedBreakdown(supplyType, row.taxBreakdown).map((tax) => ({
      taxRate: tax.taxRate.toFixed(2),
      hsnSac: tax.hsnSac,
      taxableValue: tax.taxableValue.toFixed(2),
      cgstAmount: tax.cgstAmount.toFixed(2),
      sgstAmount: tax.sgstAmount.toFixed(2),
      igstAmount: tax.igstAmount.toFixed(2),
      totalTax: tax.totalTax.toFixed(2),
    })),
    payments: row.allocations.map((allocation) => ({
      paymentId: allocation.payment.id,
      reference: allocation.payment.reference,
      method: allocation.payment.method as PortalInvoiceDetail['payments'][number]['method'],
      paidAt: allocation.payment.paidAt.toISOString(),
      allocatedAmount: allocation.amount.toFixed(2),
    })),
    hasPdf: row.pdfFileId !== null,
  };
}

/** `source` is dropped: how a line came to exist is a provider-side detail. */
function toPortalLine(
  row: InvoiceDetailRow['lineItems'][number],
  supplyType: SupplyType,
): Omit<InvoiceLineItem, 'source'> {
  return {
    id: row.id,
    position: row.position,
    description: row.description,
    hsnSac: row.hsnSac,
    quantity: row.quantity.toFixed(3),
    unit: row.unit,
    // Up to four places when the stored price needs them. See `unitPriceText`.
    unitPrice: unitPriceText(row.unitPrice),
    discountPercent: row.discountPercent.toFixed(2),
    discountAmount: row.discountAmount.toFixed(2),
    // The rate as applied, not the rate stored. See `appliedTaxRate`.
    taxRate: appliedTaxRate(supplyType, row.taxRate).toFixed(2),
    taxableValue: row.taxableValue.toFixed(2),
    cgstAmount: row.cgstAmount.toFixed(2),
    sgstAmount: row.sgstAmount.toFixed(2),
    igstAmount: row.igstAmount.toFixed(2),
    lineTotal: row.lineTotal.toFixed(2),
  };
}
