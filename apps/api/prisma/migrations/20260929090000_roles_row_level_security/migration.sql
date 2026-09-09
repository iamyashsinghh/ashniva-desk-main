-- Row-level security on `roles`, the last exemption in `20260905202714_row_level_security` that
-- was left open "for a reason worth fixing rather than a reason it is fine"
-- (`test/row-level-security.e2e-spec.ts`, RLS_EXEMPT_TABLES). This is that deliberate change.
--
-- Why this table needs a policy of a different shape from the rest of the schema.
-- `roles` holds two kinds of row:
--   * system roles — `organization_id` NULL, `is_system` true, one set for the whole deployment,
--     created by `prisma/seed/seed-roles.ts` in development and by the permission migrations in
--     production. Every membership read joins one of them, in every tenant.
--   * custom roles — `organization_id` set, owned and edited by exactly one organization
--     (`RolesRepository.create` / `findById` / `update` / `softDelete`).
-- The org-scoped policy the rest of this schema uses (`organization_id = app_tenant_id()`) would
-- hide every system row from every tenant and break permission resolution for everyone, so the
-- policy below also admits the NULL-organization rows — the same shape `audit_logs` already uses
-- for its organization-less entries. What it isolates is the custom roles: one client tenant can
-- no longer read, edit or soft-delete another client tenant's role even from a query that forgot
-- its `organization_id` filter.
--
-- Sign-in is unaffected: `JwtAuthGuard` resolves the membership (and therefore the role and its
-- permissions) *before* it calls `TenantContextService.set`, so that read carries no tenant and
-- lands on the `app_tenant_id() IS NULL` branch — as do migrations, the seed and background jobs.
--
-- The last branch is the one that is easy to miss, and admitting only the NULL rows is not
-- enough. A person can belong to more than one organization (`SessionUser.organizations`,
-- `POST /auth/switch-organization`). Switching runs stamped with the organization being left
-- while it resolves the membership in the organization being entered, and
-- `OrganizationMembershipsRepository.findActiveMembership` filters on `role: { deletedAt: null }`
-- — an inner join. With only the four branches above, a user whose role in the target
-- organization is that organization's own custom role gets the role row hidden, the join drops
-- the membership, and the switch fails with 401 "User is not an active member of this
-- organization" (measured against a running API before this branch was added). So the policy
-- also admits a role the current user actually holds, exactly as the `organization_memberships`
-- policy in `20260905202714_row_level_security` admits `user_id = app_user_id()`. It exposes a
-- person only to their own role, which `GET /auth/me` already returns to them. There is no
-- recursion: no policy on `organization_memberships` mentions `roles`, and `role_id` is indexed.
--
-- No new grants: `20260905202714_row_level_security` granted SELECT/INSERT/UPDATE/DELETE on ALL
-- TABLES in `public` to `ashniva_app`, which already covered `roles`, and
-- `prisma/sql/grant-app-role.sql` re-issues the same grant on a restore.

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON roles;
CREATE POLICY tenant_isolation ON roles USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  -- System roles are global reference data: shared by every tenant, owned by none.
  OR organization_id IS NULL
  OR organization_id = app_tenant_id()
  -- A role the signed-in person holds in another organization they belong to.
  OR EXISTS (
    SELECT 1 FROM organization_memberships m
     WHERE m.role_id = roles.id AND m.user_id = app_user_id() AND m.deleted_at IS NULL)
);

-- ---------------------------------------------------------------------------------------------
-- The other two tables the same audit raised, and why they stay exempt.
--
-- `organization_counters` — NOT a candidate; a policy would break client-raised work.
--   Every row belongs to the service-provider organization: `TicketsService.providerId()` and
--   `ChangeRequestsService.providerId()` resolve the provider, and the counter is upserted under
--   that id. A client raising a ticket or a change request from the portal therefore bumps the
--   *provider's* counter while the connection is stamped with the *client's* tenant, on which
--   `app_tenant_is_provider()` is false. Measured with the org-scoped policy applied and the
--   tenant set to a client organization: `SELECT count(*) FROM organization_counters` returns 0
--   and the increment matches 0 rows, after which the `upsert` falls through to an INSERT that
--   the WITH CHECK rejects. Since the provider is the only owner of any row here, and the
--   provider branch of every policy in this schema already grants it everything, a policy would
--   isolate nothing and cost portal ticket creation.
--
-- `refresh_tokens` — NOT a candidate; a policy would weaken a security control.
--   `organization_id` records which organization a session was opened *for*, not who owns the
--   row; it is nullable and `RefreshTokenService.issue` defaults it to NULL. The reads that
--   matter (`findByHash` on `POST /auth/login`, `/auth/refresh`, `/auth/logout` — all `@Public()`)
--   happen before any tenant exists, so a policy would sit on the `app_tenant_id() IS NULL`
--   branch and isolate nothing there. On the two stamped paths it does worse. Measured with the
--   NULL-admitting policy above applied to `refresh_tokens`:
--     * `POST /auth/switch-organization` runs stamped with the *current* organization and inserts
--       a token for the *target* one — "new row violates row-level security policy for table
--       refresh_tokens". Organization switching stops working.
--     * `RefreshTokenService.revokeAllForUser` (deactivating a user, changing a password) is
--       `UPDATE refresh_tokens WHERE user_id = ...` run stamped with the acting tenant. For a
--       user with sessions in two organizations it revoked 1 of 2 and left the other live — a
--       suspended user keeps a working session in the organization the admin was not signed in
--       to. RLS here removes sessions from a revocation sweep, which is the opposite of a control.
-- ---------------------------------------------------------------------------------------------
