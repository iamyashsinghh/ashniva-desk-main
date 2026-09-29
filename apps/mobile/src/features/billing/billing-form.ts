import type { BillingProfile, ClientBillingProfile, TaxTreatment } from '@ashniva/types';

/**
 * The billing settings forms, as strings — the shape the inputs bind to — and the bodies the API
 * takes. The same defaults and the same rules as the web's `form.ts` and `client-form.ts`.
 */

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
  /** 1–12; 4 is April. Decides the year label on every invoice number. */
  financialYearStartMonth: string;
  bankDetails: string;
  terms: string;
  internalNotes: string;
}

export type BillingProfileInput = Partial<BillingProfile>;

/** The fields typed as free text — everything but the switch and the pricing choice. */
export type ProfileTextKey = Exclude<
  keyof BillingProfileForm,
  'roundTotals' | 'defaultTaxTreatment'
>;

/** Binds one text field of the profile form to its input. */
export type BindProfileField = (
  key: ProfileTextKey,
  transform?: (value: string) => string,
) => { value: string; onChange: (value: string) => void; editable: boolean };

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
 * The body for `PUT /settings/billing`. A full replace, so what the form does not carry — the logo,
 * the signature — is left out rather than sent as a default: the API keeps what it holds for an
 * absent key.
 */
export function billingPayloadFrom(form: BillingProfileForm): BillingProfileInput {
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

/** The web's rule, and the reason it gives when the button is disabled. */
export function billingFormProblem(form: BillingProfileForm): string | null {
  const valid =
    form.legalName.trim().length > 1 && /^\d{2}$/.test(form.stateCode) && form.email.includes('@');
  return valid ? null : 'A legal name, a two-digit state code and an email are required';
}

/** How the next number will read: `INV/2026-27/0042`. */
export function nextNumberLabel(profile: BillingProfile): string {
  return `${profile.invoicePrefix}/${profile.sequenceYear || 'new year'}/${String(
    profile.nextSequence,
  ).padStart(4, '0')}`;
}

export interface ClientBillingForm {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string;
}

export function clientBillingFormFrom(profile: ClientBillingProfile | null): ClientBillingForm {
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
  };
}

/** The body for `PUT /settings/billing/clients/:id`; the client is in the path. */
export function clientBillingPayloadFrom(form: ClientBillingForm) {
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
  };
}

export function clientBillingProblem(form: ClientBillingForm): string | null {
  const valid = form.legalName.trim().length > 1 && /^\d{2}$/.test(form.stateCode.trim());
  return valid ? null : 'A registered name and a two-digit state code are required';
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
