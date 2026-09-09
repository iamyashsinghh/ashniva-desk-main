# Production environment

Every setting a production deployment of Ashniva Desk must decide, what it is for, what happens
when it is wrong, and the five things the API refuses to start on.

The authority is `apps/api/src/config/env.schema.ts`, read by `validateEnv`
(`apps/api/src/config/env.validation.ts`) through `ConfigModule.forRoot({ validate: validateEnv })`
in `apps/api/src/config/app-config.module.ts`. Every value in this document was read from that
schema and exercised against it, not copied from `apps/api/.env.example` — the example file is a
*development* configuration and several of its values are refused in production on purpose.

`apps/api/.env.example` is not a production template. Do not deploy from it.

Related: `staging-environment.md` (the same list, differently answered), `deployment-plan.md`,
`production-runbook.md`, `release-checklist.md`, `security-plan.md`.

---

## 1. How the validation behaves

`ConfigModule` runs `validateEnv` before any module is constructed. It parses the whole environment
at once and throws a single `Invalid environment configuration:` error listing **every** problem,
so a misconfigured deployment fails at process start with one readable message rather than at the
first request that happens to need the setting.

Three consequences worth knowing before a release:

- **A missing variable is an outage, not a warning.** Set new variables in the secret store before
  deploying the image that needs them (`release-checklist.md` §2).
- **Unknown variables are ignored.** The schema is not strict, so a typo in a variable name is not
  caught — `TRUST_PROXIES=1` validates fine and does nothing. `SEED_USER_PASSWORD` is the one
  variable deliberately outside the schema: it is read straight from `process.env` by the seed
  (`apps/api/prisma/seed/seed-users.ts:158`) and never by the running API.
- **Some settings are per tenant, not per environment.** SMTP servers, WhatsApp tokens, AI
  endpoints, git credentials, IVR credentials and Theme Manager credentials are stored on
  `IntegrationConnection` rows, encrypted with `APP_ENCRYPTION_KEY`. Nothing about a vendor account
  belongs in the environment. §4 lists what the environment does hold about them.

---

## 2. The settings

Required means *the API will not start without it*. "Prod-only" means it is optional elsewhere and
required, or refused, under `NODE_ENV=production`.

