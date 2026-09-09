// ---------------------------------------------------------------------------------------------
// Billing and invoicing
//
// Every money value crosses the wire as a fixed two-place string, never a number. A JSON number
// is a double, and a double cannot hold 0.1 exactly — serialising currency through one is how
// totals drift by a paisa between the server and the screen.
// ---------------------------------------------------------------------------------------------

/**
 * A monetary amount as a string, e.g. `"1180.00"`.
 *
 * Two decimal places everywhere **except `InvoiceLineItem.unitPrice`**, which carries two to four
 * — see its own comment. The column is `DECIMAL(14,4)` and the rate is printed at the precision
 * it was entered at, because a rate rounded to two places multiplies out to a different figure
 * than the taxable value printed beside it on the same invoice.
 *
 * Saying "always two decimal places" here was false for that one field, and this is the nearest
 * thing in the repository to a written contract, so it is worth being exact: totals, tax amounts
 * and line totals are two places and are what a consumer should reconcile against.
 */
export type MoneyString = string;

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
  VOID: 'Void',
};

/** Statuses a client may see in the portal. A draft is not a document anyone has been sent. */
export const CLIENT_VISIBLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
];

/**
 * Statuses that mean "this invoice is closed, stop treating it as owing".
 *
 * One definition because three surfaces answer with it and a client sees two of them: the internal
 * list's `isOverdue` flag, the portal's, and the nightly sweep that decides whether to email a
 * client that they are late. Drift between them puts a screen and an email in contradiction —
 * an invoice shown as settled while the sweep still chases it.
 *
 * `VOID` is deliberately both settled *and* client-visible: a voided invoice stops owing money,
 * but the client keeps the document. That is why this set and `CLIENT_VISIBLE_INVOICE_STATUSES`
 * cannot be merged — they answer different questions about the same status.
 */
export const SETTLED_INVOICE_STATUSES: readonly InvoiceStatus[] = ['PAID', 'CANCELLED', 'VOID'];

/** Whether an invoice has stopped owing money, whatever its balance says. */
export function isSettledInvoiceStatus(status: string): boolean {
  return SETTLED_INVOICE_STATUSES.includes(status as InvoiceStatus);
}

/** Statuses that still owe money. */
export const OPEN_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'ISSUED',
  'PARTIALLY_PAID',
  'OVERDUE',
];

/**
 * Which transitions the API allows.
 *
 * A paid invoice is terminal: correcting one is a credit note, not an edit. Void is reachable
 * from every issued state because a document that has left the building can only be withdrawn,
 * never deleted — the number stays in the sequence.
 */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PAID: ['VOID'],
  CANCELLED: [],
  VOID: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

/** Only a draft may be edited. Anything issued is a financial document. */
export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return status === 'DRAFT';
}

export const TAX_TREATMENT = {
  EXCLUSIVE: 'EXCLUSIVE',
  INCLUSIVE: 'INCLUSIVE',
} as const;

export type TaxTreatment = (typeof TAX_TREATMENT)[keyof typeof TAX_TREATMENT];

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  EXCLUSIVE: 'Prices exclude GST',
  INCLUSIVE: 'Prices include GST',
};

export const SUPPLY_TYPE = {
  INTRA_STATE: 'INTRA_STATE',
  INTER_STATE: 'INTER_STATE',
  EXPORT: 'EXPORT',
  EXEMPT: 'EXEMPT',
} as const;

export type SupplyType = (typeof SUPPLY_TYPE)[keyof typeof SUPPLY_TYPE];

export const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  INTRA_STATE: 'Within the state (CGST + SGST)',
  INTER_STATE: 'Between states (IGST)',
  EXPORT: 'Export (no GST)',
  EXEMPT: 'Exempt (no GST)',
};

export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI',
  CHEQUE: 'CHEQUE',
  CARD: 'CARD',
  CASH: 'CASH',
  OTHER: 'OTHER',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
};

