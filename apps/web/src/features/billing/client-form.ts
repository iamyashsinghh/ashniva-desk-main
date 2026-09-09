import type { ClientBillingProfile } from '@ashniva/types';

import type { ClientBillingInput } from './api';

/** The "Bill to" form, as strings — the shape the inputs bind to. */
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

/** Fills the form from a recorded client, or empty for one nobody has recorded yet. */
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

/** An emptied optional means "no value", not `""` — the API refuses the empty string. */
function optional(value: string): string | undefined {
  return value.trim() || undefined;
}

/** The request body. The client organization is in the path, so it is not part of this. */
export function clientBillingPayloadFrom(
  form: ClientBillingForm,
): Omit<ClientBillingInput, 'clientOrganizationId'> {
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