### Runtime and process

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `NODE_ENV` | recommended | `development` | `development` \| `test` \| `production`. This one value switches on every production refusal in §3, turns off `/api/docs`, and switches pino from pretty output to JSON (`apps/api/src/logging/logging.module.ts:37`). A production deployment left on the default runs with all of §3 disabled |
| `PORT` | no | `3000` | The HTTP listen port. 1–65535 |
| `LOG_LEVEL` | no | `info` | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent`. `debug` in production is a volume and a cost problem, not a security one — request bodies are never logged |
| `TRUST_PROXY` | **prod-only, yes** | none | The **number** of reverse proxies in front of the API, or `false` for none. See §3.3 |
| `APP_TIMEZONE` | no | `Asia/Kolkata` | The business timezone daily reports and SLA business hours are computed in. Wrong, and the end-of-day snapshot and the SLA clock run against the wrong day |
| `QUEUE_SHUTDOWN_GRACE_MS` | no | `15000` (max `120000`) | How long SIGTERM waits for in-flight queue jobs (`queue-shutdown.service.ts:52`). Longer than the orchestrator's termination grace period and the process is killed mid-drain, so the setting buys nothing |
| `API_DOCS_ENABLED` | no | unset → **off** in production | Three-state. Unset means "on outside production"; set it explicitly to publish or suppress `/api/docs` regardless. On in production publishes a complete map of every route and DTO |
| `ALLOW_DEMO_SEED` | no | `false` | Lets `pnpm db:seed` plant demo users under `NODE_ENV=production` (`apps/api/prisma/seed.ts:34`). The demo users share one documented password. **Never `true` on a real deployment** |

### Database

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | none | Must be a URL starting `postgres`. The application role must **not** hold `BYPASSRLS` — row-level security is a real control here, and the migrations create `ashniva_app` for the API to connect as (`security-plan.md`, Phase 2) |
| `DB_POOL_MAX` | no | `11` | Pool size **per API instance**. PostgreSQL sees `DB_POOL_MAX × instances` and that must stay under `max_connections` with room for migrations and psql. The default is eleven because there are eleven queues (`infrastructure/queue/queue-names.ts`) and every instance runs a worker for each, sharing this pool with the HTTP server. Too small, and HTTP requests fail at the acquire timeout while the API looks healthy |
| `DB_POOL_IDLE_TIMEOUT_MS` | no | `30000` (min `1000`) | How long an idle pooled connection is kept |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | no | `10000` (min `100`) | What turns "pool exhausted" from a hang into an error. Raising it hides the symptom and lengthens the queue |
| `DB_STATEMENT_TIMEOUT_MS` | no | `30000` (min `0`) | PostgreSQL cancels a statement running longer than this; `0` disables the limit. `0` in production means one runaway query can hold a connection indefinitely |

Every checkout stamps the tenant on the connection (`TenantAwarePool`), so a pool too small pays
that extra round trip more often as well as making callers wait. Watch
`ashniva_db_pool_connections{state="waiting"}`; a sustained non-zero value is the signal to raise
`DB_POOL_MAX`, but only if PostgreSQL has the headroom.

### Redis

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `REDIS_URL` | **yes** | none | Must be a URL starting `redis`. Carries the BullMQ queues, the repeatable job schedules, **and** the Socket.IO fan-out between API instances (`infrastructure/realtime/redis-io.adapter.ts`). Losing it stops all background work and silently degrades live updates to one instance |

There is a second, less obvious dependency: Redis is **not** the rate-limit store. See §5.

### Object storage

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `STORAGE_ENDPOINT` | **yes** | none | S3-compatible endpoint URL |
| `STORAGE_REGION` | no | `us-east-1` | Region passed to the S3 client |
| `STORAGE_BUCKET` | **yes** | none | Minimum 3 characters. One bucket holds every tenant's attachments and invoice PDFs, keyed `<organizationId>/<uuid>/<name>` |
| `STORAGE_ACCESS_KEY` | **yes** | none | Treat as equivalent to a database superuser password: object storage has no row-level security, so this credential reads every tenant's files |
| `STORAGE_SECRET_KEY` | **yes** | none | As above |
| `STORAGE_FORCE_PATH_STYLE` | no | `false` | `true` for MinIO and most self-hosted gateways; `false` for virtual-hosted-style S3 |
| `STORAGE_AUTO_CREATE_BUCKET` | **prod-only: must be false** | `false` | See §3.5 |

The bucket must exist before the API starts, because auto-creation is refused. Readiness probes it
(`health.service.ts:27` → `storage.checkBucket()`), so a wrong name is a 503 rather than a silent
new bucket.

### Authentication and secrets

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | **yes** | none | Minimum 32 characters. Signs the 15-minute access token. In production it is additionally refused when it reads as a placeholder or matches `JWT_REFRESH_SECRET` — see §3.1 |
| `JWT_REFRESH_SECRET` | **yes** | none | Minimum 32 characters, and **must differ** from the access secret in production, or a stolen access token can be replayed as a refresh token |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` | Access-token lifetime. Longer means a stolen token is useful for longer; permissions are re-read from the membership on every request, so a long TTL does not stall a revocation |
| `JWT_REFRESH_TTL_SECONDS` | no | `2592000` (30 days) | Refresh-family lifetime |
| `APP_ENCRYPTION_KEY` | **prod-only, yes** | none | Base64 of exactly 32 bytes (`openssl rand -base64 32`), AES-256-GCM. See §3.2 |
| `REAUTH_TTL_SECONDS` | no | `300` | How long a password re-check stays valid for sensitive changes |
| `INVITATION_TTL_HOURS` | no | `168` (7 days) | Invitation-link lifetime |
| `PASSWORD_RESET_TTL_MINUTES` | no | `60` | Password-reset-link lifetime |

### Browser-facing settings

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `CORS_ORIGINS` | **prod-only, yes** | empty list | Comma-separated exact origins for the first-party web app and client portal, granted with credentials. The **same list governs the Socket.IO handshake** (`redis-io.adapter.ts:68`), so an empty or wrong list refuses the web app and the websocket together. See §3.4 |
| `APP_WEB_URL` | **prod-only, yes** | `http://localhost:5173` outside production | Public URL of the web app. Invitation and password-reset links are built from it (`app-config.service.ts:98`). Wrong, and every one of them points somewhere unusable and nobody notices for a week |
| `RATE_LIMIT_TTL_SECONDS` | no | `60` | Window for the global per-IP throttle |
| `RATE_LIMIT_MAX` | no | `120` | Requests per IP per window. See §5 for the per-instance caveat |

