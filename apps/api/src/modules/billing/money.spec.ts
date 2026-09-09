import {
  Decimal,
  MoneyInputError,
  amountInWords,
  parseMoney,
  parseScaled,
  roundingAdjustment,
  sameMoney,
  sum,
  toMoney,
  unitPriceText,
} from './money';

const d = (value: string | number) => new Decimal(value);

describe('toMoney', () => {
  it('rounds to paise, half away from zero', () => {
    expect(toMoney('2.345').toFixed(2)).toBe('2.35');
    expect(toMoney('2.344').toFixed(2)).toBe('2.34');
    expect(toMoney('-2.345').toFixed(2)).toBe('-2.35');
  });

  it('does not accumulate the error a float would', () => {
    expect(d('0.1').plus('0.2').toFixed(2)).toBe('0.30');
    expect(sum([d('0.1'), d('0.2'), d('0.3')]).toFixed(2)).toBe('0.60');
  });
});

describe('parseMoney', () => {
  it('accepts a string, a number and an empty value', () => {
    expect(parseMoney('1234.56').toFixed(2)).toBe('1234.56');
    expect(parseMoney(1234.56).toFixed(2)).toBe('1234.56');
    expect(parseMoney(null).toFixed(2)).toBe('0.00');
    expect(parseMoney('').toFixed(2)).toBe('0.00');
  });

  it('refuses something that is not a number', () => {
    // Better to fail here than to write NaN into a money column.
    expect(() => parseMoney('twelve')).toThrow(/not a valid amount/);
    expect(() => parseMoney('12,34')).toThrow(/not a valid amount/);
  });

  it('refuses an amount the money column could not hold', () => {
    // Decimal(14, 2) tops out at twelve digits; catching it here names the field, whereas
    // Postgres would raise a numeric overflow halfway through writing the invoice.
    expect(() => parseMoney('1e999')).toThrow(/larger than/);
    expect(() => parseMoney('1000000000000')).toThrow(/larger than/);
    expect(parseMoney('999999999999.99').toFixed(2)).toBe('999999999999.99');
  });
});

describe('sameMoney', () => {
  it('compares to the paisa, not to full precision', () => {
    expect(sameMoney(d('10.001'), d('10.004'))).toBe(true);
    expect(sameMoney(d('10.001'), d('10.009'))).toBe(false);
  });
});

describe('roundingAdjustment', () => {
  it('is the distance to the nearest rupee', () => {
    expect(roundingAdjustment(d('1456.78')).toFixed(2)).toBe('0.22');
    expect(roundingAdjustment(d('1000.20')).toFixed(2)).toBe('-0.20');
    expect(roundingAdjustment(d('1000.00')).toFixed(2)).toBe('0.00');
  });
});

describe('amountInWords', () => {
  it('writes small amounts', () => {
    expect(amountInWords(d(0))).toBe('Rupees Zero Only');
    expect(amountInWords(d(1))).toBe('Rupees One Only');
    expect(amountInWords(d(19))).toBe('Rupees Nineteen Only');
    expect(amountInWords(d(20))).toBe('Rupees Twenty Only');
    expect(amountInWords(d(42))).toBe('Rupees Forty Two Only');
    expect(amountInWords(d(100))).toBe('Rupees One Hundred Only');
  });

  it('uses the Indian grouping, not millions', () => {
    // 1,234,567 is twelve lakh, not one point two million.
    expect(amountInWords(d(1_234_567))).toBe(
      'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only',
    );
    expect(amountInWords(d(100_000))).toBe('Rupees One Lakh Only');
    expect(amountInWords(d(10_000_000))).toBe('Rupees One Crore Only');
  });

  it('handles more than a hundred crore', () => {
    expect(amountInWords(d(1_230_000_000))).toBe('Rupees One Hundred Twenty Three Crore Only');
  });

  it('includes the paise', () => {
    expect(amountInWords(d('1180.50'))).toBe(
      'Rupees One Thousand One Hundred Eighty and Fifty Paise Only',
    );
    expect(amountInWords(d('0.05'))).toBe('Rupees Zero and Five Paise Only');
  });

  it('rounds the paise rather than truncating them', () => {
    expect(amountInWords(d('99.999'))).toContain('One Hundred');
  });

  it('marks a negative amount', () => {
    expect(amountInWords(d('-500'))).toBe('Minus Rupees Five Hundred Only');
  });

  it('takes a different currency label', () => {
    expect(amountInWords(d(100), 'Dollars')).toBe('Dollars One Hundred Only');
  });

  it('never produces double spaces or a trailing gap', () => {
    for (const value of [0, 1, 10, 100, 1000, 100_000, 10_000_000, 1_234_567, 90_909_090]) {
      const words = amountInWords(d(value));
      expect(words).not.toMatch(/\s{2}/);
      expect(words).toBe(words.trim());
    }
  });
});

