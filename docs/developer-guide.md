# Developer guide

## 1. Install

Requirements: Node 22+, pnpm 10+ (`corepack enable && corepack prepare pnpm@10.33.0 --activate`),
Docker Desktop / Docker Engine with Compose v2, Git.

```bash
git clone <repo-url> ashniva-desk && cd ashniva-desk
pnpm install
```

`pnpm install` also builds native modules (argon2) and downloads the Prisma engine. If a corporate
proxy blocks that, set `HTTPS_PROXY` before installing.

## 2. Run locally (one documented process)

```bash
cp .env.example .env                    # compose settings; defaults are fine
cp apps/api/.env.example apps/api/.env  # API settings; defaults match compose
docker compose up -d                    # postgres:5432, redis:6379, minio:9000 (+ console :9001)
pnpm db:generate                        # generate the Prisma client (also runs in CI)
pnpm db:migrate                         # apply migrations (creates the database schema)
pnpm db:seed                            # permissions, roles, demo organizations and users
pnpm dev                                # API http://localhost:3000, web http://localhost:5173
```

Check: http://localhost:3000/api/v1/health should show every component `up`;
http://localhost:5173/system/status shows the same in the app; Swagger at
http://localhost:3000/api/docs. Sign in at http://localhost:5173/login with a demo account from the
README (all use `SEED_USER_PASSWORD`). The seed is guarded: with `NODE_ENV=production` it exits
unless `ALLOW_DEMO_SEED=true`.

Individual processes: `pnpm dev:api`, `pnpm dev:web`.

## 3. Docker services

- `docker compose up -d` — infrastructure only (this is the normal development mode).
- `docker compose --profile app up --build` — also builds and runs the API and web images
  (API on `API_PORT`, web on `WEB_PORT`). Dependencies and compiled code live inside the images
  (no host mounts); the API container runs as the unprivileged `node` user and its entrypoint
  (`apps/api/docker/entrypoint.sh`) applies migrations then starts node directly — pnpm is not
  present at runtime. One-off commands: `docker compose --profile app run --rm --no-deps api migrate`
  and `… api seed`. The web container is `nginx-unprivileged` (port 8080) proxying `/api` and `/ws`
  to the API. Every service has a health check; `web` waits for `api` to be healthy.
- `bash scripts/mac-preview.sh` / `bash scripts/mac-stop.sh` — the same "app" profile packaged for
  non-technical macOS users (creates missing `.env` files, builds, starts and waits for each
  service, migrates, seeds, opens the browser; stop keeps the data volumes). CI runs the preview
  script on Linux as a smoke test (`compose-smoke` job). See the README section "Preview on macOS
  for non-technical users".
- `docker compose logs -f postgres` / `redis` / `minio` — logs.
- `docker compose down -v` — stop and delete data volumes (fresh database).
- MinIO console: http://localhost:9001 with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`; the
  `minio-init` job creates the `ashniva-desk-dev` bucket.

Ports are configurable through the root `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`, …).

## 4. Create a database migration

1. Edit `apps/api/prisma/schema.prisma` (follow the conventions in `docs/database-plan.md`).
2. `pnpm db:migrate --name add_teams` — Prisma writes
   `apps/api/prisma/migrations/<timestamp>_add_teams/migration.sql` and applies it.
3. Need hand-written SQL (partial unique index, RLS policy, data fix)? Run
   `pnpm --filter @ashniva/api exec prisma migrate dev --create-only --name add_teams`, append
   your SQL with a comment explaining why, then `pnpm db:migrate`.
4. `pnpm db:generate` runs automatically after migrate; commit the schema and the migration folder.
5. Never edit a migration that has been applied anywhere else; add a new one.

Useful: `pnpm db:studio` (browse data), `pnpm db:reset` (drop + migrate + seed).

## 5. Add a NestJS module

Example: `teams`.

