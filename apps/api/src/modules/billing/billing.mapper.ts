import type {
  BillingProfile,
  CalculationPreview,
  ClientBillingProfile,
  InvoiceDetail,
  InvoiceHistoryEntry,
  InvoiceLineItem,
  InvoiceLineSource,
  InvoicePaymentRow,
  InvoiceStatus,
  InvoiceSummary,
  InvoiceTaxRow,
  PaymentMethod,
  PaymentSummary,
  SupplyType,
  TaxTreatment,
} from '@ashniva/types';
import { isSettledInvoiceStatus } from '@ashniva/types';

import { appliedBreakdown, appliedTaxRate, type calculateInvoice } from './invoice-calculator';
import { amountInWords, unitPriceText } from './money';
import type {
  BillingProfileRow,
  ClientBillingProfileRow,
  InvoiceDetailRow,
  InvoiceSummaryRow,
  PaymentRow,
} from './billing.repository';

/**
 * Allow-list mappers for billing.
 *
 * Two rules hold throughout. Money crosses the wire as a fixed two-place string, never a JSON
 * number — a double cannot hold 0.1 exactly, and currency serialised through one drifts. And
 * the portal shapes name every field they expose, so an internal note cannot arrive at a client
 * by being spread from a row.
 */

const day = (value: Date): string => value.toISOString().slice(0, 10);