**Product allowed origins are not environment configuration.** The embedded support widget answers
to origins registered per product in the database (`products.service.ts:91`,
`widget-origin.registry.ts`), reflected back exactly and **without** credentials
(`apps/api/src/widget-cors.ts`). Adding a customer's site is an application change, not a redeploy.

**File size limits are not environment configuration either.** `MAX_FILE_BYTES` is a constant —
10 MiB, `packages/types/src/domain/file-rules.ts:11` — enforced both at the multipart interceptor
(`files.controller.ts:32`) and in the service (`files.service.ts:86`). Raising it is a code change,
and the reverse proxy's own body limit has to be raised with it.

### Outbound network

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `OUTBOUND_ALLOWED_HOSTS` | no | empty list | Hostnames (never ranges) an outbound **HTTP** integration may reach even though they resolve to a private address. Everything not listed is judged on the address it resolves to; loopback, private, link-local and cloud-metadata destinations are refused. Empty is the correct answer unless you run a self-hosted GitLab or similar |
| `SMTP_ALLOWED_HOSTS` | no | empty list | The same escape hatch for **SMTP only**. Deliberately a separate list: naming your internal mail relay must not also let the git, AI and WhatsApp integrations make HTTP requests to it |

Getting these wrong in the permissive direction is the serious failure: a host listed here can be
reached by an operator-supplied URL, which is what the destination guard exists to prevent. Getting
them wrong in the restrictive direction is loud — mail and integrations fail with a blocked-
destination error naming the host.

### SMTP and messaging

