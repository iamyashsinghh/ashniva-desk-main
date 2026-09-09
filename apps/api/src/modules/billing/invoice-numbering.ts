/**
 * Invoice numbering.
 *
 * Two rules an invoice sequence has to keep, and both matter to an auditor: no duplicates, and
 * no unexplained gaps. Duplicates are prevented by taking the number inside the same transaction
 * that creates the invoice (see `InvoiceNumberService`); gaps are prevented by never reusing a
 * number — a withdrawn invoice is voided, not deleted.
 */

/** The financial year a date falls in, as "2026-27". */
export function financialYearOf(date: Date, startMonth = 4): string {
  const year = date.getUTCFullYear();
  // getUTCMonth is zero-based; startMonth is human (4 = April).
  const month = date.getUTCMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
}

/**
 * The printed identifier.
 *
 * Prefix, financial year and a zero-padded sequence: "INV/2026-27/0007". The year is part of the
 * label because the sequence restarts each year, so the number alone would not be unique.
 */
export function invoiceNumberLabel(
  prefix: string,
  financialYear: string,
  sequence: number,
): string {
  return `${prefix}/${financialYear}/${String(sequence).padStart(4, '0')}`;
}

/**
 * What the next number should be, given the profile's stored position.
 *
 * A *newer* financial year restarts at 1. Returning both the sequence and the year means the
 * caller writes back a consistent pair rather than incrementing a counter that belongs to last
 * year.
 *
 * The returned year is authoritative for three things, and the caller owes all three: the printed
 * label, the profile's `sequenceYear`, and the invoice's own `financialYear` column. Writing only
 * the first two is what left a back-dated invoice numbered in one year and filed under another.
 *
 * The direction matters. Restarting on any mismatch meant issuing one back-dated draft rewound
 * the profile to the closed year — and every later invoice in the current year then computed
 * sequence 1 again, collided with a label already taken, and failed on the unique index. Since
 * `nextSequence` is deliberately not writable through the API, that left the tenant unable to
 * issue anything, permanently. A back-dated invoice therefore continues the current counter and
 * carries the current year in its label; it is the rarer case, and a shared sequence is a far
 * smaller problem than a dead one.
 *
 * `financialYearOf` returns `YYYY-YY`, which is lexicographically ordered, so a string comparison
 * is a chronological one.
 */
export function nextNumberFor(
  profile: { nextSequence: number; sequenceYear: string },
  financialYear: string,
): { sequence: number; financialYear: string } {
  if (financialYear > profile.sequenceYear) {
    return { sequence: 1, financialYear };
  }
  return { sequence: profile.nextSequence, financialYear: profile.sequenceYear };
}