export const INVOICE_LINE_SOURCE = {
  MANUAL: 'MANUAL',
  MILESTONE: 'MILESTONE',
  SUPPORT_HOURS: 'SUPPORT_HOURS',
  CHANGE_REQUEST: 'CHANGE_REQUEST',
  CONTRACT: 'CONTRACT',
} as const;

export type InvoiceLineSource = (typeof INVOICE_LINE_SOURCE)[keyof typeof INVOICE_LINE_SOURCE];

// -----------------------------------------------------------------------------------------------
// Billing profile
// -----------------------------------------------------------------------------------------------

/** The supplier's own details. Provider-only; no portal endpoint returns this. */
export interface BillingProfile {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  /** Two-digit GST state code; decides intra- versus inter-state treatment. */
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string | null;
  pan: string | null;
  email: string;
  phone: string | null;
  currency: string;
  paymentTermsDays: number;
  defaultTaxRate: string;
  defaultTaxTreatment: TaxTreatment;
  roundTotals: boolean;
  invoicePrefix: string;
  nextSequence: number;
  sequenceYear: string;
  financialYearStartMonth: number;
  /** Stored; no document prints it yet. See `InvoicePdfService`. */
  logoFileId: string | null;
  /** Stored; no document prints it yet. See `InvoicePdfService`. */
  signatureFileId: string | null;
  bankDetails: string | null;
  terms: string | null;
  /** Never printed and never sent to a client. */
  internalNotes: string | null;
}

/**
 * Who an invoice is *to*: the provider's record of one client's billing particulars, frozen onto
 * the invoice at issue and printed in the "Bill to" block.
 *
 * The provider's own record about a client, never the client's to see or edit — it is not part of
 * any portal response.
 */
export interface ClientBillingProfile {
  clientOrganizationId: string;
  /** The organization's display name, for a screen that has to say who this is about. */
  clientName: string;
  /** The registered name to print, which is often not the display name. */
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  /**
   * Two-digit GST state code of the recipient. Printed; it does not decide the tax treatment —
   * the invoice's own place of supply does, and always has.
   */
  stateCode: string;
  postalCode: string;
  country: string;
  /** Null for an unregistered recipient, who legitimately has none. */
  gstin: string | null;
  updatedAt: string;
}

// -----------------------------------------------------------------------------------------------
// Invoices
// -----------------------------------------------------------------------------------------------

export interface InvoiceLineItem {
  id: string;
  position: number;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  /**
   * The rate, at the precision it was entered at: two to four decimal places, not always two.
   *
   * The column is `DECIMAL(14,4)`. Printing it rounded to two would contradict the
   * `taxableValue` beside it — `quantity × printed rate` would not reproduce it — which is the
   * defect this shape fixes. Every other money field on the line is two places.
   *
   * A consumer outside this repository that stores or validates this at exactly two decimal
   * places would truncate or reject it. That is issue #10, and it is open on that question.
   */
  unitPrice: MoneyString;
  discountPercent: string;
  discountAmount: MoneyString;
  taxRate: string;
  taxableValue: MoneyString;
  cgstAmount: MoneyString;
  sgstAmount: MoneyString;
  igstAmount: MoneyString;
  lineTotal: MoneyString;
  source: InvoiceLineSource;
}

export interface InvoiceTaxRow {
  taxRate: string;
  hsnSac: string;
  taxableValue: MoneyString;
  cgstAmount: MoneyString;
  sgstAmount: MoneyString;
  igstAmount: MoneyString;
  totalTax: MoneyString;
}

/** The figures every view of an invoice shares. */
export interface InvoiceTotals {
  subtotal: MoneyString;
  discountTotal: MoneyString;
  taxableValue: MoneyString;
  cgstTotal: MoneyString;
  sgstTotal: MoneyString;
  igstTotal: MoneyString;
  taxTotal: MoneyString;
  roundingAdjustment: MoneyString;
  total: MoneyString;
  amountPaid: MoneyString;
  balanceDue: MoneyString;
}

