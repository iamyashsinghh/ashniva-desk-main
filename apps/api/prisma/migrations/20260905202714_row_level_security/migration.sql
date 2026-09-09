-- Row-level security (Phase 2).
--
-- How it works: the API stamps every pooled connection with the tenant of the current request
-- (SET ROLE ashniva_app; set_config('app.tenant_id', …)) — see src/database/tenant-aware-pool.ts.
-- Policies below then hide rows of other tenants even from a query that forgot its filter. When
-- no tenant is set (sign-in, background jobs, the seed, migrations) the policies allow everything:
-- those paths are trusted code, and repositories keep filtering by organization as the first layer.
--
-- FORCE ROW LEVEL SECURITY makes the policies apply to the table owner too; the application role
-- is deliberately not a superuser and has NOBYPASSRLS, because superusers always bypass RLS.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- The service provider serves every client organization, so its staff see all tenants' rows
-- (their own API permissions decide what they may do with them). Client tenants see only theirs.
-- organizations carries no policy, so this lookup cannot recurse.
CREATE OR REPLACE FUNCTION app_tenant_is_provider() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT EXISTS (SELECT 1 FROM organizations o WHERE o.id = app_tenant_id() AND o.is_service_provider) $$;

-- ---------------------------------------------------------------------------------------------
-- Application role
-- ---------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ashniva_app') THEN
    CREATE ROLE ashniva_app NOLOGIN NOBYPASSRLS;
  END IF;
  -- The connecting user (migration owner) must be allowed to SET ROLE to the application role.
  EXECUTE format('GRANT ashniva_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO ashniva_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ashniva_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ashniva_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ashniva_app;
-- Tables created by later migrations (run by the same owner) get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashniva_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashniva_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ashniva_app;

-- ---------------------------------------------------------------------------------------------
-- Policies. One policy per table covering every command (USING doubles as WITH CHECK).
-- Shape: no tenant (trusted path) OR provider tenant OR the row belongs to the client tenant.
-- ---------------------------------------------------------------------------------------------

-- Provider-scoped tables: visible to the organization that owns the row.
CREATE OR REPLACE FUNCTION app_rls_enable_org(tbl regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id())',
    tbl);
END $$;

-- Dual-scoped tables: the provider that owns the row and the client organization it is for.
CREATE OR REPLACE FUNCTION app_rls_enable_dual(tbl regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR client_organization_id = app_tenant_id())',
    tbl);
END $$;

-- Child tables: visible whenever the parent row is (the parent''s own policy decides).
CREATE OR REPLACE FUNCTION app_rls_enable_child(tbl regclass, parent regclass, fk text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %1$s USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR EXISTS (SELECT 1 FROM %2$s p WHERE p.id = %1$s.%3$I))',
    tbl, parent, fk);
END $$;

SELECT app_rls_enable_org('teams');
SELECT app_rls_enable_org('task_categories');
SELECT app_rls_enable_org('work_logs');
SELECT app_rls_enable_org('daily_reports');
SELECT app_rls_enable_org('user_invitations');
SELECT app_rls_enable_org('contract_hour_ledger');
SELECT app_rls_enable_org('milestones');

SELECT app_rls_enable_dual('projects');
SELECT app_rls_enable_dual('tickets');
SELECT app_rls_enable_dual('client_updates');
SELECT app_rls_enable_dual('contracts');
SELECT app_rls_enable_dual('change_requests');
SELECT app_rls_enable_dual('approval_requests');

-- audit_logs is append-only: any tenant may write an entry (a client's action on a provider
-- ticket is recorded against the provider), reading stays within the tenant. Rows without an
-- organization (sign-in failures) are visible to everyone allowed to read the audit log.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_read ON audit_logs FOR SELECT
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id IS NULL OR organization_id = app_tenant_id());
CREATE POLICY tenant_isolation_insert ON audit_logs FOR INSERT WITH CHECK (true);

-- Milestones are also readable by the client organization of their project (portal).
DROP POLICY IF EXISTS tenant_isolation ON milestones;
CREATE POLICY tenant_isolation ON milestones USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR organization_id = app_tenant_id()
  OR EXISTS (SELECT 1 FROM projects p WHERE p.id = milestones.project_id AND p.client_organization_id = app_tenant_id())
);