There are **no** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` or `SMTP_PASSWORD` variables. A mail server
is configured per organization in the application and stored encrypted; the transport is built from
those settings through the destination guard (`messaging/providers/safe-smtp.ts:45`). The
environment decides only which *kind* of provider is registered:

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `MESSAGING_PROVIDER` | no | `live` | `live` \| `mock`. `mock` captures email and WhatsApp in memory and reaches nothing. The default is `live` so a deployment cannot land on the mock by forgetting the variable — and `mock` in production means nobody is notified of anything, silently |
| `SUPPORT_CALLBACK_TRANSPORT` | no | `live` | `live` \| `mock`, for outbound support callbacks to a registered product's endpoint. Its own switch, so a deployment can mail for real while a customer's callback endpoint is still being built |

**Webhook and callback secrets are not environment configuration.** Inbound git, WhatsApp and IVR
deliveries are verified against a secret on the tenant's integration connection; the outbound
support-callback signing secret lives on the callback endpoint row, encrypted
(`support-callbacks/callback-endpoints.service.ts:126`). Support **machine credentials** — the
standing keys a customer's product uses to open tickets — are issued in the application, shown
once, and stored only as an argon2id hash (`products/product-credentials.service.ts:84`); nothing
in Desk ever reads one back. All of these depend on `APP_ENCRYPTION_KEY` being the same key that
encrypted them.

### AI

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `AI_PROVIDER` | no | `mock` | `http` \| `mock`. Unlike the messaging and IVR switches, the **mock is the default**: `http` needs an endpoint, model and credential from the tenant's AI integration connection, and none is assumed. `mock` builds summaries from the source records themselves and reaches nothing |
| `AI_REQUEST_TIMEOUT_MS` | no | `30000` (max `120000`) | Per-generation timeout |
| `AI_MAX_ATTEMPTS` | no | `3` (1–5) | Queue retries for a retryable generation failure |

### IVR

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `IVR_PROVIDER` | no | `tata` | `tata` \| `mock`. The real adapter is the default so a deployment cannot land on the mock by forgetting the variable. **The `tata` adapter cannot place a call today** — see below |
| `IVR_RECORDING_URL_TTL_SECONDS` | no | `300` (max `3600`) | Lifetime of a minted recording-playback URL. Every issue of one is audited |

`TataIvrProvider.startOutboundCall`, `transferCall`, `endCall` and `recordingUrl` all throw
`NotImplementedException` (`ivr/providers/tata-ivr.provider.ts:37-80`) because no vendor API
contract exists. With `IVR_PROVIDER=tata` a requested call is accepted, every destination on the
fallback ladder is attempted and refused, and the call ends in the support queue with the reason
recorded and the on-call person notified — no telephone rings. **A production deployment that is
not expecting telephony should set `IVR_PROVIDER=mock`**, which stops the refusals and makes
`GET /ivr/health` report the adapter ready by construction. See `tata-ivr-handoff.md`.

### Theme Manager

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `THEME_PROVIDER` | no | `local` | `local` \| `remote`. `local` is the organization's own stored branding and depends on nothing outside the deployment. `remote` reads from an Ashniva Theme Manager through the tenant's integration connection — **the vendor half of that integration does not exist** (`theme-manager-integration.md`), so `remote` is a decision, never an accident |
| `THEME_CACHE_TTL_SECONDS` | no | `300` (max `86400`) | How long a fetched theme document is served before a background refresh. Bounds staleness, not latency — no request waits on the Theme Manager |
| `THEME_REQUEST_TIMEOUT_MS` | no | `5000` (max `30000`) | Per-fetch timeout; the cached document is kept when a fetch is abandoned |

Even with `remote` the fallback ladder is cached document → the organization's stored branding →
the built-in theme, so a Theme Manager outage changes nothing a user sees.

### Metrics

| Variable | Required | Default | What it is for, and what a wrong value does |
| --- | --- | --- | --- |
| `METRICS_TOKEN` | no | unset | Bearer secret a scraper presents at `GET /api/metrics`. Minimum 16 characters when set; empty string reads as unset. **Unset, the route answers 404 to everyone** — and a wrong token also gets 404, so a probe learns nothing (`metrics/metrics-token.guard.ts`). Without it you have no metrics at all, which is a monitoring gap, not a security one |

---

## 3. The five production refusals — verified

Each of these was exercised against `validateEnv` on this commit, with a complete, otherwise-valid
production environment. The behaviour and the exact message are in `env.schema.ts:419-489` and are
covered by `apps/api/src/config/env.validation.spec.ts`.

### 3.1 It refuses the published example secrets — **holds, with a stated limit**

`JWT_ACCESS_SECRET=local-dev-access-secret-please-change-0123456789` and its refresh counterpart —
the exact strings `apps/api/.env.example` ships — are refused under `NODE_ENV=production`:

```
JWT_ACCESS_SECRET looks like a placeholder — this is the value apps/api/.env.example ships,
so it is public.
```

Two mechanisms do it (`placeholderSecretReason`, `env.schema.ts:108`): an exact-match list of the
two example strings, and a marker heuristic (`changeme`, `please-change`, `local-dev`, `example`,
`todo`, …) plus a "fewer than 8 distinct characters" rule. Length is not the check — both example
values are well over 32 characters.

**The limit, stated plainly.** This catches those two strings and things that read like
placeholders. It does **not** catch every secret published in this repository. Verified: the
local-preview pair in `docker-compose.yml:143-144`
(`local-preview-access-secret-not-for-production-01`) and the CI pair in
`.github/workflows/ci.yml` (`ci-only-access-secret-not-for-production-1234`) are both **accepted**
in production, because neither contains a listed marker. The published local-preview
`APP_ENCRYPTION_KEY` in `docker-compose.yml:156` is accepted too — that variable has a length check
and no placeholder check at all. Storage credentials and the database password have neither.

Treat the refusal as a safety net for the one mistake it was written for — copying `.env.example`
into a deployment — and not as a guarantee that whatever started the process is a real secret.
Generate every production secret; reuse nothing that is in git.

### 3.2 It refuses a missing production-required value — **holds**

Verified refusals, each with a complete environment minus one variable:

| Missing | Message |
| --- | --- |
| `APP_ENCRYPTION_KEY` | `APP_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -base64 32` |
| `CORS_ORIGINS` | `CORS_ORIGINS is required in production. …` |
| `APP_WEB_URL` | `APP_WEB_URL is required in production. …` |
| `TRUST_PROXY` | `TRUST_PROXY must be stated in production. …` |
| `DATABASE_URL`, `REDIS_URL`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | refused in **every** environment, not only production |

`APP_ENCRYPTION_KEY` is additionally refused everywhere when it does not decode to exactly 32
bytes, so a 16-byte key fails at startup rather than inside the cipher on the first save.

`APP_WEB_URL` is checked for **presence**, not for being a public address: a deliberate
`http://localhost:5173` is accepted in production, because the docker-compose preview really does
run that way. What the rule prevents is a deployment inheriting a value nobody chose.

