import { financialYearOf, invoiceNumberLabel, nextNumberFor } from './invoice-numbering';

describe('financialYearOf', () => {
  it('runs April to March by default', () => {
    // The Indian financial year, which is what the sequence resets on.
    expect(financialYearOf(new Date('2026-04-01T00:00:00Z'))).toBe('2026-27');
    expect(financialYearOf(new Date('2027-03-31T00:00:00Z'))).toBe('2026-27');
    expect(financialYearOf(new Date('2027-04-01T00:00:00Z'))).toBe('2027-28');
  });

  it('puts January to March in the previous year', () => {
    expect(financialYearOf(new Date('2026-01-15T00:00:00Z'))).toBe('2025-26');
  });

  it('honours a different start month', () => {
    // January start: the financial year is the calendar year.
    expect(financialYearOf(new Date('2026-01-01T00:00:00Z'), 1)).toBe('2026-27');
    expect(financialYearOf(new Date('2026-12-31T00:00:00Z'), 1)).toBe('2026-27');
  });

  it('pads a year that rolls into a new century', () => {
    expect(financialYearOf(new Date('2099-05-01T00:00:00Z'))).toBe('2099-00');
  });
});

describe('invoiceNumberLabel', () => {
  it('pads the sequence to four digits', () => {
    expect(invoiceNumberLabel('INV', '2026-27', 7)).toBe('INV/2026-27/0007');
    expect(invoiceNumberLabel('INV', '2026-27', 1234)).toBe('INV/2026-27/1234');
  });

  it('does not truncate a sequence past four digits', () => {
    expect(invoiceNumberLabel('INV', '2026-27', 12_345)).toBe('INV/2026-27/12345');
  });

  it('carries the financial year, so the same number in two years is distinct', () => {
    expect(invoiceNumberLabel('INV', '2026-27', 1)).not.toBe(
      invoiceNumberLabel('INV', '2027-28', 1),
    );
  });
});

describe('nextNumberFor', () => {
  it('continues the sequence within a year', () => {
    expect(nextNumberFor({ nextSequence: 8, sequenceYear: '2026-27' }, '2026-27')).toEqual({
      sequence: 8,
      financialYear: '2026-27',
    });
  });

  it('restarts at 1 in a new financial year', () => {
    // Otherwise the first invoice of the year would carry last year's count.
    expect(nextNumberFor({ nextSequence: 412, sequenceYear: '2025-26' }, '2026-27')).toEqual({
      sequence: 1,
      financialYear: '2026-27',
    });
  });

  it('starts at 1 for a profile that has never issued anything', () => {
    expect(nextNumberFor({ nextSequence: 1, sequenceYear: '' }, '2026-27')).toEqual({
      sequence: 1,
      financialYear: '2026-27',
    });
  });
});

describe('nextNumberFor and a back-dated invoice', () => {
  it('restarts at 1 when the financial year moves forward', () => {
    expect(nextNumberFor({ nextSequence: 57, sequenceYear: '2025-26' }, '2026-27')).toEqual({
      sequence: 1,
      financialYear: '2026-27',
    });
  });

  it('continues the current series for an invoice dated in a closed year', () => {
    // Restarting on any mismatch rewound the profile into the closed year. Every later invoice in
    // the current year then computed sequence 1 again, collided with a label already taken, and
    // failed on the unique index — and since `nextSequence` is not writable through the API, the
    // tenant could never issue another invoice.
    expect(nextNumberFor({ nextSequence: 57, sequenceYear: '2026-27' }, '2025-26')).toEqual({
      sequence: 57,
      financialYear: '2026-27',
    });
  });

  it('keeps counting within the same year', () => {
    expect(nextNumberFor({ nextSequence: 8, sequenceYear: '2026-27' }, '2026-27')).toEqual({
      sequence: 8,
      financialYear: '2026-27',
    });
  });
});