-- The hour ledger is readable by the contract's client (remaining hours on the portal).
DROP POLICY IF EXISTS tenant_isolation ON contract_hour_ledger;
CREATE POLICY tenant_isolation ON contract_hour_ledger USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR organization_id = app_tenant_id()
  OR EXISTS (SELECT 1 FROM contracts c WHERE c.id = contract_hour_ledger.contract_id AND c.client_organization_id = app_tenant_id())
);

-- SLA policies: the provider's own, plus the ones scoped to the client organization.
ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sla_policies
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR client_organization_id = app_tenant_id());

-- Tasks: the provider, or the client organization of the task's project.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR organization_id = app_tenant_id()
  OR EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id AND p.client_organization_id = app_tenant_id())
);

-- Comments: the provider sees all; a client sees client-visible comments on its own work.
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON comments USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR organization_id = app_tenant_id()
  OR (
    visibility = 'CLIENT' AND (
      EXISTS (SELECT 1 FROM tickets t WHERE t.id = comments.ticket_id AND t.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM tasks k JOIN projects p ON p.id = k.project_id WHERE k.id = comments.task_id AND p.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM change_requests r WHERE r.id = comments.change_request_id AND r.client_organization_id = app_tenant_id())
    )
  )
);

-- Files: the provider sees all; a client sees client-visible files attached to its own work.
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR organization_id = app_tenant_id()
  OR (
    visibility = 'CLIENT' AND (
      EXISTS (SELECT 1 FROM tickets t WHERE t.id = files.ticket_id AND t.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = files.project_id AND p.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM tasks k JOIN projects p ON p.id = k.project_id WHERE k.id = files.task_id AND p.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM contracts c WHERE c.id = files.contract_id AND c.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM change_requests r WHERE r.id = files.change_request_id AND r.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM approval_requests a WHERE a.id = files.approval_id AND a.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = files.milestone_id AND p.client_organization_id = app_tenant_id())
    )
  )
);

-- Child tables follow their parent.
SELECT app_rls_enable_child('team_members', 'teams', 'team_id');
SELECT app_rls_enable_child('project_members', 'projects', 'project_id');
SELECT app_rls_enable_child('task_status_history', 'tasks', 'task_id');
SELECT app_rls_enable_child('ticket_status_history', 'tickets', 'ticket_id');
SELECT app_rls_enable_child('ticket_sla', 'tickets', 'ticket_id');
SELECT app_rls_enable_child('sla_events', 'tickets', 'ticket_id');
SELECT app_rls_enable_child('sla_policy_rules', 'sla_policies', 'policy_id');
SELECT app_rls_enable_child('contract_periods', 'contracts', 'contract_id');
SELECT app_rls_enable_child('payment_milestones', 'contracts', 'contract_id');
SELECT app_rls_enable_child('milestone_deliverables', 'milestones', 'milestone_id');
SELECT app_rls_enable_child('milestone_dependencies', 'milestones', 'milestone_id');
SELECT app_rls_enable_child('milestone_history', 'milestones', 'milestone_id');
SELECT app_rls_enable_child('change_request_history', 'change_requests', 'change_request_id');
SELECT app_rls_enable_child('approval_history', 'approval_requests', 'approval_id');

-- Notifications belong to a person inside an organization. Any tenant may create one for
-- another organization's user (the provider notifies its clients); reading, updating and
-- deleting stay within the recipient's organization or the recipient.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_read ON notifications FOR SELECT
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR user_id = app_user_id());
CREATE POLICY tenant_isolation_write ON notifications FOR UPDATE
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR user_id = app_user_id());
CREATE POLICY tenant_isolation_delete ON notifications FOR DELETE
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR user_id = app_user_id());
CREATE POLICY tenant_isolation_insert ON notifications FOR INSERT WITH CHECK (true);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_preferences
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR user_id = app_user_id());

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_settings
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR user_id = app_user_id());

-- Memberships: the tenant's own rows, plus the signed-in person's memberships in other
-- organizations (needed to list the organizations they can switch to).
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization_memberships
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id() OR user_id = app_user_id());

-- Not tenant-scoped (reference data shared across tenants, or per person rather than per
-- organization), so no policies: organizations, users, roles, permissions, role_permissions,
-- refresh_tokens, password_reset_tokens, _prisma_migrations. organization_counters holds only
-- the next task/ticket/contract number of the provider and is bumped by client actions too.

DROP FUNCTION app_rls_enable_org(regclass);
DROP FUNCTION app_rls_enable_dual(regclass);
DROP FUNCTION app_rls_enable_child(regclass, regclass, text);
