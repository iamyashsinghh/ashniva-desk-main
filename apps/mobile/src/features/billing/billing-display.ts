import {
  INVOICE_STATUS,
  OPEN_INVOICE_STATUSES,
  isInvoiceEditable,
  type InvoiceStatus,
  type InvoiceSummary,
} from '@ashniva/types';

export { invoiceDate } from '../portal/invoice-dates';
export { invoiceIconTone, invoiceTone } from '../portal/invoice-display';

/**
 * How billing figures read on screen — the same rules the web app prints by.
 *
 * An amount is the API's string, printed verbatim with the currency code in front of the figure
 * that matters (`INR 1180.00`), exactly as the web tables and totals block do. It is never parsed
 * and re-formatted: that would reintroduce the floating-point error the API avoids.
 */

export function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

/** A string comparison, deliberately: parsing to compare would defeat the point. */
export function isZero(value: string): boolean {
  return value === '0.00' || value === '-0.00';
}

/** A rate without its trailing zeros: `18.00` reads as `18`. */
export function trimRate(rate: string): string {
  return rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate;
}

/** A draft has no number yet — its label is an internal placeholder, never worth showing. */
export function invoiceTitle(invoice: Pick<InvoiceSummary, 'status' | 'numberLabel'>): string {
  return isInvoiceEditable(invoice.status) ? 'Draft invoice' : invoice.numberLabel;
}

export type InvoiceView = 'open' | 'overdue' | 'draft' | 'paid' | 'all';

/** The web list's views, in its order: what needs attention first. */
export const INVOICE_VIEWS: readonly {
  value: InvoiceView;
  label: string;
  statuses?: readonly InvoiceStatus[];
}[] = [
  { value: 'open', label: 'Outstanding', statuses: OPEN_INVOICE_STATUSES },
  { value: 'overdue', label: 'Overdue', statuses: [INVOICE_STATUS.OVERDUE] },
  { value: 'draft', label: 'Drafts', statuses: [INVOICE_STATUS.DRAFT] },
  { value: 'paid', label: 'Paid', statuses: [INVOICE_STATUS.PAID] },
  { value: 'all', label: 'All' },
];

const PAYABLE: readonly InvoiceStatus[] = OPEN_INVOICE_STATUSES;

/**
 * Whether the invoice can take a payment.
 *
 * Only one the client has actually been sent: a draft has not been, and a cancelled or void one has
 * been withdrawn. The API refuses all three with "does not exist or is not yours", which reads as a
 * bug when it is offered on the provider's own draft.
 */
export function owesMoney(invoice: Pick<InvoiceSummary, 'status' | 'balanceDue'>): boolean {
  return !isZero(invoice.balanceDue) && PAYABLE.includes(invoice.status);
}
