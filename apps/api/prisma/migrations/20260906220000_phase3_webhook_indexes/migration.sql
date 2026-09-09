-- Two index corrections on the webhook path.

-- ---------------------------------------------------------------------------------------------
-- 1. Webhook de-duplication has to be per tenant.
--
-- `(provider, external_event_id)` was global. Two organizations may link the same repository —
-- `repository_links` is unique per connection, not per repository — and when the provider sends no
-- delivery header the id falls back to a digest of the body, which is byte-identical for both. So
-- one tenant's recorded event silently suppressed the other's genuine event: the second delivery
-- was answered "duplicate" and its commits were never stored.
--
-- `organization_id` is NOT NULL on this table, so the wider key is exact rather than inert.
-- ---------------------------------------------------------------------------------------------

DROP INDEX IF EXISTS "integration_events_provider_external_event_id_key";

-- Named explicitly: the default would be 65 characters and Postgres silently truncates
-- at 63, which leaves the schema and the database disagreeing about what it is called.
CREATE UNIQUE INDEX "ux_integration_events_org_provider_event"
  ON "integration_events"("organization_id", "provider", "external_event_id");

-- ---------------------------------------------------------------------------------------------
-- 2. The webhook's tenant lookup needs an index.
--
-- Resolving a delivery reads `repository_links` by (provider, external_repo_id). That runs before
-- any authentication, on an endpoint anybody can post to, with a repository id that is public
-- information — and it was a sequential scan. Not unique: two tenants may hold the same pair.
-- ---------------------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "repository_links_provider_external_repo_id_idx"
  ON "repository_links"("provider", "external_repo_id");
