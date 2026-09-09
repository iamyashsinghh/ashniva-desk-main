-- One correction to one permission description.
--
-- `call:read-internal` used to say it granted recordings, and from package 9 onwards it does not:
-- playing a recording needs `call:play-recording`. Leaving the old text on the roles-and-
-- permissions screen would tell an administrator that a permission does something it no longer
-- does, which on a security screen is worse than saying nothing.
--
-- Deliberately its own migration rather than part of 20260912091000_call_recording_permission.
-- Permission rollout migrations are required to be purely additive — `permission-rollout.e2e-spec`
-- enforces that no such file contains a DELETE, UPDATE, TRUNCATE, DROP or ALTER — because those
-- are the statements that could take a grant away from somebody. That invariant is worth more
-- than the convenience of one extra file, so this correction sits outside it where it is visible.
--
-- Narrow and idempotent: it matches on the exact previous text and touches one row, so an
-- installation whose administrator edited the description keeps their own words, and running it
-- twice changes nothing the second time. It grants nothing and revokes nothing.
UPDATE permissions
SET description = 'See the internal call history on a ticket and its internal call notes'
WHERE key = 'call:read-internal'
  AND description = 'See call recordings and internal call notes';
