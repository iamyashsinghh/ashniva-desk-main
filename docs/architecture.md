# Architecture

## 1. Overview

```
 Browser (React/Vite)  ──HTTP /api/v1──▶  NestJS API  ──Prisma──▶  PostgreSQL
 Mobile (RN, later)    ──Socket.IO /ws─▶     │   │
                                             │   ├──ioredis / BullMQ──▶ Redis (queues, jobs, socket adapter later)
                                             │   └──AWS SDK──▶ S3-compatible storage (MinIO locally)
                                             └── adapters: GitHub App · IVR provider (Tata) · email · WhatsApp
```

One API, one database, one set of users/roles/permissions serve the web app, the client portal and
the future mobile app. Everything is tenant-scoped by `organization_id`.

## 2. Monorepo

| Workspace | Role | Consumed as |
| --- | --- | --- |
| `packages/types` | Enums, workflow statuses, roles, permission keys and default role permissions, client-status mapper, API contracts (zod). The single source of truth. | Built to `dist/cjs` (Node/Jest) and `dist/esm` (Vite) |
| `packages/ui` | Design tokens (`tokens.css` + `tokens.ts`), global styles, base React components | Source (`src/index.ts`) — bundled by Vite |
| `packages/config` | tsconfig bases, ESLint presets | Config only |
| `apps/api` | NestJS application | — |
| `apps/web` | React application | — |
| `apps/mobile` | Placeholder for React Native (Expo) | — |

`pnpm -r` runs scripts in dependency order, so `types` builds before `api`/`web`. Turborepo was
deliberately left out (one fewer tool; add later if build times demand it).

## 3. API structure (`apps/api/src`)

```
main.ts / app.setup.ts / swagger.ts   bootstrap, helmet, CORS, prefix /api, URI versioning v1, ValidationPipe, Swagger
app.module.ts                          wires foundations + DomainModules; global filter, guards, interceptor
config/                                env.schema.ts (zod) → validateEnv → AppConfigService (typed, grouped)
logging/                               nestjs-pino: JSON logs, request ids, redaction; pretty output in development
common/errors                          AllExceptionsFilter → ApiErrorResponse; Prisma error mapping
common/tenant                          TenantContextService (AsyncLocalStorage) + middleware
common/crypto                          SecretCipherService (AES-256-GCM envelope encryption)
common/decorators                      @Public, @RequirePermissions, @CurrentUser
common/rate-limit                      @nestjs/throttler (global guard)
database/                              PrismaService (pg driver adapter)
infrastructure/redis|queue|storage|realtime   ioredis, BullMQ root config + queue names, S3 client, Socket.IO gateway
modules/<feature>/                     one folder per business feature (see below)
generated/prisma                       generated Prisma client (git-ignored)
```

**Request pipeline:** helmet → CORS → TenantContextMiddleware (opens a context) → ThrottlerGuard →
JwtAuthGuard (verifies token, loads membership + permissions, fills tenant context) →
PermissionsGuard (`@RequirePermissions`) → ValidationPipe (DTOs) → controller → service →
repository → Prisma. AuditInterceptor records `@Audited` handlers. AllExceptionsFilter shapes
every error.

**Module template** (`apps/api/src/modules/<feature>/`):
`<feature>.module.ts` · `<feature>.controller.ts` (thin; only HTTP concerns) ·
`<feature>.service.ts` (business rules, state machines, permission scope checks) ·
`<feature>.repository.ts` (Prisma, tenant-scoped) · `dto/` (class-validator + Swagger) ·
`*.spec.ts` · `README.md` (responsibility, entities, endpoints, phase). Modules register in
`modules/domain-modules.ts`.

**Phase 2 modules with business logic** (the rest are still boundaries): contracts (with the hour
ledger and payment milestones), milestones, sla-escalations (business-hour maths, the ticket clock
engine and the monitor job), change-requests, approvals, notifications (dispatcher, preferences,
jobs and channel interfaces), reports/advanced, roles-permissions.

**Module boundaries prepared in Phase 0** (each has a README): auth, users, organizations,
organization-memberships, teams, roles-permissions, products, projects, milestones, tasks,
work-logs, tickets, contracts, client-updates, approvals, files, qa, releases, github,
ticket-routing, on-call, sla-escalations, ivr (+ `IvrProvider` interface, Tata placeholder),
call-logs, recurring-issues, problems, rca, incidents, notifications (+ `NotificationChannel`
interface), reports, audit-logs, branding, health.

**Cross-cutting rules**
- Events: NestJS `EventEmitter2` in-process (Phase 1); side effects needing retries go to BullMQ.
- Real-time: Socket.IO namespace `/ws`, rooms `org:{id}`, `project:{id}`, `user:{id}`; token in
  `auth.token`; events `task.updated`, `ticket.updated`, `notification.new`, `update.published`.
