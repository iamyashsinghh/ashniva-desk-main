/**
 * Billing on the provider's side. Named apart from the client's `Invoices` tab and
 * `InvoiceDetail` route, which read the portal's allow-listed invoice.
 */
export type BillingParamList = {
  BillingInvoices: undefined;
  BillingInvoiceDetail: { id: string };
  /** Create (no id) or edit a draft (id). */
  InvoiceEditor: { id?: string } | undefined;
  Payments: undefined;
  BillingSettings: undefined;
};