```
apps/api/src/modules/teams/
  teams.module.ts        @Module({ controllers: [TeamsController], providers: [TeamsService, TeamsRepository] })
  teams.controller.ts    routes only: @Controller('teams'), DTOs in, service out, @RequirePermissions(...)
  teams.service.ts       business rules; throws NotFound/Forbidden; calls AuditLogService for sensitive changes
  teams.repository.ts    Prisma queries, always scoped by organizationId from TenantContextService
  dto/create-team.dto.ts class-validator + @ApiProperty
  teams.service.spec.ts  unit tests with a fake repository
  README.md              responsibility, entities, endpoints, phase
```

1. Copy the pattern from `modules/branding` (public read) or `modules/auth` (guards/services).
2. Add the module to `src/modules/domain-modules.ts` (the skeleton module files already exist for
   every planned feature — replace the empty `@Module({})`).
3. Add an e2e file in `apps/api/test/<feature>.e2e-spec.ts` covering success, validation,
   permission-denied (403), unauthenticated (401) and cross-tenant (404).
4. `nest g` also works from `apps/api` (`pnpm exec nest g service modules/teams/teams --flat`).

Guards are global: routes require a bearer token unless `@Public()`. Use
`@RequirePermissions(PERMISSIONS.X)` for authorization and `@CurrentUser()` to read the user.
Mark sensitive handlers with `@Audited({ action: 'team.created', entityType: 'team' })`.

## 6. Add a React screen

1. Create `apps/web/src/features/<feature>/pages/<Name>Page.tsx` (+ `.css` next to it, + `.test.tsx`).
2. Put data access in `apps/web/src/features/<feature>/api.ts` as react-query hooks that call
   `apiRequest` and validate the response with the zod schema from `@ashniva/types` when one exists.
3. Register the route in `apps/web/src/app/router.tsx` (`handle: { title }` sets the top-bar title)
   and, if it belongs in the sidebar, in `app/layout/navigation.ts`.
4. Use components from `@ashniva/ui` rather than writing markup. **Run the gallery first** —
   `pnpm --filter @ashniva/ui gallery` serves every component in every state, in both colour
   schemes, on :5174 — because the fastest way to write a screen twice is to not know that the
   thing you are about to hand-roll already exists. Status colours come from `TASK_STATUS_TONES` /
   `TICKET_STATUS_TONES`; never from a literal.
5. Every screen shows loading, empty, error and permission-denied states; disabled actions pass
   `disabledReason`. Prefer `Table`'s `loading` (placeholder rows that hold the layout) over a
   spinner that replaces the content.
6. Never write a colour, a spacing value, a radius or a shadow as a literal. They are all tokens in
   `packages/ui/src/tokens/tokens.css`, and a literal is what breaks dark mode and live theming.
7. Keep pages under ~250 lines by extracting components into `features/<feature>/components/`.

## 7. Add a shared type

1. Add or edit a file under `packages/types/src/…` (`domain/`, `workflow/`, `api/`, `roles/`,
   `permissions/`) and export it from `src/index.ts`.
2. Use `as const` objects + derived union types (see `task-status.ts`) and zod schemas for API
   contracts (see `api/branding.ts`).
3. `pnpm build:packages` (root `lint`/`typecheck`/`test`/`dev` do this automatically). Both the
   API (CJS) and the web app (ESM) read the built output.
4. If it is a database enum too, add it to `schema.prisma` with the same values.

## 8. Add or modify a role or permission

1. Permission: add a key to `PERMISSIONS` and a description to `PERMISSION_DESCRIPTIONS` in
   `packages/types/src/permissions/permission-keys.ts`.
2. Grant it to roles in `DEFAULT_ROLE_PERMISSIONS`
   (`packages/types/src/permissions/default-role-permissions.ts`). The tests in that folder fail if
   a client role receives an internal-only permission.
3. New system role: add it to `ROLE_KEYS` and `ROLE_LABELS`, then to `DEFAULT_ROLE_PERMISSIONS`.
4. **Write the migration.** A permission that exists only in `packages/types` does not exist in a
   deployed database, and a screen guarded by it returns 403 for everyone until someone reseeds.
   Regenerate the SQL and put it in a new timestamped migration:

   ```bash
   pnpm build:packages
   pnpm --filter @ashniva/api exec tsx scripts/generate-permission-migration.ts \
     > apps/api/prisma/migrations/<timestamp>_<change>/migration.sql
   ```

   The output is additive and idempotent — `ON CONFLICT … DO NOTHING` on both inserts, system
   roles matched by key, custom roles left alone — so it is safe on a database that already has
   most of it. `apps/api/test/permission-rollout.e2e-spec.ts` fails if a key or a default grant
   has no migration row, so this step cannot be forgotten quietly.
