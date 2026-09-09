import type { BillingProfile, TaxTreatment } from '@ashniva/types';

/** The billing settings form, as strings — the shape the inputs bind to. */
export interface BillingProfileForm {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  currency: string;
  paymentTermsDays: string;
  defaultTaxRate: string;
  defaultTaxTreatment: TaxTreatment;
  roundTotals: boolean;
  invoicePrefix: string;
  /** 1–12; 4 is April. Decides the year label on every invoice number, so it must be editable. */
  financialYearStartMonth: string;
  bankDetails: string;
  terms: string;
  internalNotes: string;
}

/** Fills the form from a saved profile, or from sensible Indian defaults when there is none. */
export function billingFormFrom(profile: BillingProfile | null): BillingProfileForm {
  return {
    legalName: profile?.legalName ?? '',
    addressLine1: profile?.addressLine1 ?? '',
    addressLine2: profile?.addressLine2 ?? '',
    city: profile?.city ?? '',
    state: profile?.state ?? '',
    stateCode: profile?.stateCode ?? '',
    postalCode: profile?.postalCode ?? '',
    country: profile?.country ?? 'India',
    gstin: profile?.gstin ?? '',
    pan: profile?.pan ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    currency: profile?.currency ?? 'INR',
    paymentTermsDays: String(profile?.paymentTermsDays ?? 30),
    defaultTaxRate: profile?.defaultTaxRate ?? '18.00',
    defaultTaxTreatment: profile?.defaultTaxTreatment ?? 'EXCLUSIVE',
    roundTotals: profile?.roundTotals ?? true,
    invoicePrefix: profile?.invoicePrefix ?? 'INV',
    financialYearStartMonth: String(profile?.financialYearStartMonth ?? 4),
    bankDetails: profile?.bankDetails ?? '',
    terms: profile?.terms ?? '',
    internalNotes: profile?.internalNotes ?? '',
  };
}

/** An emptied optional field means "no value", not `""` — the API refuses the empty string. */
function optional(value: string): string | undefined {
  return value.trim() || undefined;
}

/**
 * The request body for `PUT /settings/billing`.
 *
 * The save is a full replace, so anything the form does not carry — the logo, the signature —
 * is deliberately left out of the body rather than sent as a default: the API preserves what it
 * already holds for a key that is absent.
 */
export function billingPayloadFrom(form: BillingProfileForm): Partial<BillingProfile> {
  return {
    legalName: form.legalName.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: optional(form.addressLine2),
    city: form.city.trim(),
    state: form.state.trim(),
    stateCode: form.stateCode.trim(),
    postalCode: form.postalCode.trim(),
    country: optional(form.country),
    gstin: optional(form.gstin),
    pan: optional(form.pan),
    email: form.email.trim(),
    phone: optional(form.phone),
    currency: optional(form.currency),
    paymentTermsDays: Number(form.paymentTermsDays),
    defaultTaxRate: optional(form.defaultTaxRate),
    defaultTaxTreatment: form.defaultTaxTreatment,
    roundTotals: form.roundTotals,
    invoicePrefix: optional(form.invoicePrefix),
    financialYearStartMonth: Number(form.financialYearStartMonth),
    bankDetails: optional(form.bankDetails),
    terms: optional(form.terms),
    internalNotes: optional(form.internalNotes),
  };
}
