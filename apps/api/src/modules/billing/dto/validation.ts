/**
 * Validation shared by the billing DTOs.
 *
 * The patterns live here rather than in each DTO file so that an invoice, a payment and a
 * billing profile cannot drift into accepting different shapes of the same value.
 */
import { INVOICE_STATUS, PAYMENT_METHOD, TAX_TREATMENT } from '@ashniva/types';

export const STATUSES = Object.values(INVOICE_STATUS);
export const METHODS = Object.values(PAYMENT_METHOD);
export const TREATMENTS = Object.values(TAX_TREATMENT);

export const toArray = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

/**
 * The shape a money value must have.
 *
 * Money is documented and sent as a string. The validation pipe has implicit conversion on, so a
 * caller who sends a JSON number still reaches this pattern as a string — and that round-trip is
 * lossless for everything the pattern accepts, because JavaScript prints the shortest
 * representation that round-trips. What the pattern refuses is exactly what a double mangles:
 * exponent notation, more precision than the column holds, and anything past twelve digits.
 */
export const MONEY = /^-?\d{1,12}(\.\d{1,4})?$/;
export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/;
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const STATE_CODE = /^[0-9]{2}$/;