5. `pnpm db:seed` for your own database. The seed is a development convenience: it resets each
   system role's permissions to the defaults, which is the right behaviour for demo data and the
   wrong behaviour anywhere real. Deployments rely on the migration from step 4, never on this.
6. Protect routes with `@RequirePermissions(PERMISSIONS.NEW_KEY)` and use `usePermission` from
   `features/auth/session-context.ts` to hide UI (the API remains the control).

## 9. Run tests

```bash
pnpm test                               # unit tests, every workspace
pnpm --filter @ashniva/api test:watch   # API unit tests in watch mode
pnpm test:e2e                           # API tests against running services (see §2)
pnpm --filter @ashniva/web test:watch   # web component tests
TEST_LOG_LEVEL=debug pnpm test:e2e      # show API logs during e2e
```

Before pushing: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

The API e2e suite needs Postgres, Redis and an S3 endpoint (`docker compose up -d`) and a migrated,
seeded database; it creates its own extra rows (prefixed "E2E") and leaves them behind, so run
`pnpm db:reset` before taking screenshots or demoing.

The suite runs one worker at a time: every spec shares the database and the demo data, so parallel
runs race on counts and inboxes.

### Workflow rules live in one place each

- Tasks: `apps/api/src/modules/tasks/task-workflow.ts` (transitions from
  `packages/types` `TASK_TRANSITIONS`, gates such as "only the assignee starts", "a client-visible
  completion needs a summary"). Task detail returns `actions[]` with `enabled` and `reason`; the
  web renders buttons from that list and never decides on its own.
- Tickets: `apps/api/src/modules/tickets/ticket-workflow.ts` (same pattern).
- Access scope: `apps/api/src/common/auth/access-scope.ts` — internal staff vs client users,
  which organizations a caller may manage.
- Task visibility: `apps/api/src/modules/tasks/task-visibility.service.ts` — *which* tasks an
  internal caller may read, which is a different question from whether they work with tasks at
  all. The tenant is not the answer: without `task:read-all` a person sees the work they are named
  on (assignee, creator, reviewer, tester, or the tester a testing assignment was handed to), the
  tasks on projects they manage, lead or belong to, and the work of the people on teams they
  *lead*. It resolves once per request and every surface that carries a task's content consumes
  the same predicate — the list, `GET /tasks/:id`, every write path (through
  `TasksService.requireSummary`, which is why `task-workflow.ts` can decide "may manage" from the
  permission alone), the dashboards, `GET /client-updates`, attachments, git activity, the QA
  queue and the `task.updated` websocket audience. **A new task query written anywhere in the
  application applies it too, or the hole comes back one surface at a time.**
- Milestones: `apps/api/src/modules/milestones/milestone-progress.service.ts` (progress from linked
  work or a manual override with a reason) and `milestone-dependencies.ts` (no cycles).
- Support hours: `apps/api/src/modules/contracts/hour-ledger.service.ts` — every movement writes a
  ledger row with the balance after it; a partial unique index on the work log makes a second
  deduction impossible.
- SLA: `apps/api/src/modules/sla-escalations/business-hours.ts` (business-minute arithmetic in the
  policy's timezone), `sla-clock.ts` (targets and states) and `ticket-sla.service.ts` (when the
  clocks start, pause, resume and stop). The browser never computes SLA state.
- Change requests: `apps/api/src/modules/change-requests/change-request-workflow.ts`.
- Approvals: `apps/api/src/modules/approvals/approval-workflow.ts` — who may act on each side, and
  the rule that one person can never approve for both.
- Notifications: `apps/api/src/modules/notifications/notification-rules.ts` (de-duplication,
  grouping, quiet hours, rate limiting).
- Custom roles: `apps/api/src/modules/roles-permissions/role-rules.ts` (templates, no escalation,
  client-safe permissions, protected system roles).
- Global search: `apps/api/src/modules/search/search-gates.ts` — which entity types each audience
  may search and under which permission. The gate is a copy of the list routes' decorators and
  `search-gates.spec.ts` reads the real routes' Nest metadata to prove the copy has not drifted;
  `SearchService` calls those routes' own list *services* and issues no query of its own, so a
  search result set is always a subset of what the caller's own list screen shows. Adding an entity
  type means adding a gate, a case in that spec, and a branch that calls the module's list service
  — never a new query.
- Theme tokens: `packages/types/src/api/theme-values.ts` (what each kind of token may contain) and
  `packages/ui/src/tokens/theme-variables.ts` (which CSS custom properties a theme may set). Both
  are security rules rather than style rules — a token value is written into a live CSS custom
  property, so a value validated as a plain string is an injection point and a property name that
  is not on the allow-list is dropped. `apps/api/src/modules/branding/README.md` has the reasoning.

### Row-level security: the tables without a policy, and why

Every table that carries `organization_id` or `client_organization_id` has RLS enabled *and*
forced, and `test/row-level-security.e2e-spec.ts` fails the day a new one ships without it. Three
tables were reported as gaps by a later audit. One was a real gap and has been closed; the other
two are exempt because a policy would make the system worse, and both were measured rather than
argued. Do not re-raise them without new evidence.

- **`roles` — fixed** by `20260929090000_roles_row_level_security`. The table holds two kinds of
  row: system roles (`organization_id` NULL, shared by every tenant) and custom roles owned by one
  organization. The policy admits the NULL rows, the tenant's own rows, the provider, and — the
  branch that is easy to miss — *a role the signed-in person holds in another organization they
  belong to*. Without that last branch, `POST /auth/switch-organization` answers 401 for anyone
  whose role in the target organization is that organization's custom role: switching resolves the
  membership under the tenant it is leaving, and `findActiveMembership` inner-joins the role.
- **`refresh_tokens` — exempt.** `organization_id` says which organization a session was opened
  *for*, not who owns the row; it is nullable and `RefreshTokenService.issue` defaults it to NULL.
  Every read that matters (`findByHash` on the `@Public()` login, refresh and logout routes) runs
  before a tenant exists, so a policy would sit on the null-tenant branch and isolate nothing. On
  the stamped paths it does harm: `switch-organization` inserts a token for the organization being
  entered while stamped with the one being left (rejected by WITH CHECK), and
  `revokeAllForUser` — deactivating a user, changing a password — is `UPDATE … WHERE user_id = ?`,
  which with a policy revoked 1 of a test user's 2 sessions and left the other live. RLS here would
  take sessions *out* of a revocation sweep.
- **`organization_counters` — exempt.** Every row belongs to the service provider
  (`TicketsService.providerId()`, `ChangeRequestsService.providerId()`), but a client raising a
  ticket or change request from the portal bumps that row while stamped with its own tenant, on
  which `app_tenant_is_provider()` is false. With the org-scoped policy applied and the tenant set
  to a client organization the table reads as empty and the increment matches zero rows. Nothing to
  isolate — the provider owns every row — and portal ticket creation to lose.

### Settled review findings

Recorded so the next pass does not spend its time re-deriving them.

- **`GET /files?…` returns `[]`, not 404, for a caller who may not read the parent.** On `main`
  the list endpoint checks no parent at all and answers `200 []` for everybody. The asymmetry is on
  `fix/entity-access-gates`, where `FileParentsService.assertReadableParent` returns early for a
  non-internal caller — deliberately, with its reasoning in place — and judges them row by row on
  the ownership allow-list instead. Note that "non-internal" means "not service-provider staff"
  (`isInternalUser` = `isServiceProvider && !isClientRole`), so a second organization's internal
  employee takes the client path too. It leaks nothing: the row scope is strictly narrower than any
  permission test. If that branch's owner wants the 404 shape there, it belongs in
  `assertReadableParent` on that branch, not here.
- **A task can report `isOverdue: true` and `timing.status: "UNSCHEDULED"` together.** Both are
  true and they answer different questions at different grains: `dueDate` is a calendar date and
  the reporting grain, `dueAt` is the instant the on-time verdict compares against. Deriving a
  verdict from `dueDate` when `dueAt` is absent would need an end-of-day-in-timezone rule
  duplicated in `computeTaskTiming` *and* in the SQL of `operations-time.builder.ts` — whose whole
  point is that the tile and the badge cannot disagree — and would change the verdict of every
  date-only task in every existing deployment. The presentation already resolves it: an
  `UNSCHEDULED` task gets no badge at all (`TaskTimingBadge`), rather than a chip that reads as a
  result. The seed sets `due_date` and no `due_at`, which is why the badge is invisible on demo
  data; that is the seed, not the model.
- **`GET /tasks?assignedToId=<unrelated user>` answers 403 where the by-id route answers 404.**
  Deliberate, on `feat/task-visibility`: `TaskVisibilityService.assertMayFilterBy` refuses a filter
  the caller has no business asking, because silently narrowing turns "you may not ask this" into
  "this person has no work". It is not an existence oracle — `filterablePeople` builds the allowed
  set entirely from the actor's own scope and never looks the requested id up, so a real unrelated
  user and a random UUID take the same path to the same 403.

### Calling anything outside the deployment

**Never call `fetch` directly.** Inject `SafeHttpService`
(`apps/api/src/infrastructure/http/safe-http.service.ts`) and call `this.http.fetch(...)`. The
module is `@Global()`, so there is nothing to import and no reason to reach around it.

**And never open a socket to a configured host directly either.** The rule is about destinations,
not about HTTP. Whatever the protocol, the name is resolved and judged by `SafeDestinationService`
(`apps/api/src/infrastructure/net/`) before anything connects, and the socket goes to the address
that was approved. `SafeHttpService` is that resolver plus the parts that are specific to HTTP;
`SafeSmtpTransportFactory` is the same resolver plus the parts specific to mail.

Five features let an operator store a URL that the server then fetches: the GitHub and GitLab
self-hosted base URLs, the AI completion endpoint, the WhatsApp Cloud API base, and a test
account's reset hook. Without a check each is a way to make the server issue requests *inside* the
network it runs in — at a database on the loopback interface, at another tenant's service, or at
`169.254.169.254`, which hands out cloud credentials to anything that asks. Being allowed to
configure an integration must not be the same as being allowed to do that.

What the guard does, and why each part is there:

- **Scheme.** Only `http` and `https`; everything else (`file:`, `gopher:`, `data:`) is refused.
  Plain HTTP is refused too, since these requests all carry a bearer token — unless the caller
  passes `allowInsecure` *and* the host is allow-listed.
- **Address.** Loopback, RFC1918, link-local, unique-local, carrier-grade NAT, multicast and the
  cloud metadata addresses are refused, in both IPv4 and IPv6 — including IPv4-mapped forms such
  as `::ffff:127.0.0.1`, which reach the loopback interface exactly as the plain spelling does.
- **DNS.** The name is resolved once and *every* address it returns must pass. A name answering
  with one public and one private address is a rebinding attempt, and picking the acceptable one
  would make the check depend on resolver ordering.
- **Rebinding.** The socket is opened to the address that was checked, not to the name — with
  `Host` and the TLS server name still carrying the original hostname, so virtual hosting and
  certificate validation work as normal. There is no second resolution to poison.
- **Redirects.** Followed by hand, at most three, each hop re-checked in full. `redirect: 'follow'`
  would let a public URL bounce the request to the metadata service, which is the whole attack.
- **Budgets.** A whole-request timeout and a response-size cap enforced while reading, so a
  hostile endpoint cannot hold a queue worker open or stream until memory runs out.

**SMTP.** A tenant's mail server is a configured destination like any other, and it goes through the
same address rules — this was issue #22, which the HTTP work did not cover. It is *not* routed
through `SafeHttpService`: SMTP has no URL, no redirect chain and no response body, and forcing
mail through an HTTP client would mean reimplementing a mail client. Instead
`SafeSmtpTransportFactory` (`apps/api/src/modules/messaging/providers/safe-smtp.ts`) resolves the
host, checks every answer, and hands nodemailer the approved literal address — nodemailer skips its
own DNS when the host is already an IP, so there is no second lookup. The hostname is passed as
`servername` so the certificate is still validated against the configured name; without that,
nodemailer would disable SNI entirely once the host became an address.

**The escape hatch.** A deployment whose GitLab or staging environment genuinely lives on a private
network lists that host in `OUTBOUND_ALLOWED_HOSTS`. It widens the rule for the named hosts and
nothing else; it is per-host and never a range, and there is no way to switch the guard off.

Mail has its own list, `SMTP_ALLOWED_HOSTS`, and that separation is deliberate. An internal relay
is a normal way to run mail — much more common than a private HTTP integration — but naming it
should let Desk send mail through it, not let the git, AI and WhatsApp integrations start making
requests to it. Each list opens the machines it names to one protocol. An allow-listed host is
still pinned to the address it resolved to, so the exemption cannot be used to reach a *different*
private machine on a later resolution.

Refusals are logged with the host and the rule only — never the URL, which can carry a token in
its query string, and never the request headers, which carry the credential outright.

## 10. Branch and pull-request workflow

- `main` is protected: no direct pushes, CI must pass, one approval, squash merge.
- Branch names: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<short-name>`.
- Commits: imperative, present tense, explain why in the body when it is not obvious.
- One pull request per work item; keep them reviewable (< ~600 changed lines when possible).
- PR description: what changed, why, how it was tested, screenshots for UI, migration notes.
- Reviewers check: rules in `CLAUDE.md`, permissions/tenant scope on every new endpoint,
  internal-vs-client boundaries, tests for behaviour, docs updated (`docs/design-implementation-map.md`,
  module README).
- After merge, delete the branch. Releases are tagged `vX.Y.Z` from `main`.

## 11. Troubleshooting

| Symptom | Fix |
| --- | --- |
| API exits with "Invalid environment configuration" | Compare `apps/api/.env` with `.env.example`; the message lists each bad variable |
| `Cannot find module '../generated/prisma/client'` | `pnpm db:generate` |
| `@ashniva/types` imports fail / stale | `pnpm build:packages` |
| `/health` shows storage down | MinIO not running or wrong `STORAGE_*` values; `docker compose ps` |
| Migration drift error | `pnpm db:reset` locally (destroys local data) |
| Port already in use | Change `PORT` in `apps/api/.env` or the compose ports in root `.env` |
| `/health` shows queues down | A scheduled job did not register. The message names it; usually Redis was not up when the API started. See the production runbook, §5 |
| API refuses to start with `NODE_ENV=production` | Production refuses placeholder JWT secrets, an empty `CORS_ORIGINS`, a missing `APP_WEB_URL` and `STORAGE_AUTO_CREATE_BUCKET=true`. The message names each one |
| Everything is rate-limited behind a proxy | `TRUST_PROXY` is unset, so every request carries the proxy's address. Set it to the number of proxies — never `true` |

## 12. Running it in production

Operating the deployment is documented separately, and is meant to be followed under pressure
rather than read for background:

| Document | When |
| --- | --- |
| [`production-runbook.md`](production-runbook.md) | What the pieces are, what each health failure means, what to alert on, how the pool and the queues behave |
| [`staging-checklist.md`](staging-checklist.md) | Getting a build onto a production-shaped staging environment and proving it |
| [`uat-checklist.md`](uat-checklist.md) | Business sign-off, by the people who do the job |
| [`release-checklist.md`](release-checklist.md) | Deploying — starting with classifying the migrations |
| [`rollback-procedure.md`](rollback-procedure.md) | Undoing a release. Migrations apply on container start, so read §1 before you need it |
| [`backup-and-restore.md`](backup-and-restore.md) | What to back up (including `APP_ENCRYPTION_KEY`), how to restore, the quarterly drill |
| [`incident-procedure.md`](incident-procedure.md) | Something is broken now: severity, triage by symptom, communication |
