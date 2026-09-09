# Database plan

PostgreSQL 16, Prisma 7 (`apps/api/prisma/schema.prisma`), migrations in
`apps/api/prisma/migrations`, seed in `apps/api/prisma/seed.ts`.

## Conventions

- IDs: UUID v7 (`@default(uuid(7))`), time-ordered.
- Tables and columns are `snake_case` in PostgreSQL (`@@map` / `@map`); Prisma models are PascalCase.
- Every tenant-scoped table has `organization_id`, `created_at`, `updated_at`; soft-deletable
  tables have `deleted_at`; audit-relevant tables have `created_by`.
- Enum values are `UPPER_SNAKE_CASE` and mirror `packages/types` exactly.
- Nullable dimensions in uniqueness rules use **partial unique indexes** written by hand in the
  migration (Prisma cannot express them). Example in the init migration: system roles are unique
  by `key` where `organization_id IS NULL`, custom roles by `(organization_id, key)`.
- Append-only tables (audit_logs, ticket_assignments, credential_access_log) have no update/delete
  paths in the code.
- Secrets (`*_ciphertext`) are AES-256-GCM envelopes produced by `SecretCipherService`; phone
  numbers are stored hashed + last-4 only.

## Phase 0 tables (implemented)

| Table | Purpose |
| --- | --- |
| `organizations` | Tenants: type, service-provider flag (exactly one, partial unique index), timezone, currency, `settings` JSON (branding, notification defaults) |
| `users` | Identity: email (unique), argon2id `password_hash`, status, last login |
| `organization_memberships` | User ↔ organization with role, job title, `show_development_section` |
| `roles` | System roles (`organization_id NULL`, `is_system`) and custom roles |
| `permissions` | Catalogue of `resource:action` keys (seeded from `packages/types`) |
| `role_permissions` | Role ↔ permission |
| `refresh_tokens` | Hashed opaque tokens, family, expiry, revocation, replacement pointer |
| `audit_logs` | Append-only who/what/when/before/after with request id |

## Planned tables by phase (from Architecture Plan §5, §13–§15, §19)

**Phase 1 — identity, structure, work**
`teams`, `team_members`, `user_settings` (default view, timezone), `products`, `product_releases`,
`client_products`, `projects`, `project_members`, `project_modules`, `milestones`,
`task_categories`, `task_status_labels`, `tasks`, `task_dependencies`, `task_status_history`,
`comments` (entity TASK/TICKET/PROJECT, visibility), `work_logs`, `tickets`, `sla_policies`,
`client_updates`, `files`, `notifications`, `notification_prefs`, `report_snapshots`,
`testing_assignments`, `test_results`, `test_environments`, `test_accounts`, `credential_grants`,
`credential_access_log`.

**Phase 2 — control and integrations**
`contracts`, `contract_hour_ledger`, `payment_milestones`, `change_requests`, `contract_documents`,
`approval_requests`, `uat_requests`, `releases`, `release_items`, `release_approvals`,
`project_release_policy`, `github_installations`, `github_repo_links`, `github_refs`,
`webhook_events` (idempotency by delivery id), `check_overrides`.

**Phase 2b — smart support**
`support_ownership`, `on_call_schedule`, `user_availability`, `ticket_assignments`,
`similarity_matches`, `problems`, `problem_tickets`, `rca_reports`, `incidents`, `ivr_providers`,
`call_logs`, `callback_queue`; ticket columns `module`, `product_version`, `source`, `ack_due_at`,
`acknowledged_at`, `escalation_level`, `routed_by`, `problem_id`, `next_update_at`, `keywords`
(tsvector), `fingerprint`.

The column-level definitions for all of these are in the approved Architecture Plan
(`docs/design-reference/prototype/Ashniva Desk - Architecture Plan.dc.html`, §5 and §19.3) and are
copied into `schema.prisma` when their phase starts — not before, so the schema never carries
unused tables.

## Key enums (owned by `packages/types`)

