-- Bring `invoices.financial_year` into line with the year its number was actually taken from.
--
-- The column was written once, at create time, from the draft's issue date. Issuing then built
-- the label from `nextNumberFor`, which continues the *current* series for a draft dated in a
-- closed year — deliberately, because restarting on any mismatch rewinds the profile counter and
-- leaves the tenant unable to issue anything. Nothing wrote that year back to the invoice, so a
-- back-dated invoice came out numbered "INV/2026-27/0042" and filed under "2025-26".
--
-- Issuing now writes the column. This is the same correction for rows issued before that.
--
-- The label is the evidence: `invoicePrefix` is validated as [A-Z0-9-]{1,10}, so an issued label
-- is exactly PREFIX/YYYY-YY/NNNN. The pattern is anchored at the end anyway, so a prefix stored
-- before that validation existed cannot make this match the wrong segment.
--
-- Only rows that actually disagree are touched, and only ones that carry a real number: a draft's
-- label is "DRAFT-<millis>-<random>", which the pattern does not match. Re-running changes
-- nothing, because the first run makes the predicate false.

UPDATE invoices
SET financial_year = substring(number_label FROM '/([0-9]{4}-[0-9]{2})/[0-9]+$')
WHERE status <> 'DRAFT'
  AND number_label ~ '/[0-9]{4}-[0-9]{2}/[0-9]+$'
  AND financial_year IS DISTINCT FROM substring(number_label FROM '/([0-9]{4}-[0-9]{2})/[0-9]+$');
