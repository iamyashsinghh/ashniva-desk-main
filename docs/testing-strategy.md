# Testing strategy

## Levels

| Level | Tooling | Where | Runs |
| --- | --- | --- | --- |
| Unit — API | Jest 30 + ts-jest | `apps/api/src/**/*.spec.ts` | `pnpm --filter @ashniva/api test` |
| Unit — shared types | Jest | `packages/types/src/**/*.test.ts` | `pnpm --filter @ashniva/types test` |
| Unit/component — UI + web | Vitest 4 + Testing Library + jsdom | `packages/ui/src/**/*.test.tsx`, `apps/web/src/**/*.test.tsx` | `pnpm --filter @ashniva/ui test`, `pnpm --filter @ashniva/web test` |
| API (end-to-end) | Jest + Supertest against real PostgreSQL, Redis, S3 | `apps/api/test/*.e2e-spec.ts` | `pnpm test:e2e` |
| Browser e2e | Playwright (Phase 2) | `apps/web/e2e/` | nightly + release branches |
| Compose smoke | `scripts/mac-preview.sh` in CI (`compose-smoke`) | `.github/workflows/ci.yml` | every PR: builds images, migrates, seeds, checks health, Swagger, the login page and a real sign-in |

`pnpm test` runs every unit suite; `pnpm test:e2e` runs the API suite. CI runs both.

## What each level covers

**Unit (API):** services, workflow state machines, permission checks, mappers, config validation.
Repositories are replaced by small in-memory fakes or `jest.fn()` mocks (see
`refresh-token.service.spec.ts` for the pattern). Target: ≥ 80 % statements on `modules/**` from
Phase 1; state machines and permission rules 100 %.

**Unit (types):** every status maps to a client-visible status; role permission sets only use
known keys and never give clients internal permissions — these tests protect the product's
information boundaries.

**Component (ui/web):** accessibility contracts (labels, descriptions, roles), state rendering
(loading/empty/error/degraded), branding application. Tests use user-visible queries
(`getByRole`, `getByLabelText`), never CSS selectors.

**API e2e:** the composition root with real infrastructure — request pipeline, guards, validation,
error shape, health, Swagger. Phase 1 files: `auth.e2e-spec.ts`, `auth-flow.e2e-spec.ts` (cookie
rotation, reuse detection, logout, organization switch), `identity.e2e-spec.ts` (users, companies,
teams, roles, role placement, cross-tenant 404), `work.e2e-spec.ts` (projects, task workflow gates,
work logs, comments, files, client updates, reports, dashboards) and `business-flow.e2e-spec.ts` —
the 20-step business workflow: client raises a ticket → support assigns → senior converts it to
tasks → developer starts, logs time, submits → tester returns → developer resubmits → senior
approves (client-visible) → update published → client sees it → ticket resolved → client confirms
and closes, with cross-tenant denials for the second client at every step.

**Phase 2 suites:** `contracts` (create → activate → hours → approved work consumes hours exactly
once → adjustment with a reason and re-authentication → carry-forward on period close → the client
sees remaining hours but no costs), `sla` (targets from the policy, pause and resume, warning,
breach and met-late, precedence between project, client and default policies), `change-requests`
(the whole workflow, only the client decides, approved requests generate work), `notifications`
(delivery, de-duplication, grouping, quiet hours, preferences), `reports` (every report, the
money split between director and manager, CSV escaping and audit, the client-safe subset),
`security` (re-authentication, custom roles, escalation refusals, role changes),
`row-level-security` (raw queries under a tenant, pooled connections, concurrency) and
`demo-data-privacy` (the shipped demo data itself carries nothing internal into the portal).

**Operational suite:** `production-readiness.e2e-spec.ts` covers the properties that only exist end
to end — whether the refresh cookie carries `Secure` and whether the login throttle keys per client
under a forwarded header (both decided by `TRUST_PROXY`), whether `/api/docs` is served in
production, whether `/api/metrics` is readable without its token, whether readiness reports 503 when
a scheduled job is missing, and whether an upload whose bytes contradict its declared content type
is refused.

It builds several applications with different environments, which needs a note:
`ConfigModule.forRoot` reads and validates the environment when its module file is **first
imported**, not when an application is instantiated — so every app in one Jest module registry
shares whatever `process.env` held at that moment. Varying a setting therefore means
`jest.isolateModulesAsync` with the imports inside it. A test that mutates `process.env` and then
builds a second app in the same registry is silently testing the first value.

Two cases are asserted in unit tests rather than there, on purpose: `TRUST_PROXY=true` and the
placeholder JWT secrets. An `AppModule` whose environment fails validation *hangs*
`Test.createTestingModule().compile()` instead of rejecting, and a test that hangs is worse than
no test — `env.validation.spec.ts` covers both directly.

**Browser walkthrough:** a scripted Playwright pass signs in as every role, opens each screen on a
desktop and a phone viewport and collects console and page errors; the screenshots live in
`docs/screenshots/phase-2` and are attached to the pull request. A recorded browser e2e smoke path
(login → task → review → publish; ticket → reply) is still to come.

## Conventions

- Test files sit next to the code they test; e2e files in `apps/api/test`.
- Name tests by behaviour: `it('revokes the whole family when a rotated token is reused')`.
- Arrange with builders/fakes, not with database snapshots.
- No sleeps; await the promise or use `waitFor`.
- Tests run with `NODE_ENV=test`, `LOG_LEVEL=silent` (override with `TEST_LOG_LEVEL`).
- e2e tests expect a migrated, seeded database (`pnpm db:migrate:deploy && pnpm db:seed`); they
  must be idempotent and must not depend on order (`--runInBand` keeps them sequential anyway).
- Do not mock what you own in e2e tests; do mock third-party providers (GitHub, IVR, email) behind
  their interfaces.

## Local prerequisites for e2e

`docker compose up -d`, `apps/api/.env` from the example, migrate + seed. The CI workflow shows the
exact environment (`.github/workflows/ci.yml`, job `test`).

## Quality gates in CI

1. `pnpm format:check` 2. `pnpm lint` 3. `pnpm typecheck` 4. `pnpm test` 5. `pnpm test:e2e`
6. `pnpm build` 7. `docker compose config`. A pull request cannot merge with a red check.
