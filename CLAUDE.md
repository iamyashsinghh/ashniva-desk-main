# Ashniva Desk — guide for coding agents and new developers

Ashniva Desk is an IT project, task, ticket, contract, client-support, IVR and work-tracking SaaS.
This file is the short version; `docs/developer-guide.md` has the long version.

## What this repository is

- **pnpm monorepo**: `apps/api` (NestJS + Prisma + PostgreSQL), `apps/web` (React + Vite),
  `apps/mobile` (React Native + Expo), `packages/types` (shared enums, statuses, roles,
  permissions, API contracts), `packages/ui` (design tokens + reusable React components),
  `packages/support-sdk` (the embeddable support widget customers install — the one package built
  for the outside world, so it ships a real `dist` and inlines its constants),
  `packages/config` (tsconfig + ESLint presets), `docs/` (plans and design references).
- **Current state: feature-complete, pending operational validation.** Every planned package is
  merged. Phase 1 delivered the MVP (auth, users, projects, tasks, tickets, client updates,
  reports, portal); Phase 2 added contracts and support hours, milestones, SLA, change requests,
  client approvals, notifications, advanced reports, custom roles and row-level security; Phase 3
  added integrations, release notes, email and WhatsApp, billing and AI summaries. Since then:
  package 6 (releases and QA), 7a/7b/7c (the role dashboards, the Manager/TL operational board and
  the client progress board), 8a/8b/8c (products, smart routing, support ownership), 9 (IVR) and
  9b (internal communication), package 11 (recurring issues, problems, RCA and incidents),
  package 12 (mobile), the embedded support SDK with outbound callbacks and support-tier
  behaviour, workflow hardening, production-readiness hardening, and the Theme Manager
  integration.

  **What is left is not code.** In order: the Tata IVR production adapter, which is blocked on
  provider details nobody has supplied (`docs/tata-ivr-handoff.md`); a restore drill and a load
  test on production-shaped infrastructure; the external-consumer question in issue #10; and the
  production environment itself — secrets, infrastructure and a deployment mechanism. There is no
  CD pipeline, by decision; releases are manual against `docs/release-checklist.md`.

  `docs/development-phases.md` holds the original phase order and is now history rather than a
  plan. **Do not start new product work on your own.**
- **Design references** live in `docs/design-reference/` (Claude Design export: architecture plan,
  wireframes, hi-fi screens, clickable prototypes). They are approved product/UX references, **not
  application code** — never import or copy their HTML/JS into the apps.
- Screen → route → components → roles → endpoints → entities mapping: `docs/design-implementation-map.md`.

## Commands (run from the repository root)

```
pnpm install                 # install everything
docker compose up -d         # postgres, redis, minio
cp apps/api/.env.example apps/api/.env
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                     # API on :3000 (/api/docs), web on :5173
pnpm lint · pnpm format · pnpm typecheck · pnpm test · pnpm test:e2e · pnpm build
```

`pnpm build:packages` (builds `@ashniva/types`) runs automatically before lint/typecheck/test/dev.
The API needs `apps/api/.env`; e2e tests need running Postgres, Redis and S3 (see developer guide).

## Rules that must hold

1. **Statuses, roles, permissions live in `packages/types` only.** Never redefine them elsewhere.
   Workflow rules live in one service per aggregate (e.g. tasks' `task-workflow.ts`) — not in
   controllers, not in the UI. A new permission also needs a **data migration** (generate it with
   `apps/api/scripts/generate-permission-migration.ts`): the seed is a development tool, and a
   permission that only the seed creates returns 403 in production.
2. **Security is enforced in the API.** Every route needs a bearer token unless marked `@Public()`;
   permissions with `@RequirePermissions(...)`; ownership/team scope in services; tenant scope
   (`organizationId`) in repositories from `TenantContextService`. Hiding a button is never a control.
3. **Internal vs client-visible** is a first-class flag (`Visibility`). Client-portal DTOs are built
   by allow-list mappers; internal comments, estimates, costs, failures and other clients' data must
   never reach a client response.
4. **No secrets in git.** Only `.env.example` files. Passwords → argon2id; tokens → hashed;
   stored secrets → `SecretCipherService`.
   **Never call `fetch` directly, and never open a socket to a configured host directly.** Any
   connection to an address someone configured goes through the shared destination guard
   (`infrastructure/net/`), which refuses loopback, private, link-local and cloud-metadata
   destinations and pins the connection to the address it checked: `SafeHttpService` for HTTP
   (which also re-checks every redirect), `SafeSmtpTransportFactory` for mail. A private host is
   reached by naming it in `OUTBOUND_ALLOWED_HOSTS` or `SMTP_ALLOWED_HOSTS` — separate lists, one
   protocol each — never by bypassing the guard. See the developer guide, §9.
5. **Branding is not hardcoded.** Colours come from CSS variables in `packages/ui/src/tokens/tokens.css`
   and are overridden at runtime from `GET /branding`.
6. **Code style**: plain, readable TypeScript; no `any` (if unavoidable add `// any: reason`);
   feature-based folders; thin controllers, business rules in services, data access in
   repositories, DTOs with class-validator; components and services over ~250 lines should be split;
   comments explain *why*, not *what*. Prettier + ESLint are the source of truth for formatting.
7. **Audit sensitive actions** with `@Audited()` or `AuditLogService.record()`.
8. **Tests**: unit tests next to the code (`*.spec.ts` in the API, `*.test.ts(x)` elsewhere), API tests
   in `apps/api/test/*.e2e-spec.ts`. Do not claim a check passed unless you ran it.

## Where things go

| Need | Location |
| --- | --- |
| New API feature | `apps/api/src/modules/<feature>/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `dto/`), then add it to `src/modules/domain-modules.ts` |
| New database table | `apps/api/prisma/schema.prisma` → `pnpm db:migrate --name <change>` |
| New web screen | `apps/web/src/features/<feature>/pages/`, route in `apps/web/src/app/router.tsx`, nav in `app/layout/navigation.ts` |
| New mobile screen | `apps/mobile/src/features/<feature>/`, route in `src/navigation/RootNavigator.tsx`, tab in `src/navigation/tabs.ts`. Administration screens stay on the web — see `apps/mobile/README.md` |
| Reusable component | `packages/ui/src/components/<name>/` |
| Anything a customer's browser runs | `packages/support-sdk/src/` — browser globals only, no Node ones |
| Shared enum / type / API contract | `packages/types/src/…` (then `pnpm build:packages`) |
| Environment variable | `apps/api/src/config/env.schema.ts` + `AppConfigService` + `.env.example` |
| Queue | `apps/api/src/infrastructure/queue/queue-names.ts`, processor in the owning module |

## Branch and PR workflow

`main` is protected. Work on `feat/…`, `fix/…`, `chore/…` branches, open a pull request, CI
(format, lint, type-check, tests, builds) must pass, one approval, squash merge. Never push to `main`.
