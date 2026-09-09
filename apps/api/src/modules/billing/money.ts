import { Prisma } from '../../generated/prisma/client';

/**
 * Money arithmetic for invoicing.
 *
 * Every value here is a `Prisma.Decimal`, never a JavaScript number. A float cannot represent
 * 0.1 exactly, so a chain of float operations on currency drifts — and on an invoice that drift
 * is a real discrepancy someone has to reconcile. The same class the ORM reads and writes is
 * used throughout, so nothing is converted on the way in or out of the database.
 */

export const Decimal = Prisma.Decimal;
export type Money = Prisma.Decimal;

/** Rupees and paise. Two places everywhere a figure appears on the document. */
export const MONEY_DP = 2;
/** Unit prices carry four, so a per-hour rate of 1234.5678 is not rounded before multiplying. */
export const UNIT_PRICE_DP = 4;
/** Quantities carry three, enough for hours to the nearest 3.6 seconds. */
export const QUANTITY_DP = 3;

export const ZERO = new Decimal(0);

/**
 * Rounds to paise, half away from zero.
 *
 * Half-up is what Indian invoicing convention and every accountant expects; decimal.js defaults
 * to half-up already, but stating it means a change to the library default cannot silently
 * change what a customer is billed.
 */
export function toMoney(value: Money | string | number): Money {
  return new Decimal(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

/**
 * The largest figure a `Decimal(14, 2)` column holds: twelve digits before the point.
 *
 * Checked here rather than left to Postgres, because the database raises a numeric overflow
 * halfway through writing an invoice, whereas this produces a message naming the field.
 */
export const MAX_AMOUNT = new Decimal('999999999999.99');

/**
 * A figure the caller sent that this system will not store.
 *
 * A distinct class so the exception filter can answer 400 with the reason. These were plain
 * `Error`s, which the filter could only treat as unexpected — so sending a price of `1e999` or a
 * quantity with too many decimals produced "Something went wrong", a request id, and an entry in
 * the error log, for what is simply a bad field.
 *
 * This module stays free of Nest so the arithmetic can be tested and reasoned about on its own.
 */
export class MoneyInputError extends Error {}

/** Parses a value that arrived over HTTP. Rejects anything a money column could not hold. */
export function parseMoney(value: string | number | null | undefined): Money {
  if (value === null || value === undefined || value === '') {
    return ZERO;
  }
  let parsed: Money;
  try {
    parsed = new Decimal(value);
  } catch {
    throw new MoneyInputError(`"${String(value)}" is not a valid amount`);
  }
  if (!parsed.isFinite()) {
    throw new MoneyInputError(`"${String(value)}" is not a valid amount`);
  }
  if (parsed.abs().greaterThan(MAX_AMOUNT)) {
    throw new MoneyInputError(`"${String(value)}" is larger than this system records`);
  }
  return parsed;
}

/**
 * Parses a value that has to survive a round trip through a column of a given scale.
 *
 * Postgres does not refuse a value with more decimal places than the column holds — it rounds it
 * and says nothing. That is fine for a display field and wrong for money: a quantity of 1.2345
 * passed validation, the totals were computed from it, and `numeric(12,3)` then stored 1.235. On a
 * ₹50,000 unit price the stored line read "1.235 × 50000" beside a taxable value of 61,725, so the
 * invoice did not add up on its own face — by ₹25. A payment of 1000.005 was likewise banked as
 * 1000.01, a paisa more than was recorded, after the over-payment check had run on the other
 * figure.
 *
 * Refusing is the only honest option: silently rounding a figure somebody typed is how a customer
 * gets billed something they did not agree to.
 */
export function parseScaled(
  value: string | number | null | undefined,
  scale: number,
  label: string,
): Money {
  const parsed = parseMoney(value);
  if (parsed.decimalPlaces() > scale) {
    throw new MoneyInputError(
      `${label} is recorded to ${scale} decimal place${scale === 1 ? '' : 's'}; ` +
        `"${String(value)}" has more`,
    );
  }
  return parsed;
}

/**
 * A unit price as it should be shown.
 *
 * Two places normally, but up to four when the extra digits are real — because the column stores
 * four and the invoice has to add up on its own face. A per-hour rate of 1234.5678 shown as
 * "1234.57" against a quantity of 3 invites the reader to work out 3 × 1234.57 = 3703.71, while
 * the taxable value beside it says 3703.70: the figures are both right and the document
 * contradicts itself. Trailing zeros past the second place are dropped, so an ordinary price is
 * still the plain "100000.00" and only a price that needs the precision shows it.
 */
export function unitPriceText(price: Money): string {
  const full = price.toFixed(UNIT_PRICE_DP);
  const trimmed = full.replace(/0+$/, '');
  const [whole = '', fraction = ''] = trimmed.split('.');
  return fraction.length >= MONEY_DP ? trimmed : `${whole}.${fraction.padEnd(MONEY_DP, '0')}`;
}

export function sum(values: Money[]): Money {
  return values.reduce<Money>((total, value) => total.plus(value), ZERO);
}

/** Two amounts are equal to the paisa. Used rather than `.equals()` on unrounded intermediates. */
export function sameMoney(left: Money, right: Money): boolean {
  return toMoney(left).equals(toMoney(right));
}

export function isNegative(value: Money): boolean {
  return value.lessThan(0);
}

/**
 * The difference between a rounded total and the nearest rupee.
 *
 * Indian invoices normally present a whole-rupee total with the paise shown separately as a
 * rounding line, so the customer's payment matches the document exactly.
 */
export function roundingAdjustment(total: Money): Money {
  return toMoney(total.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).minus(total));
}

// -----------------------------------------------------------------------------------------------
// Amount in words — Indian numbering
// -----------------------------------------------------------------------------------------------

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99. The teens are irregular, so they come from the ONES table rather than a rule. */
function twoDigits(value: number): string {
  if (value < 20) {
    return ONES[value] ?? '';
  }
  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = ONES[value % 10] ?? '';
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * Writes an amount in words using the Indian system — lakh and crore, not million and billion.
 *
 * The grouping is genuinely different: after the first thousand, digits group in twos, so
 * 1,234,567 reads "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven".
 */
export function amountInWords(amount: Money, currencyLabel = 'Rupees'): string {
  const rounded = toMoney(amount);
  // `isNegative()` is true for a negative zero, which is what rounding -0.001 produces — that gave
  // "Minus Rupees Zero Only" on an invoice worth nothing.
  const negative = rounded.isNegative() && !rounded.isZero();
  const absolute = rounded.abs();

  // The only two `Number` conversions in the billing module, and they are safe: the amount has
  // already been rounded, so these are exact integers — whole rupees below the column's twelve
  // digits, and paise between 0 and 99 — and nothing computed from them is ever stored. They
  // exist because the words below are built by integer division, not by decimal arithmetic.
  const whole = Number(absolute.toDecimalPlaces(0, Decimal.ROUND_DOWN).toFixed(0));
  const paise = Number(absolute.minus(whole).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));

  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000);
  const rest = whole % 10_000_000;

  // A crore count is itself read in the Indian system, not as a plain "hundreds" number: 99,999
  // crore is "Ninety Nine Thousand Nine Hundred Ninety Nine Crore". Reading it as hundreds ran
  // `twoDigits` past its table and produced an empty string, so ₹999,999,999,999.99 — a figure
  // the column holds — came out as "Nine Hundred Ninety Nine Crore …", a hundredth of itself, on
  // the line of the document that legally states the amount.
  if (crore > 0) {
    parts.push(`${belowCrore(crore)} Crore`);
  }
  if (rest > 0) {
    parts.push(belowCrore(rest));
  }

  const rupees = parts.length > 0 ? parts.join(' ') : 'Zero';
  const sign = negative ? 'Minus ' : '';
  const paiseWords = paise > 0 ? ` and ${twoDigits(paise)} Paise` : '';
  return `${sign}${currencyLabel} ${rupees}${paiseWords} Only`;
}

/** Anything below one crore, grouped the Indian way: lakh, thousand, hundred, then the rest. */
function belowCrore(value: number): string {
  const parts: string[] = [];
  const lakh = Math.floor(value / 100_000);
  const thousand = Math.floor((value % 100_000) / 1_000);
  const hundred = Math.floor((value % 1_000) / 100);
  const rest = value % 100;

  if (lakh > 0) {
    parts.push(`${twoDigits(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${twoDigits(thousand)} Thousand`);
  }
  if (hundred > 0) {
    parts.push(`${ONES[hundred]} Hundred`);
  }
  if (rest > 0) {
    parts.push(twoDigits(rest));
  }
  return parts.join(' ');
}