### 3.3 It refuses `TRUST_PROXY=true` — **holds**

```
TRUST_PROXY=true trusts the whole X-Forwarded-For chain, which lets a client pick its own
rate-limit bucket. Set the number of proxies in front of the API instead (1 for a single load
balancer), or false when there is none.
```

Verified: `true` is refused in **every** environment, not only production; `false` and any positive
integer are accepted; `0` and any non-numeric string are refused. Under `NODE_ENV=production` the
variable must additionally be stated at all — an absence is refused, because "nobody said" and
"somebody said there is no proxy" have to be different answers.

Two things read it (`app.setup.ts:27`): the throttler's per-IP counting, and the refresh cookie's
`Secure` flag, which follows `req.secure` and therefore `X-Forwarded-Proto`. Left unset behind a
load balancer, a 30-day refresh token goes out without `Secure` on an HTTPS site, and every client
shares one rate-limit bucket. Nothing else fails and nothing logs a warning — which is exactly why
production insists on an answer.

Set it to the number of proxies **that actually rewrite the headers**, counted from the API
outwards: `1` for one nginx or one load balancer, `2` for a CDN in front of one. If the API is also
reachable directly on a network — not only on loopback — that path is an ingress where hop 1 is the
client itself, and the count is then wrong for it; publish the API's port to loopback only, as
`docker-compose.yml:176` does, or set `TRUST_PROXY=false` and put the proxy in front of the only
route in.

### 3.4 It refuses an empty `CORS_ORIGINS` in production — **holds**

Not on the original list but the same class of failure, so it is worth stating: an empty list is
refused in production. It is what a deployment inherits by doing nothing, and the failure it
produces — the browser refusing every request including the websocket handshake — looks like an
application bug rather than a configuration one.

### 3.5 `STORAGE_AUTO_CREATE_BUCKET` must be false in production — **holds**

```
STORAGE_AUTO_CREATE_BUCKET must be false in production: it turns a mistyped STORAGE_BUCKET into
a new, empty, unbacked-up bucket instead of an error.
```

Verified: `true` is refused under `NODE_ENV=production`; unset (which parses as `false`) and an
explicit `false` are both accepted. `docker-compose.yml:128` sets it `false` even in the local
preview and creates the bucket with a one-shot `minio-init` job instead.

---

## 4. A worked production environment

Values are shaped, never real. Generate every secret; put none of them in git.

```sh
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TRUST_PROXY=1                       # count the proxies that rewrite X-Forwarded-*

DATABASE_URL=postgresql://ashniva_app:<generated>@<db-host>:5432/ashniva_desk?schema=public
DB_POOL_MAX=11                      # × instances must stay under PostgreSQL max_connections
DB_POOL_IDLE_TIMEOUT_MS=30000
DB_POOL_ACQUIRE_TIMEOUT_MS=10000
DB_STATEMENT_TIMEOUT_MS=30000

REDIS_URL=redis://:<generated>@<redis-host>:6379
QUEUE_SHUTDOWN_GRACE_MS=15000       # shorter than the orchestrator's termination grace period

STORAGE_ENDPOINT=https://<object-storage-host>
STORAGE_REGION=<region>
STORAGE_BUCKET=ashniva-desk-prod    # must already exist
STORAGE_ACCESS_KEY=<generated>
STORAGE_SECRET_KEY=<generated>
STORAGE_FORCE_PATH_STYLE=false      # true for MinIO and most self-hosted gateways
STORAGE_AUTO_CREATE_BUCKET=false    # refused as true

JWT_ACCESS_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('base64'))">
JWT_REFRESH_SECRET=<a different one of the same>
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
APP_ENCRYPTION_KEY=<openssl rand -base64 32>   # back this up with the database

CORS_ORIGINS=https://desk.example.com,https://portal.example.com
APP_WEB_URL=https://desk.example.com
RATE_LIMIT_TTL_SECONDS=60
RATE_LIMIT_MAX=120                  # per instance — see §5

APP_TIMEZONE=Asia/Kolkata
INVITATION_TTL_HOURS=168
PASSWORD_RESET_TTL_MINUTES=60
REAUTH_TTL_SECONDS=300

OUTBOUND_ALLOWED_HOSTS=             # empty unless a private HTTP integration is genuinely needed
SMTP_ALLOWED_HOSTS=                 # empty unless the mail relay is on a private network

MESSAGING_PROVIDER=live
SUPPORT_CALLBACK_TRANSPORT=live
AI_PROVIDER=mock                    # http only once a tenant has an AI connection configured
IVR_PROVIDER=mock                   # tata cannot place a call — see tata-ivr-handoff.md
IVR_RECORDING_URL_TTL_SECONDS=300
THEME_PROVIDER=local
THEME_CACHE_TTL_SECONDS=300
THEME_REQUEST_TIMEOUT_MS=5000

METRICS_TOKEN=<openssl rand -hex 32>   # or unset, and accept having no metrics
# API_DOCS_ENABLED  — leave unset; off in production is the default
# ALLOW_DEMO_SEED   — leave unset. Never true on a real deployment
```

