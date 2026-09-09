-- One correction to one permission description.
--
-- `invoice:void` used to say "Cancel or void an invoice", because it guarded both. Issue #14
-- split them: cancelling a draft nobody was sent is an ordinary correction and now needs
-- `invoice:cancel`, while void — which keeps a spent number against a document a client relied on
-- — stays where it was. Leaving the old text on the roles-and-permissions screen would tell an
-- administrator this permission grants something it no longer does, which on a security screen is
-- worse than saying nothing.
--
-- Deliberately its own migration rather than part of 20260914090000_billing_messaging_permissions.
-- Permission rollout migrations are required to be purely additive — `permission-rollout.e2e-spec`
-- enforces that no such file contains a DELETE, UPDATE, TRUNCATE, DROP or ALTER — because those
-- are the statements that could take a grant away from somebody. That invariant is worth more
-- than the convenience of one extra file, so this correction sits outside it where it is visible.
--
-- Narrow and idempotent: it matches on the exact previous text and touches one row, so an
-- installation whose administrator edited the description keeps their own words, and running it
-- twice changes nothing the second time. It grants nothing and revokes nothing.
UPDATE permissions
SET description = 'Void an issued invoice, keeping its number spent'
WHERE key = 'invoice:void'
  AND description = 'Cancel or void an invoice';