- Jobs (BullMQ, names in `queue-names.ts`): notifications, sla-monitor, daily-reports,
  github-webhooks, ivr-events. Running in Phase 2: the SLA monitor every two minutes (warnings and
  breaches recorded once each, guarded by a partial unique index), deferred notification delivery
  every minute (quiet hours and rate limiting), and daily reminders at 03:00 UTC (tasks due or
  overdue, contract expiry and renewal, low support hours).
- Tenant isolation: repositories add `organizationId` from `TenantContextService`; PostgreSQL
  row-level security (Phase 2) is the second layer, with cross-tenant e2e tests over both.
  `TenantContextService.runAsSystem()` runs provider-side bookkeeping that a client request
  triggers (SLA clocks, notification recipients) without a tenant, and is confined to those
  engines.
- Client portal: separate `/portal/*` controllers returning allow-list DTOs; client-visible statuses
  only.
- Integrations are behind interfaces (`IvrProvider`, `GithubAppClient`, `NotificationChannel`) so
  real providers can be added without touching business services.

## 4. Web structure (`apps/web/src`)

```
main.tsx                      imports tokens.css + global.css, mounts <App/>
app/App.tsx                   QueryProvider → BrandingProvider → RouterProvider
app/router.tsx                route table (handles carry page titles)
app/providers/                QueryProvider, BrandingProvider (+ branding-context)
app/layout/                   AppShell (skip link, drawer sidebar < 900px), Sidebar, Topbar, navigation.ts
config/env.ts                 zod-validated VITE_* variables
shared/lib/api-client.ts      fetch wrapper → ApiError with the API's structured body
features/<feature>/           api.ts (react-query hooks) · pages/ · components/ · *.test.tsx
```

Rules: pages compose feature components; data fetching only in `api.ts` hooks; every mutation
invalidates its query keys and (later) listens to the matching socket event; no component over
~250 lines; portal screens get their own `PortalShell` in Phase 1.

## 5. Branding

`packages/ui/src/tokens/tokens.css` defines `--brand-primary`, `--brand-secondary`,
`--brand-accent` (+ hover/soft variants) with the approved temporary values. The API serves
`GET /branding` from `organizations.settings.branding` merged over `DEFAULT_BRANDING`
(`packages/types`). `BrandingProvider` writes the response into the CSS variables and the document
title. Nothing else references a brand colour literal. Admin → Branding (Phase 1) edits the stored
values and uploads a logo through the files module.

## 6. Configuration

All environment variables are declared once in `apps/api/src/config/env.schema.ts` (zod) and read
only through `AppConfigService`. The API refuses to start with a readable list of problems when
configuration is invalid. `.env.example` files document every variable; real values live in the
deployment platform's secret store (see `security-plan.md`).

## 7. Observability

pino JSON logs with `requestId` (from/for `X-Request-Id`), redaction of auth headers, error logs
for 5xx with the request id echoed in the response body, `GET /health/live` (process) and
`GET /health` (database, Redis, storage with latencies; 503 when degraded). Sentry-compatible error
tracking hook and metrics are Phase 1+ items.

## 8. Deployment

Docker images: `apps/api/Dockerfile` (multi-stage, runs `prisma migrate deploy` then the API) and
`apps/web/Dockerfile` (Vite build served by nginx with SPA fallback). `docker-compose.yml` runs the
infrastructure by default and the app images under `--profile app`. CI: `.github/workflows/ci.yml`
(format, lint, type-check, unit + e2e tests with services, builds, compose validation).

## 9. Key decisions and why

| Decision | Why |
| --- | --- |
| pnpm workspaces without Turborepo | Fewer tools; `pnpm -r` ordering is enough at this size |
| NestJS 11 / Prisma 7 / TS 5.9 / ESLint 9 / Vite 7 / Vitest 4 | Current stable majors the team knows; newer majors (Nest 12, TS 7, ESLint 10, Vite 8, Prisma 8) evaluated later |
| Prisma `prisma-client` generator + pg driver adapter | Prisma 7 standard; generated code compiles with the app (no engine binary at runtime) |
| Opaque, hashed refresh tokens with families | Rotation and reuse detection without storing anything reusable |
| Permissions resolved per request from the membership | Role changes take effect immediately; tokens stay small |
| `packages/types` dual CJS/ESM build | Node/Jest need CJS, Vite/Rollup need ESM named exports |
| `packages/ui` consumed as source | Only bundlers use it; avoids a CSS build step |
| Jest for the API, Vitest for Vite apps | Mandated Jest + Supertest for the API; Vitest is native to Vite |
| Health readiness returns 503 with details | Load balancers and the status page get one endpoint |
