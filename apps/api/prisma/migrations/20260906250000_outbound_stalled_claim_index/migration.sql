-- An index for the stalled-claim sweep.
--
-- `claimForSending` matches QUEUED only, so a worker killed mid-send leaves a row in SENDING that
-- nothing can claim, no receipt can match and no screen can act on. The sweep is the one way out
-- of that state: every five minutes it fails claims older than the threshold.
--
-- It runs across every tenant, so it has no `organization_id` to lead with and cannot use
-- `outbound_messages_organization_id_status_idx`. Without this index the sweep is a sequential
-- scan of the whole table, every five minutes, on a table that only grows.
--
-- `status` first because it is the equality predicate; `updated_at` second so the age comparison
-- is a range scan within it. `updated_at` is the claim time: on a row that is still SENDING the
-- claim is by definition its most recent write.

CREATE INDEX IF NOT EXISTS "outbound_messages_status_updated_at_idx"
  ON "outbound_messages" ("status", "updated_at");