describe('parseScaled', () => {
  it('accepts a value the column can hold exactly', () => {
    expect(parseScaled('1.235', 3, 'The quantity').toString()).toBe('1.235');
    expect(parseScaled('12.3456', 4, 'The price').toString()).toBe('12.3456');
    expect(parseScaled('1000', 2, 'A payment amount').toString()).toBe('1000');
  });

  it('refuses more decimal places than the column keeps', () => {
    // Postgres rounds silently past the column scale. A quantity of 1.2345 was accepted, the
    // totals were computed from it, and numeric(12,3) stored 1.235 — so on a ₹50,000 unit price
    // the stored line read "1.235 × 50000" beside a taxable value of 61,725, out by ₹25.
    expect(() => parseScaled('1.2345', 3, 'The quantity')).toThrow(/3 decimal places/);
    // A payment of 1000.005 was banked as 1000.01, a paisa more than was recorded.
    expect(() => parseScaled('1000.005', 2, 'A payment amount')).toThrow(/2 decimal places/);
  });

  it('names the field so the message is actionable', () => {
    expect(() => parseScaled('1.2345', 3, 'The quantity on "Support"')).toThrow(
      /The quantity on "Support"/,
    );
  });

  it('throws MoneyInputError so the filter can answer 400 rather than 500', () => {
    // These were plain Errors, which the exception filter could only treat as unexpected: a bad
    // field produced "Something went wrong" and an entry in the error log.
    expect(() => parseScaled('1.2345', 3, 'The quantity')).toThrow(MoneyInputError);
    expect(() => parseMoney('1e999')).toThrow(MoneyInputError);
    expect(() => parseMoney('not a number')).toThrow(MoneyInputError);
  });
});

describe('amountInWords at the top of the range', () => {
  it('reads a crore count in the Indian system, not as hundreds', () => {
    // The crore count was read with a two-digit table, which ran off the end and produced an
    // empty string — so the largest figure the column holds came out a hundredth of itself, on
    // the line of a tax invoice that legally states the amount.
    expect(amountInWords(d('999999999999.99'))).toBe(
      'Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Crore Ninety Nine Lakh ' +
        'Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise Only',
    );
    expect(amountInWords(d('100000000000'))).toBe('Rupees Ten Thousand Crore Only');
    expect(amountInWords(d('10000000000'))).toBe('Rupees One Thousand Crore Only');
  });

  it('never emits a doubled space', () => {
    for (const value of ['999999999999.99', '100000000000', '10000000000', '1000000000']) {
      expect(amountInWords(d(value))).not.toContain('  ');
    }
  });

  it('still reads the ordinary magnitudes', () => {
    expect(amountInWords(d('12345678.90'))).toBe(
      'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight ' +
        'and Ninety Paise Only',
    );
    expect(amountInWords(d('1234567'))).toBe(
      'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only',
    );
  });

  it('does not call a rounded-away amount negative', () => {
    // -0.001 rounds to a negative zero, and `isNegative()` is true for that.
    expect(amountInWords(d('-0.001'))).toBe('Rupees Zero Only');
  });
});

/**
 * Issue #10: `unitPrice` is a variable-precision string, and that is the contract.
 *
 * Two places minimum, four maximum. It widened in PR #5 so the printed rate multiplies out to the
 * stored taxable value instead of contradicting it. Pinned here because the field crosses the API
 * boundary on the internal and portal responses and on the PDF: a future change back to a fixed
 * `toFixed(2)` would silently reintroduce an invoice that disagrees with itself.
 *
 * In-repo consumers were re-checked on this branch and all three interpolate it as an opaque
 * string — `InvoiceDetailPage`, `PortalInvoiceDetailPage`, the mobile `InvoiceDetailScreen`. The
 * web editor is create-only and never seeds from `lineItems`, so nothing round-trips the format.
 * Consumers outside this repository remain unverified, which is why the issue stays open.
 */
describe('unitPriceText — the published contract', () => {
  it('never returns fewer than two decimal places', () => {
    for (const value of ['0', '1', '100000', '1234.5']) {
      expect(unitPriceText(new Decimal(value)).split('.')[1]?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('never returns more than four', () => {
    for (const value of ['1234.5678', '0.0001', '999999999.9999']) {
      expect(unitPriceText(new Decimal(value)).split('.')[1]?.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('unitPriceText', () => {
  it('shows an ordinary price in two places', () => {
    expect(unitPriceText(new Decimal('100000'))).toBe('100000.00');
    expect(unitPriceText(new Decimal('1234.5'))).toBe('1234.50');
    expect(unitPriceText(new Decimal('0'))).toBe('0.00');
  });

  it('keeps the extra places when the stored price has them', () => {
    // The column stores four. Rounding to two on the way out makes the invoice contradict itself.
    expect(unitPriceText(new Decimal('1234.5678'))).toBe('1234.5678');
    expect(unitPriceText(new Decimal('1234.567'))).toBe('1234.567');
    expect(unitPriceText(new Decimal('1234.5600'))).toBe('1234.56');
  });

  it('lets quantity times rate reconcile with the taxable value', () => {
    // Three hours at 1234.5678 is 3703.7034, which stores as 3703.70. A reader multiplying the
    // printed rate has to arrive at the same figure; at two places they got 3703.71.
    const price = new Decimal('1234.5678');
    const quantity = new Decimal('3');
    const printed = new Decimal(unitPriceText(price));
    expect(toMoney(printed.times(quantity)).toFixed(2)).toBe(
      toMoney(price.times(quantity)).toFixed(2),
    );
  });
});