`OrganizationType`, `UserStatus`, `Priority`, `Visibility`, `ProjectType`, `ContractType`,
`TicketType`, `TicketSource`, `TaskCategoryKind`, `TaskStatus` (20 states), `TicketStatus` (12),
`ReleaseStatus`, `ReleaseApproverRole`, `TestingAssignmentKind/Status`, `TestResult`,
`TestEnvironment`, `CheckStatus`, `ProblemStatus`, `CallOutcome`, `ClientVisibleStatus`.

## Indexes

`(organization_id, status)` on tasks/tickets · `(assigned_to, due_date)` · `(project_id, work_date)`
on client_updates · GIN on `tasks.title/description` tsvector · partial index
`tickets(resolve_by) WHERE status NOT IN (RESOLVED, CLOSED)` · `(entity_type, entity_id)` and
`(organization_id, created_at)` on audit_logs (done).

## Tenant isolation

1. Repositories add `organizationId` from `TenantContextService` to every tenant-scoped query
   (done in Phase 1 for every repository; internal staff are members of the service-provider
   organization, client users are scoped by `client_organization_id`, foreign ids answer 404).
2. Row-level security — **done in Phase 2** (`20260905202714_row_level_security`): every tenant
   table has `ENABLE`/`FORCE ROW LEVEL SECURITY` and a policy over the helper functions
   `app_tenant_id()`, `app_tenant_is_provider()`; a row is visible when no tenant is set (migrations
   and background jobs), when the caller is the service provider, or when the row belongs to the
   tenant. The API connects as `ashniva_app`, which holds no `BYPASSRLS`; `TenantAwarePool` runs
   `SET ROLE` and `set_config('app.tenant_id', …)` on the pooled connection before each query and
   resets it after, so a connection can never carry one tenant's context into the next use.
   `apps/api/test/row-level-security.e2e-spec.ts` proves it, including under concurrency. `roles`
   joined them in `20260929090000_roles_row_level_security`, under a policy that also admits the
   NULL-organization system rows and a role the signed-in person holds in another organization.
   Two tables carry an `organization_id` and are deliberately left without a policy —
   `refresh_tokens` and `organization_counters` — because one would break organization switching
   and shrink session revocation and the other would break client-raised tickets; the measurements
   are in that migration, in the exemption list of the test above, and in the developer guide, §9.
3. Client-portal queries additionally filter by `client_organization_id` and `visibility = 'CLIENT'`
   (done: `modules/portal` mappers are allow-lists).
4. Cross-tenant e2e tests: every endpoint called with another tenant's ids must return 404
   (done for Phase 1 endpoints in `apps/api/test/*.e2e-spec.ts`).

## Migrations

- Create: `pnpm db:migrate --name <change>` (development; generates SQL from the schema diff).
- Hand-written SQL (partial indexes, RLS, data fixes) is appended to the generated migration file
  with a comment explaining why.
- Deploy: `pnpm db:migrate:deploy` (CI, containers, production). Never edit an applied migration.
- Reset locally: `pnpm db:reset` (drops, migrates, seeds).

## Seed data

`prisma/seed.ts` is idempotent and safe to re-run. It creates the permission catalogue, the nine
system roles with default permissions, four fictional organizations (Ashniva Technologies —
service provider, GroupHR Services, Acme Retail Pvt Ltd, Zenith Logistics Ltd), twelve demo users
at `@example.com` with the password from `SEED_USER_PASSWORD`, two teams, five projects with
categories, 29 tasks across every workflow state, 12 tickets, work logs, client updates, daily
report snapshots and audit entries. Phase 2 adds one custom role, three contracts with their
current billing period, hour ledger and payment milestones, four milestones with deliverables and a
dependency, two SLA policies with clocks on the open tickets (on track, at risk, breached and
paused), three change requests across the workflow with their history, milestone and
change-request approvals, and a few unread notifications. Per-organization counters only ever move
up, so re-seeding a database that already holds newer rows cannot hand out a number twice. It
refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` is set, so predictable demo
passwords never reach a real deployment. No real customer data may ever be added to the seed.
