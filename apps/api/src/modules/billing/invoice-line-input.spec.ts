import { BadRequestException } from '@nestjs/common';

import { toLineInput } from './invoice-line-input';
import { Decimal } from './money';
import type { LineInputDto } from './invoice-rows';

/**
 * The money pattern the DTOs share accepts a leading minus, because credit notes need one. These
 * are the values it lets through that an invoice line must still refuse — each of them produces a
 * negative total that would otherwise be stored without complaint.
 */

const DEFAULT_RATE = new Decimal(18);

function line(overrides: Partial<LineInputDto> = {}): LineInputDto {
  return { description: 'Support', quantity: '2', unitPrice: '1000', ...overrides };
}

describe('toLineInput', () => {
  it('accepts an ordinary line', () => {
    const result = toLineInput(line(), DEFAULT_RATE);
    expect(result.quantity.toFixed(2)).toBe('2.00');
    expect(result.unitPrice.toFixed(2)).toBe('1000.00');
    expect(result.taxRate.toFixed(2)).toBe('18.00');
  });

  it('refuses a quantity of zero or less', () => {
    expect(() => toLineInput(line({ quantity: '0' }), DEFAULT_RATE)).toThrow(BadRequestException);
    expect(() => toLineInput(line({ quantity: '-1' }), DEFAULT_RATE)).toThrow(BadRequestException);
  });

  it('refuses a negative price', () => {
    expect(() => toLineInput(line({ unitPrice: '-500' }), DEFAULT_RATE)).toThrow(
      /cannot have a negative price/,
    );
  });

  it('refuses a tax rate outside 0 to 100', () => {
    expect(() => toLineInput(line({ taxRate: '-5' }), DEFAULT_RATE)).toThrow(/tax rate/);
    expect(() => toLineInput(line({ taxRate: '120' }), DEFAULT_RATE)).toThrow(/tax rate/);
    expect(toLineInput(line({ taxRate: '0' }), DEFAULT_RATE).taxRate.toFixed(2)).toBe('0.00');
  });

  it('refuses a discount percentage above 100', () => {
    expect(() => toLineInput(line({ discountPercent: '200' }), DEFAULT_RATE)).toThrow(
      /discount between 0 and 100/,
    );
  });

  it('refuses a fixed discount larger than the line', () => {
    // 2 × 1000 = 2000.
    expect(() => toLineInput(line({ discountAmount: '2500' }), DEFAULT_RATE)).toThrow(
      /more than the line is worth/,
    );
    expect(toLineInput(line({ discountAmount: '2000' }), DEFAULT_RATE)).toBeTruthy();
  });

  it('adds a percentage and a fixed discount before comparing them to the line', () => {
    // 60% of 2000 is 1200; another 900 takes the pair past the 2000 the line is worth, even
    // though neither is too large on its own.
    expect(() =>
      toLineInput(line({ discountPercent: '60', discountAmount: '900' }), DEFAULT_RATE),
    ).toThrow(/more than the line is worth/);
  });

  it('refuses a negative discount, which would be a price rise in disguise', () => {
    expect(() => toLineInput(line({ discountAmount: '-100' }), DEFAULT_RATE)).toThrow(
      /negative discount/,
    );
  });
});

describe('precision the column cannot keep', () => {
  it('refuses a quantity with more than three decimal places', () => {
    // `quantity` is numeric(12,3). 1.2345 would be stored as 1.235 while the totals were computed
    // from 1.2345, so the stored line would not multiply out to its own taxable value.
    expect(() => toLineInput(line({ quantity: '1.2345' }), DEFAULT_RATE)).toThrow(
      /3 decimal places/,
    );
    expect(toLineInput(line({ quantity: '1.234' }), DEFAULT_RATE).quantity.toString()).toBe(
      '1.234',
    );
  });

  it('refuses a price with more than four decimal places', () => {
    expect(() => toLineInput(line({ unitPrice: '12.34565' }), DEFAULT_RATE)).toThrow(
      /4 decimal places/,
    );
    expect(toLineInput(line({ unitPrice: '12.3456' }), DEFAULT_RATE).unitPrice.toString()).toBe(
      '12.3456',
    );
  });

  it('refuses a rate or a discount with more than two decimal places', () => {
    expect(() => toLineInput(line({ taxRate: '18.005' }), DEFAULT_RATE)).toThrow(
      /2 decimal places/,
    );
    // 99.999 would have been stored as 100.00 — a full discount nobody asked for.
    expect(() => toLineInput(line({ discountPercent: '99.999' }), DEFAULT_RATE)).toThrow(
      /2 decimal places/,
    );
    expect(() => toLineInput(line({ discountAmount: '10.005' }), DEFAULT_RATE)).toThrow(
      /2 decimal places/,
    );
  });
});

describe('figures larger than the column holds', () => {
  it('refuses a quantity past numeric(12,3)', () => {
    // Inside MAX_AMOUNT, past the quantity column — this used to reach Postgres as a bare
    // numeric overflow, a 500 halfway through writing the invoice.
    expect(() => toLineInput(line({ quantity: '1000000000' }), DEFAULT_RATE)).toThrow(
      /larger than this system records/,
    );
  });

  it('refuses a price past numeric(14,4)', () => {
    expect(() => toLineInput(line({ unitPrice: '99999999999' }), DEFAULT_RATE)).toThrow(
      /larger than this system records/,
    );
  });

  it('refuses a product past what a money column holds', () => {
    // Each factor is well inside its own column; the product is not.
    expect(() =>
      toLineInput(line({ quantity: '1000000', unitPrice: '10000000' }), DEFAULT_RATE),
    ).toThrow(/more than this system records/);
  });
});