/** Past its due date and still owing. Derived on read so a stale status cannot mislead. */
function overdue(row: {
  dueDate: Date;
  balanceDue: { greaterThan(n: number): boolean };
  status: string;
}): boolean {
  const owes = row.balanceDue.greaterThan(0);
  const settled = isSettledInvoiceStatus(row.status);
  return owes && !settled && row.dueDate < startOfToday();
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function toBillingProfile(row: BillingProfileRow): BillingProfile {
  return {
    legalName: row.legalName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    stateCode: row.stateCode,
    postalCode: row.postalCode,
    country: row.country,
    gstin: row.gstin,
    pan: row.pan,
    email: row.email,
    phone: row.phone,
    currency: row.currency,
    paymentTermsDays: row.paymentTermsDays,
    defaultTaxRate: row.defaultTaxRate.toFixed(2),
    defaultTaxTreatment: row.defaultTaxTreatment as TaxTreatment,
    roundTotals: row.roundTotals,
    invoicePrefix: row.invoicePrefix,
    nextSequence: row.nextSequence,
    sequenceYear: row.sequenceYear,
    financialYearStartMonth: row.financialYearStartMonth,
    logoFileId: row.logoFileId,
    signatureFileId: row.signatureFileId,
    bankDetails: row.bankDetails,
    terms: row.terms,
    internalNotes: row.internalNotes,
  };
}

/** The provider's record of a client. Named field by field, so nothing new leaks by being spread. */
export function toClientBillingProfile(row: ClientBillingProfileRow): ClientBillingProfile {
  return {
    clientOrganizationId: row.clientOrganizationId,
    clientName: row.clientOrganization.name,
    legalName: row.legalName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    stateCode: row.stateCode,
    postalCode: row.postalCode,
    country: row.country,
    gstin: row.gstin,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function totals(row: InvoiceSummaryRow) {
  return {
    subtotal: row.subtotal.toFixed(2),
    discountTotal: row.discountTotal.toFixed(2),
    taxableValue: row.taxableValue.toFixed(2),
    cgstTotal: row.cgstTotal.toFixed(2),
    sgstTotal: row.sgstTotal.toFixed(2),
    igstTotal: row.igstTotal.toFixed(2),
    taxTotal: row.taxTotal.toFixed(2),
    roundingAdjustment: row.roundingAdjustment.toFixed(2),
    total: row.total.toFixed(2),
    amountPaid: row.amountPaid.toFixed(2),
    balanceDue: row.balanceDue.toFixed(2),
  };
}

export function toInvoiceSummary(row: InvoiceSummaryRow): InvoiceSummary {
  return {
    id: row.id,
    numberLabel: row.numberLabel,
    financialYear: row.financialYear,
    status: row.status as InvoiceStatus,
    clientOrganizationId: row.clientOrganizationId,
    clientName: row.clientOrganization.name,
    projectId: row.projectId,
    issueDate: day(row.issueDate),
    dueDate: day(row.dueDate),
    currency: row.currency,
    isOverdue: overdue(row),
    updatedAt: row.updatedAt.toISOString(),
    ...totals(row),
  };
}

function toLineItem(
  row: InvoiceDetailRow['lineItems'][number],
  supplyType: SupplyType,
): InvoiceLineItem {
  return {
    id: row.id,
    position: row.position,
    description: row.description,
    hsnSac: row.hsnSac,
    quantity: row.quantity.toFixed(3),
    unit: row.unit,
    // Up to four places when the stored price needs them, so quantity × rate reconciles with the
    // taxable value beside it. See `unitPriceText`.
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
    source: row.source as InvoiceLineSource,
  };
}

/** Formatting only: `appliedBreakdown` has already resolved the rate and merged the rows. */
function toTaxRow(row: ReturnType<typeof appliedBreakdown>[number]): InvoiceTaxRow {
  return {
    taxRate: row.taxRate.toFixed(2),
    hsnSac: row.hsnSac,
    taxableValue: row.taxableValue.toFixed(2),
    cgstAmount: row.cgstAmount.toFixed(2),
    sgstAmount: row.sgstAmount.toFixed(2),
    igstAmount: row.igstAmount.toFixed(2),
    totalTax: row.totalTax.toFixed(2),
  };
}

function toPaymentRow(row: InvoiceDetailRow['allocations'][number]): InvoicePaymentRow {
  return {
    paymentId: row.payment.id,
    reference: row.payment.reference,
    method: row.payment.method as PaymentMethod,
    paidAt: row.payment.paidAt.toISOString(),
    allocatedAmount: row.amount.toFixed(2),
  };
}

function toHistoryEntry(row: InvoiceDetailRow['history'][number]): InvoiceHistoryEntry {
  return {
    id: row.id,
    fromStatus: (row.fromStatus as InvoiceStatus | null) ?? null,
    toStatus: row.toStatus as InvoiceStatus,
    note: row.note,
    changedByName: row.changedBy.name,
    // The snapshot itself is provider-internal detail; the entry reports only that one exists.
    hasSnapshot: row.documentSnapshot !== null,
    pdfFileId: row.pdfFileId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toInvoiceDetail(row: InvoiceDetailRow): InvoiceDetail {
  const supplyType = row.supplyType as SupplyType;
  return {
    ...toInvoiceSummary(row),
    contractId: row.contractId,
    milestoneId: row.milestoneId,
    changeRequestId: row.changeRequestId,
    placeOfSupplyState: row.placeOfSupplyState,
    placeOfSupplyCode: row.placeOfSupplyCode,
    supplyType,
    taxTreatment: row.taxTreatment as TaxTreatment,
    reverseCharge: row.reverseCharge,
    amountInWords: row.amountInWords,
    notes: row.notes,
    internalNotes: row.internalNotes,
    pdfFileId: row.pdfFileId,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    voidReason: row.voidReason,
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    lineItems: row.lineItems.map((line) => toLineItem(line, supplyType)),
    taxBreakdown: appliedBreakdown(supplyType, row.taxBreakdown).map(toTaxRow),
    payments: row.allocations.map(toPaymentRow),
    history: row.history.map(toHistoryEntry),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPaymentSummary(row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    reference: row.reference,
    method: row.method as PaymentMethod,
    paidAt: row.paidAt.toISOString(),
    amount: row.amount.toFixed(2),
    unallocatedAmount: row.unallocatedAmount.toFixed(2),
    currency: row.currency,
    clientOrganizationId: row.clientOrganizationId,
    clientName: row.clientOrganization.name,
    // The client-facing note only; `internalNotes` has no field on the summary.
    notes: row.notes,
    recordedByName: row.recordedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A discount percentage as the invoice will store it.
 *
 * Absent, blank and unparseable all mean "no percentage was entered", which is `0.00` — the same
 * value a saved line carries when the discount was given as an amount.
 */
function percentText(value: string | undefined): string {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== '' && Number.isFinite(parsed)
    ? parsed.toFixed(2)
    : '0.00';
}

export function toCalculationPreview(
  result: ReturnType<typeof calculateInvoice>,
  supplyType: SupplyType,
  /** The line inputs as typed, so the preview can echo what the calculator folded away. */
  inputs: { unit?: string; discountPercent?: string }[],
): CalculationPreview {
  return {
    lines: result.lines.map((line, index) => ({
      position: index,
      description: line.description,
      hsnSac: line.hsnSac,
      quantity: line.quantity.toFixed(3),
      unit: inputs[index]?.unit?.trim() || 'Nos',
      unitPrice: unitPriceText(line.unitPrice),
      // Echoed from the input rather than read back off the calculated line. The calculator folds
      // a percentage discount into the amount, so the line itself no longer knows the percentage
      // was ever there — reporting `0.00` made the preview contradict the row it previews, and a
      // user entering 10% saw it in the totals but not on the line.
      discountPercent: percentText(inputs[index]?.discountPercent),
      discountAmount: line.discountAmount.toFixed(2),
      // As applied, matching the saved invoice this preview is standing in for.
      taxRate: appliedTaxRate(supplyType, line.taxRate).toFixed(2),
      taxableValue: line.taxableValue.toFixed(2),
      cgstAmount: line.cgstAmount.toFixed(2),
      sgstAmount: line.sgstAmount.toFixed(2),
      igstAmount: line.igstAmount.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    })),
    taxBreakdown: appliedBreakdown(supplyType, result.taxBreakdown).map(toTaxRow),
    subtotal: result.subtotal.toFixed(2),
    discountTotal: result.discountTotal.toFixed(2),
    taxableValue: result.taxableValue.toFixed(2),
    cgstTotal: result.cgstTotal.toFixed(2),
    sgstTotal: result.sgstTotal.toFixed(2),
    igstTotal: result.igstTotal.toFixed(2),
    taxTotal: result.taxTotal.toFixed(2),
    roundingAdjustment: result.roundingAdjustment.toFixed(2),
    total: result.total.toFixed(2),
    amountInWords: amountInWords(result.total),
  };
}