export interface InvoiceSummary extends InvoiceTotals {
  id: string;
  numberLabel: string;
  financialYear: string;
  status: InvoiceStatus;
  clientOrganizationId: string;
  clientName: string;
  projectId: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  /** True when it is past due and still owes money. */
  isOverdue: boolean;
  updatedAt: string;
}

/** Internal view. Carries internal notes and the history; never sent to a client. */
export interface InvoiceDetail extends InvoiceSummary {
  contractId: string | null;
  milestoneId: string | null;
  changeRequestId: string | null;
  placeOfSupplyState: string;
  placeOfSupplyCode: string;
  supplyType: SupplyType;
  taxTreatment: TaxTreatment;
  reverseCharge: boolean;
  amountInWords: string | null;
  notes: string | null;
  internalNotes: string | null;
  pdfFileId: string | null;
  issuedAt: string | null;
  cancelReason: string | null;
  voidReason: string | null;
  lastReminderAt: string | null;
  lineItems: InvoiceLineItem[];
  taxBreakdown: InvoiceTaxRow[];
  payments: InvoicePaymentRow[];
  history: InvoiceHistoryEntry[];
  createdAt: string;
}

export interface InvoiceHistoryEntry {
  id: string;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus;
  note: string | null;
  changedByName: string;
  /** Set when a superseded financial document was kept at this point. */
  hasSnapshot: boolean;
  pdfFileId: string | null;
  createdAt: string;
}

/** A payment as it appears against one invoice. */
export interface InvoicePaymentRow {
  paymentId: string;
  reference: string;
  method: PaymentMethod;
  paidAt: string;
  /** How much of that payment was applied to this invoice. */
  allocatedAmount: MoneyString;
}

export interface PaymentSummary {
  id: string;
  reference: string;
  method: PaymentMethod;
  paidAt: string;
  amount: MoneyString;
  unallocatedAmount: MoneyString;
  currency: string;
  clientOrganizationId: string;
  clientName: string;
  notes: string | null;
  recordedByName: string;
  createdAt: string;
}

/** What a preview returns. Nothing is stored; the same code computes the real invoice. */
export interface CalculationPreview extends Omit<InvoiceTotals, 'amountPaid' | 'balanceDue'> {
  lines: Omit<InvoiceLineItem, 'id' | 'source'>[];
  taxBreakdown: InvoiceTaxRow[];
  amountInWords: string;
}

// -----------------------------------------------------------------------------------------------
// Client portal
// -----------------------------------------------------------------------------------------------

/**
 * What a client sees.
 *
 * A separate interface rather than a Partial of the detail: there is no `internalNotes`, no
 * history and no cost information, so a mapper cannot leak one by forgetting a field.
 */
export interface PortalInvoiceSummary {
  id: string;
  numberLabel: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: string;
  total: MoneyString;
  amountPaid: MoneyString;
  balanceDue: MoneyString;
  isOverdue: boolean;
}

export interface PortalInvoiceDetail extends PortalInvoiceSummary {
  projectId: string | null;
  placeOfSupplyState: string;
  supplyType: SupplyType;
  reverseCharge: boolean;
  subtotal: MoneyString;
  discountTotal: MoneyString;
  taxableValue: MoneyString;
  cgstTotal: MoneyString;
  sgstTotal: MoneyString;
  igstTotal: MoneyString;
  taxTotal: MoneyString;
  roundingAdjustment: MoneyString;
  amountInWords: string | null;
  /** The client-facing note only. Internal notes have no field here. */
  notes: string | null;
  lineItems: Omit<InvoiceLineItem, 'source'>[];
  taxBreakdown: InvoiceTaxRow[];
  payments: InvoicePaymentRow[];
  hasPdf: boolean;
}
