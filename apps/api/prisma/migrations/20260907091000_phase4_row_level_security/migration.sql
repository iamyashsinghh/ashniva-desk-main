-- Row-level security for the Phase 4 tables.
--
-- Same shape as every other tenant table: the provider's staff see all tenants (their API
-- permissions decide what they may then do), a client tenant sees only rows that belong to it,
-- and a connection with no tenant set — sign-in, background jobs, the seed, migrations — is
-- allowed through because those paths are trusted code and the repositories filter by
-- organization as the first layer.
--
-- Two of these tables are client-visible and the rest are not, and the difference matters:
--
--   uat_requests           a client decides on their own UAT, so they must see their own rows
--   testing_assignments    a UAT assignment belongs to a client organization; QA, retest and
--                          live-verification assignments do not, and a client must never see one
--
-- Everything else here — results, environments, accounts, grants, the access log, releases and
-- their approvals — is internal. The provider branch is the only way in, so a client tenant
-- matches nothing rather than matching by accident through a join.
--
-- Child tables reach their parent rather than carrying `organization_id` twice, so a parent that
-- becomes invisible takes its children with it and the two cannot disagree.

-- ---------------------------------------------------------------------------------------------
-- Testing
-- ---------------------------------------------------------------------------------------------

ALTER TABLE testing_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE testing_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON testing_assignments
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    -- A client sees its own UAT assignment and nothing else. `client_organization_id` is null on
    -- every internal kind, so this branch cannot widen to QA or live verification.
    OR (kind = 'UAT' AND client_organization_id = app_tenant_id())
  );

ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON test_results
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

ALTER TABLE test_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_environments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON test_environments
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

-- A test login is provider-internal whatever project it belongs to. There is no client branch on
-- purpose: a client organization must not be able to read a staging credential row at all, let
-- alone its ciphertext.
ALTER TABLE test_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON test_accounts
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

ALTER TABLE credential_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credential_grants
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

ALTER TABLE credential_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credential_access_log
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

-- ---------------------------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------------------------

ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON releases
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

ALTER TABLE release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_items
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM releases r
      WHERE r.id = release_items.release_id
        AND r.organization_id = app_tenant_id()
    )
  );

ALTER TABLE release_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_approvals
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

ALTER TABLE release_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_history
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM releases r
      WHERE r.id = release_history.release_id
        AND r.organization_id = app_tenant_id()
    )
  );

ALTER TABLE project_release_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_release_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_release_policy
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
  );

-- ---------------------------------------------------------------------------------------------
-- Client UAT
-- ---------------------------------------------------------------------------------------------

-- The one table in this migration a client is meant to read. Scoped by the client organization
-- the request was raised for, so one client cannot see another's sign-off.
ALTER TABLE uat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON uat_requests
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR client_organization_id = app_tenant_id()
  );
