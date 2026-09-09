/**
 * Turning one submitted invoice line into calculator input.
 *
 * Separate from the service because this is where a line is refused, and the reasons are worth
 * reading in one place. The money pattern in `dto/validation.ts` accepts a leading minus, because
 * a credit note and an adjustment need one; an invoice line does not. A negative price, a
 * discount larger than the line, or a rate outside 0–100 all produce a negative taxable value,
 * negative GST and a negative total — stored without complaint, and cheaper to refuse here than
 * to explain to an auditor later.
 */
import { BadRequestException } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import type { LineInput } from './invoice-calculator';
import type { LineInputDto } from './invoice-rows';
import { Decimal, MAX_AMOUNT, parseScaled } from './money';

const HUNDRED = new Decimal(100);

/**
 * How many decimal places each column actually keeps.
 *
 * Postgres rounds silently past these, so a figure with more precision than its column would be
 * stored as something the customer never agreed to and the line would stop adding up. The values
 * mirror `schema.prisma`; changing one there means changing it here.
 */
const SCALE = {
  quantity: 3,
  unitPrice: 4,
  taxRate: 2,
  discountPercent: 2,
  discountAmount: 2,
} as const;

/**
 * The largest each column holds, which is not the same as the largest a money column holds.
 *
 * `MAX_AMOUNT` is the bound for `numeric(14,2)`. `quantity` is `numeric(12,3)` and `unitPrice` is
 * `numeric(14,4)`, so both stop three or four orders of magnitude earlier — a quantity of
 * 1,000,000,000 passed the money check and then failed in Postgres as a bare numeric overflow,
 * a 500 halfway through writing an invoice.
 */
const MAX = {
  quantity: new Decimal('999999999.999'),
  unitPrice: new Decimal('9999999999.9999'),
} as const;

export function toLineInput(line: LineInputDto, defaultTaxRate: Prisma.Decimal): LineInput {
  const label = line.description;

  const quantity = parseScaled(line.quantity, SCALE.quantity, `The quantity on "${label}"`);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new BadRequestException(`"${label}" needs a quantity above zero`);
  }
  if (quantity.greaterThan(MAX.quantity)) {
    throw new BadRequestException(`The quantity on "${label}" is larger than this system records`);
  }

  const unitPrice = parseScaled(line.unitPrice, SCALE.unitPrice, `The price on "${label}"`);
  if (unitPrice.lessThan(0)) {
    throw new BadRequestException(`"${label}" cannot have a negative price`);
  }
  if (unitPrice.greaterThan(MAX.unitPrice)) {
    throw new BadRequestException(`The price on "${label}" is larger than this system records`);
  }

  const taxRate =
    line.taxRate === undefined
      ? new Decimal(defaultTaxRate)
      : parseScaled(line.taxRate, SCALE.taxRate, `The tax rate on "${label}"`);
  if (taxRate.lessThan(0) || taxRate.greaterThan(HUNDRED)) {
    throw new BadRequestException(`"${label}" needs a tax rate between 0 and 100`);
  }

  const discountPercent = line.discountPercent
    ? parseScaled(line.discountPercent, SCALE.discountPercent, `The discount on "${label}"`)
    : undefined;
  if (discountPercent && (discountPercent.lessThan(0) || discountPercent.greaterThan(HUNDRED))) {
    throw new BadRequestException(`"${label}" needs a discount between 0 and 100%`);
  }

  const discountAmount = line.discountAmount
    ? parseScaled(line.discountAmount, SCALE.discountAmount, `The discount on "${label}"`)
    : undefined;
  if (discountAmount?.lessThan(0)) {
    throw new BadRequestException(`"${label}" cannot have a negative discount`);
  }

  // Percentage and fixed discount can be given together, so the check is on their sum.
  const gross = quantity.times(unitPrice);
  const discount = (
    discountPercent ? gross.times(discountPercent).dividedBy(HUNDRED) : new Decimal(0)
  )
    .plus(discountAmount ?? 0)
    .toDecimalPlaces(2);
  if (discount.greaterThan(gross)) {
    throw new BadRequestException(`The discount on "${label}" is more than the line is worth`);
  }
  // The product, too. Each factor can be well inside its own column and their product still past
  // what a money column holds — 1,000,000 × 10,000,000 is a valid quantity and a valid price.
  if (gross.greaterThan(MAX_AMOUNT)) {
    throw new BadRequestException(`"${label}" comes to more than this system records`);
  }

  return {
    description: label.trim(),
    hsnSac: line.hsnSac?.trim() ?? '',
    quantity,
    unitPrice,
    discountPercent,
    discountAmount,
    taxRate,
  };
}