The web app has exactly one setting, `VITE_API_BASE_URL` (`apps/web/src/config/env.ts:8`,
default `/api/v1`), and it is **baked in at image build time**, not read at runtime. It ships to
the browser, so nothing secret may go near it. Leave it relative and let the reverse proxy forward
`/api` and `/ws` to the API, as `apps/web/nginx.conf` does; an absolute cross-origin value means
`CORS_ORIGINS` and the cookie's `SameSite=Strict` both have to be reconsidered.

---

## 5. Things the environment does not control, and one that surprises people

- **The rate limit is per API instance.** `ThrottlerModule` is configured with no storage adapter
  (`apps/api/src/common/rate-limit/rate-limit.module.ts`), so the counter is in memory. With N
  instances a client gets roughly N × `RATE_LIMIT_MAX` per window, and the per-route limits on
  login, password reset and invitations are diluted the same way. Size the limit knowing that, and
  put a rate limit at the reverse proxy if a hard global ceiling matters.
- **Health checks take no configuration.** `GET /api/v1/health/live` and `GET /api/v1/health` are
  both `@Public()` (`health.controller.ts:20,28`) and unauthenticated by design. Readiness probes
  database, Redis, storage, queue schedulers and Socket.IO, returning 503 when any is down; queue
  *depth* deliberately does not fail it. See `production-runbook.md` §2.
- **Error reporting is a code change, not a variable.** There is no `SENTRY_DSN`. `ErrorReporter`
  (`apps/api/src/common/errors/error-reporter.ts`) has a default implementation that does nothing;
  sending 5xx somewhere means replacing one provider in `ErrorsModule`.
- **Logs go to stdout as JSON.** No destination, rotation or shipping is configured here — that is
  the platform's job (`deployment-plan.md` §9).
- **`ALLOW_DEMO_SEED` is read by the seed, not the API.** It gates `pnpm db:seed` under
  `NODE_ENV=production` and has no effect on a running server.

---

## 6. Before the first production release

- [ ] Every secret generated fresh; nothing reused from `.env.example`, `docker-compose.yml`,
      `.github/workflows/ci.yml`, or staging
- [ ] `APP_ENCRYPTION_KEY` stored with the database backups, and the restore drill exercised with
      both together (`backup-and-restore.md` §5)
- [ ] `TRUST_PROXY` counted against the real ingress path, and the refresh cookie confirmed to
      carry `Secure` in a browser over TLS
- [ ] `DB_POOL_MAX × instances` checked against PostgreSQL's `max_connections`
- [ ] The bucket exists, is private, and is versioned
- [ ] `IVR_PROVIDER` decided deliberately — `mock` unless the Tata handoff has been completed
- [ ] `MESSAGING_PROVIDER=live` and a tenant SMTP connection actually configured, or accept that
      no notification leaves the deployment
- [ ] `GET /api/docs/json` returns 404 and `GET /api/metrics` returns 404 without the token
