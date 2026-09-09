# Deployment plan

How Ashniva Desk is deployed: what each piece is, what the deployment surface already provides,
and — where the answer is a business decision rather than an engineering one — what the decision is
and what each option costs.

**This plan does not choose a cloud provider.** It names the properties a platform must have and
leaves the choice where it belongs. Sections marked **Decision** are for whoever owns the budget
and the risk, not for whoever writes the manifests.

**There is no CD pipeline, and this plan does not build one.** CI (`.github/workflows/ci.yml`)
validates every pull request and every push to `main` — format, lint, type-check, unit tests, API
end-to-end tests, production builds, and a Docker Compose smoke test that starts the real images
and signs in through them. It builds no release artefact, pushes no image and deploys nothing.
**Releases are performed by a person, by hand, against `release-checklist.md`.** That is a
deliberate position, stated in `production-runbook.md` §9 and in the release checklist itself; §14
below says what building a pipeline would take, for when somebody decides to.

Related: `production-environment.md` and `staging-environment.md` (configuration),
`production-runbook.md` (operating it), `release-checklist.md`, `rollback-procedure.md`,
`backup-and-restore.md`, `incident-procedure.md`.

---

## 1. The shape of a deployment

| Piece | What it is | Stateless? | Loses what if it dies |
| --- | --- | --- | --- |
| **API** | NestJS, `apps/api`, N instances behind a load balancer | yes | Nothing, if N > 1 |
| **Web** | Static React build served by nginx, which also proxies `/api` and `/ws` | yes | Nothing |
| **Mobile** | React Native on Expo, `apps/mobile` | n/a | n/a — see §5 |
| **PostgreSQL 16** | Every record. Row-level security is enforced here, not only in code | no | Everything. The only thing that *must* be backed up, with its encryption key |
| **Redis** | BullMQ queues, repeatable job schedules, Socket.IO fan-out | no | Queued and scheduled work; live updates degrade to one instance |
| **Object storage** | Attachments and invoice PDFs, one bucket, org-prefixed keys | no | Every attachment. The database still lists them |

**Every API instance is also a queue worker.** There is no separate worker deployment: each
instance runs a BullMQ processor for all eleven queues
(`apps/api/src/infrastructure/queue/queue-names.ts`) as well as serving HTTP. Three consequences
run through the whole of this plan — one instance is a single point of failure for background work,
worker concurrency is charged against `DB_POOL_MAX`, and draining on deploy matters (§7, §11).

---

## 2. The API

**What exists.** `apps/api/Dockerfile` builds a multi-stage production image: dependencies and
compilation in `deps`/`build`, and a runtime stage with no pnpm in it that runs `node` and the
Prisma CLI directly. Debian (glibc) rather than Alpine, because argon2 and the Prisma engines ship
glibc builds. It runs as the unprivileged `node` user, exposes 3000, and carries a `HEALTHCHECK`
against `/api/v1/health/live`.

`apps/api/docker/entrypoint.sh` is the whole runtime interface:

| Command | What it does |
| --- | --- |
| `start` (default) | `prisma migrate deploy`, then `node dist/main.js` |
| `migrate` | apply pending migrations and exit |
| `seed` | load the idempotent seed data and exit |
| `sweep <queue> <job>` | enqueue one occurrence of a scheduled job through BullMQ's own API, and exit |

**What a platform must provide.** Somewhere to run OCI containers with: environment variables from
a secret store, a configurable termination grace period (§7), an HTTP health probe on two different
paths, and rolling replacement one instance at a time.

**Decision — how many API instances.** One instance is simpler and is a single point of failure for
background work as well as for HTTP; it also means the Socket.IO Redis adapter is never exercised,
so the first scale-up is the first time anyone finds out whether it works. Two or more removes
both, costs proportionally more, and requires `DB_POOL_MAX × instances` to stay under PostgreSQL's
`max_connections`. **Recommended: at least two in production**, and staging must have at least two
regardless (`staging-environment.md` §2), because a fan-out bug is invisible on one.

---

## 3. The web app

**What exists.** `apps/web/Dockerfile` builds the Vite bundle and serves it from
`nginxinc/nginx-unprivileged` on port 8080. `apps/web/nginx.conf` serves the SPA with an
`index.html` fallback, immutable caching for hashed assets under `/assets/`, `X-Content-Type-Options`,
`X-Frame-Options` and `Referrer-Policy` headers, and proxies two paths to the API: `/api/` and
`/ws/`, the latter with the `Upgrade`/`Connection` headers a websocket needs. Both set
`X-Forwarded-For`, `X-Forwarded-Proto` and `X-Request-Id`.

**The one thing to get right.** `VITE_API_BASE_URL` is a **build argument**, not a runtime setting
(`apps/web/Dockerfile`, `apps/web/src/config/env.ts:8`). It is baked into the bundle, it ships to
the browser, and nothing secret may go near it. Left at its default `/api/v1` the browser calls the
same origin and nginx forwards it, which is why no CORS configuration is needed for the first-party
app.

**Decision — same origin or separate hosts.** Serving the web app and the API from one origin
through this nginx is the configuration the code assumes: no CORS on the first-party path, and the
refresh cookie's `SameSite=Strict` works without qualification. Splitting them onto separate
hostnames means an absolute `VITE_API_BASE_URL`, every browser origin listed in `CORS_ORIGINS`, and
a re-examination of the cookie's `SameSite` — which is a security change, not a routing one.
**Recommended: same origin.**

**Decision — nginx container or a CDN/static host.** The nginx container is what CI smoke-tests, and
it is also the reverse proxy in front of the API. Putting the static build on a CDN instead means
something else must terminate TLS and proxy `/api` and `/ws`, and that something must set the same
forwarded headers or `TRUST_PROXY` becomes wrong (§8).

---

## 4. Reverse proxy and TLS

**What exists.** nginx inside the web image, configured to forward `/api` and `/ws` with the
forwarded headers set. **No TLS termination exists anywhere in this repository** — the compose
stack is plain HTTP on localhost. Terminating TLS is entirely the platform's job.

Requirements, in order of how badly getting them wrong hurts:

- **The forwarded headers must be set by the last proxy**, and `TRUST_PROXY` must equal the number
  of proxies that rewrite them. Getting this wrong drops `Secure` from a 30-day refresh cookie on
  an HTTPS site, silently. See `production-environment.md` §3.3.
- **The API must not be independently reachable.** For a request that skips the proxy, hop 1 is the
  client, so it picks its own `X-Forwarded-For` and `X-Forwarded-Proto`. `docker-compose.yml:170-176`
  publishes the API on loopback only for exactly this reason; a real deployment must do the
  equivalent with network policy or a private subnet.
- **Long-lived connections must be allowed** for `/ws`. A load balancer with a short idle timeout
  turns live updates into a reconnect loop.
- **The body limit must be at least 10 MiB**, matching `MAX_FILE_BYTES`
  (`packages/types/src/domain/file-rules.ts:11`), or uploads fail at the proxy with an error the
  API never sees.
- **HSTS, TLS 1.2+, and automated certificate renewal** belong at the terminator. `helmet()` sets
  the application-level headers (`app.setup.ts:29`); it does not obtain certificates.

**Decision — where TLS terminates.** A managed load balancer (certificates and renewal handled, one
less thing to run, provider-specific) or your own nginx/Caddy/Traefik with ACME (portable, one more
thing to keep patched and to monitor for expiry — a lapsed certificate is a total outage). Either
is fine; **what is not fine is nobody owning renewal.**

---

## 5. Mobile distribution

**What exists.** A working Expo application with 176 tests, `expo.extra.apiBaseUrl` in
`apps/mobile/app.json`, and its own README that says plainly: *"This is a foundation, not a store
submission. Everything below works and is tested; what it does not have is app-store assets, EAS
build profiles, code signing, or a release pipeline."* CI builds the Metro bundle for iOS and
Android (`.github/workflows/ci.yml`, the `build` job) — which catches a native import a type-check
cannot see — and nothing more.

**What is missing before anyone can install it.** Apple Developer and Google Play accounts and the
legal entity behind them; an `eas.json` with build profiles; iOS signing certificates and
provisioning profiles, and an Android keystore (**losing the Android keystore means the app can
never be updated under that package name** — it belongs in the same store as the production
secrets, with the same backup discipline); icons, splash screens, store listings, screenshots and a
privacy policy; and a runtime way to set the API URL, since `expo.extra.apiBaseUrl` is currently a
committed default pointing at `localhost`.

**Decision — the distribution channel, which is a business decision with a long lead time.**

| Option | What it means |
| --- | --- |
| **Public app stores** | Apple and Google review, store listings, a privacy policy, and a review cycle on every release — days, not minutes. Reaches anyone |
| **Managed / enterprise distribution** (Apple Business Manager, Google managed Play, MDM) | No public review, install restricted to managed devices. Requires the customer to run device management |
| **Internal only** (TestFlight, Play internal testing, Expo dev builds) | Fastest, no review, tester-count and expiry limits. Appropriate while the app is a foundation |
| **Not yet** | Web works on a phone browser. Costs nothing and blocks nothing |

Mobile releases are **not coupled to API releases** and must not be treated as if they were: a
phone app cannot be rolled back once installed, so the API has to stay compatible with whatever
version is in people's pockets. That constraint arrives with the first store submission, and it is
worth deciding before it does rather than after.

---

## 6. PostgreSQL

**What exists.** `postgres:16-alpine` in the development compose stack; migrations in
`apps/api/prisma/migrations`; row-level security enabled and *forced* on every tenant table, with
the API connecting as `ashniva_app`, a role without `BYPASSRLS` (`security-plan.md`, Phase 2).

**Requirements.** PostgreSQL 16. `max_connections` comfortably above `DB_POOL_MAX × instances`
plus migrations, psql and any monitoring agent. The application role must not be a superuser and
must not hold `BYPASSRLS` — RLS is a real control here, not a defence-in-depth nicety. Encryption
at rest and network isolation from anything but the API.

**Decision — managed service or self-hosted.** Managed gives point-in-time recovery, patching and
failover as a product, at a price, with less control over extensions and parameters. Self-hosted is
cheaper and hands you WAL archiving, backup verification, patching and failover as work you must
actually do. **The question that decides it is §10's RPO**: if the business cannot lose a day of
work, somebody is running continuous WAL archiving either way, and a managed service is usually the
cheaper way to buy it.

**No read replicas.** One PostgreSQL, no horizontal read scaling — stated in
`production-runbook.md` §9. Adding one is not a configuration change: it needs replica-aware routing
in the data layer, and `TenantAwarePool`'s per-checkout tenant stamp has to hold on the replica too.

---

## 7. Redis, queues and workers

**What exists.** `redis:7-alpine` with `--appendonly yes` in the development stack. Eleven queues,
each with a repeatable schedule registered by `QueueSchedulerRegistrar`, which records whether each
one landed, retries in the background if Redis was not ready, and reports the missing ones through
readiness. Bounded, ordered shutdown: on SIGTERM the queue workers close first, in-flight jobs get
`QUEUE_SHUTDOWN_GRACE_MS` to finish, and only then do the database and storage clients close
(`infrastructure/queue/queue-shutdown.service.ts`).

**Requirements.** Persistence on (AOF or RDB) — losing Redis loses queued and scheduled work, which
is recoverable but not free (`backup-and-restore.md` §6). A `maxmemory-policy` that does **not**
evict: BullMQ job data is not a cache, and an eviction is a silently dropped job. Network isolation
from everything but the API.

**The termination grace period must exceed `QUEUE_SHUTDOWN_GRACE_MS`** (default 15 s), or the
orchestrator kills the process mid-drain and the bounded shutdown buys nothing. This is a platform
setting, not an application one, and it is the single most commonly missed item on this page.

**Decision — separate worker instances.** Not today: every API instance is a worker, and there is
no separate worker entry point to deploy. Splitting them would let queue capacity scale
independently of HTTP capacity and would stop a long job competing with request traffic for the
pool — but it is an application change (a worker-only bootstrap, and a way to keep HTTP instances
from registering schedulers), not a deployment one. **The deployment-level lever available now is
`DB_POOL_MAX` and instance count.**

**Decision — Redis high availability.** A single Redis is a single point of failure for background
work and for cross-instance live updates; neither is a data-loss failure, and both recover when it
comes back. Managed Redis or a Sentinel/cluster setup removes the outage window at a cost. Note
that the Socket.IO Redis adapter tolerates a brief outage — cross-instance delivery pauses and
resumes, sockets stay connected.

---

## 8. Object storage

**What exists.** An S3-compatible client with configurable endpoint, region, path style and
credentials; MinIO in the development stack; keys prefixed `<organizationId>/<uuid>/<name>`;
readiness probes the bucket.

**Requirements.**

- The bucket **must exist before the API starts**: `STORAGE_AUTO_CREATE_BUCKET=true` is refused in
  production, so that a mistyped bucket name is an error rather than a new, empty, unbacked-up
  bucket.
- **Private.** No public read, ever. Every download is authorized by the API first.
- **Versioning on.** A deletion through the API is a real `DeleteObjectCommand`, and versioning is
  the only thing that survives one (`backup-and-restore.md` §2).
- `STORAGE_FORCE_PATH_STYLE=true` for MinIO and most self-hosted gateways; `false` for
  virtual-hosted-style S3.

**Isolation is application-level, and this is worth saying to whoever signs off on it.** One bucket,
one credential. The keys are unguessable and every download is authorized by the API, but object
storage has no equivalent of PostgreSQL's row-level security: **anything holding
`STORAGE_ACCESS_KEY` can read every tenant's files.** Treat that credential as equivalent to a
database superuser password.

**Decision — which S3-compatible store.** Any works. The properties that matter are versioning,
lifecycle rules, encryption at rest, and a credential that can be scoped to one bucket. Self-hosted
MinIO is a real option and makes bucket mirroring your job.

---

## 9. Logs, monitoring, error tracking and probes

### Logs

Structured JSON on stdout via pino (`apps/api/src/logging/logging.module.ts`). Pretty output only
in `development`. Every request carries a `requestId`, taken from an incoming `X-Request-Id` when
present, echoed in the response header and in every error body — **that is the join key between a
user's screenshot and the log**. `authorization`, `cookie` and `set-cookie` are redacted; request
bodies are never logged; `/api/v1/health` is excluded from automatic request logging so probes do
not drown the log.

Nothing about shipping, retention or rotation is configured in the application. The platform
collects stdout.

**Decision — retention.** Long enough to investigate an incident somebody reports late and to
satisfy whatever the contracts say; short enough to be affordable. Logs contain no credentials and
no request bodies, but they do contain user ids, IP addresses and URLs, so retention is a
data-protection question, not only a storage one. **30–90 days is the usual shape of the answer**;
what matters is that somebody writes a number down.

### Metrics

`GET /api/metrics` in Prometheus format, guarded by `METRICS_TOKEN` as a bearer secret. Unset, the
route answers 404 to everyone — and a wrong token also gets 404. `production-runbook.md` §3 lists
the metrics worth an alert; the ones that catch a bad deployment fastest are
`ashniva_queue_schedulers_missing > 0` and `ashniva_db_pool_connections{state="waiting"}` sustained
above zero.

**Decision — the monitoring stack.** Any Prometheus-compatible scraper. The application-side
requirement is one bearer token and network reach to every instance. Not scraping at all is a
choice too: it costs you `ashniva_queue_schedulers_missing`, which is the only signal that
background work has stopped while the API keeps serving requests correctly.

### Error tracking

Unhandled 5xx errors are logged with the request id and passed to `ErrorReporter`
(`apps/api/src/common/errors/error-reporter.ts`), **whose default implementation does nothing**.
4xx is deliberately not reported.

**Decision — whether to wire one up, and to what.** There is no `SENTRY_DSN` and no environment
variable for this: sending errors to Sentry, GlitchTip or an internal collector means replacing one
provider in `ErrorsModule` — a code change in a pull request, not a deployment setting. Until that
is done, the log is the only record of a 5xx, and finding one means somebody looking.

### Probes

| Probe | Path | Auth | Failure means |
| --- | --- | --- | --- |
| Liveness | `GET /api/v1/health/live` | none | The process is wedged. Restart |
| Readiness | `GET /api/v1/health` | none | 503: do not send traffic |

Readiness checks database, Redis, storage, queue schedulers and Socket.IO in parallel and names
which one is down (`health.service.ts`). Two properties to configure around:

- **Queue depth deliberately does not fail readiness.** A backlog means the workers are behind;
  removing instances for that turns a backlog into an outage. Alert on depth from metrics instead.
- **Give readiness a start-up allowance.** The first instance of a deployment applies migrations
  before it listens, so a readiness probe with a short failure threshold will kill it mid-migration.
  The image's own `HEALTHCHECK` uses a 40-second start period; a platform probe needs the
  equivalent, sized to the slowest migration in the release.

Use `live` for restarts and `health` for load-balancer membership. Using `health` for restarts means
a Redis blip restarts every API instance at once.

---

## 10. Backups

Fully specified in `backup-and-restore.md`; the deployment-level obligations are:

- **PostgreSQL**, custom-format dumps, nightly at minimum, plus WAL archiving or the managed
  provider's point-in-time recovery if a day of loss is unacceptable.
- **Object storage**, mirrored somewhere the production credential cannot reach, with versioning on.
- **`APP_ENCRYPTION_KEY`, stored with the database backups and restored with them.** A database
  restored without its key cannot decrypt a single integration credential, test-account password or
  callback signing secret, and there is no recovery — every integration is reconfigured by hand,
  with credentials nobody may still have.
- **Redis is not backed up.** Queues and schedules are re-created by restarting an instance.

**Decision — RPO and RTO, and who agrees them.** A nightly dump alone is an RPO of up to 24 hours.
Say that number out loud and check somebody outside engineering agrees with it, because it is the
amount of customer work the business is willing to lose. RTO follows from where the backups live and
how fast they restore — measure it in the drill rather than estimating it.

**Automated backup verification does not exist.** The restore drill (`backup-and-restore.md` §5) is
manual. Put it in the calendar; an untested backup is not a backup.

---

## 11. Migrations during a deploy

**Migrations run on container start.** The entrypoint runs `prisma migrate deploy` before
`node dist/main.js`, so the first instance of a new release applies them. There is no approval step
and **no automatic reversal**: Prisma generates no `down` migration.

That makes the migration classification in `release-checklist.md` §1 the most consequential five
minutes of a release, because it decides whether a rollback is a redeploy or a restore:

| | Additive | Destructive |
| --- | --- | --- |
| What it did | new tables, nullable columns, indexes, enum values | dropped or renamed column or table, narrowed type, new `NOT NULL`, removed enum value |
| Previous image against the new schema | runs fine | breaks, or writes wrong data |
| Rollback | redeploy the previous image | restore the database; expect data loss |

Every migration to date is additive (`rollback-procedure.md` §1).

**Long migrations are an outage.** `migrate deploy` runs inside a transaction and blocks the
instance until it finishes; one transaction wraps every statement, so a lock taken by the first is
held until the last commits. `20260919090000_soft_delete_partial_indexes` creates thirteen indexes
across six tables, and writes to all six are blocked for the sum of all thirteen. Time the **whole
migration** against a restored copy of production, and if it is slow ship it as its own release
ahead of the code, using `CREATE INDEX CONCURRENTLY` in a migration marked to run outside a
transaction.

**Decision — where migrations run.** Today they run in the first API container as a side effect of
starting. That is simple, needs no extra machinery, and couples "the app is starting" to "the schema
is changing" — a failed migration is a failed container, and a slow one is a slow rollout. The
alternative is a separate one-shot job (`entrypoint.sh migrate`, which exists for this) run before
the rollout, which separates the two failures and lets the migration be watched on its own. **The
alternative costs nothing to adopt and is worth it once a migration is long enough to be timed.**

---

## 12. Secret management

`security-plan.md` states the strategy: the deployment platform's secret store, injected as
environment variables. The deployment-level obligations:

- **Nothing in git.** Only `.env.example` files. Note that `apps/api/.env.example`,
  `docker-compose.yml` and `.github/workflows/ci.yml` all contain working non-production secrets —
  they are public by definition, and only two of them are refused by name in production
  (`production-environment.md` §3.1). Generate everything fresh.
- **Distinct per environment.** A shared JWT secret means a staging token opens production.
- **`APP_ENCRYPTION_KEY` is not rotatable in place.** Changing it does not re-encrypt what is
  already stored; the `v1:` prefix in the payload format exists so a re-encrypting rotation *can* be
  written, and it has not been.
- **`STORAGE_ACCESS_KEY` is a tenant-isolation boundary** (§8). Rotate it on the same schedule as a
  database credential.
- **The Android keystore** (§5), once it exists, belongs here too.

**Decision — which secret store.** Kubernetes Secrets with encryption at rest and RBAC, a cloud
provider's manager, or a self-run Vault. What the application needs is only that values arrive as
environment variables at process start. What the *business* needs is an answer to who can read
production secrets, how a rotation is performed, and how a leaked credential is revoked out of
hours — and that answer is the same whichever product is chosen.

---

## 13. Rollback

`rollback-procedure.md` is the procedure. The deployment-level requirements it depends on:

- **The previous image tag and digest are recorded** at release time. A tag can be moved; a digest
  cannot.
- **Images are retained** long enough to roll back to them. A registry lifecycle rule that deletes
  the previous release is a rollback you cannot perform.
- **Rolling back the API and the web app together** — they are versioned together and the web
  bundle calls the API's contract.
- **A restore path** for the case a destructive migration ever ships (§11).

---

## 14. The staging → production path

```
pull request  →  CI (format, lint, typecheck, unit, e2e, builds, compose smoke)
              →  squash merge to main
              →  build and push images from the tagged commit, by hand
              →  staging  (staging-checklist.md, staging-environment.md)
              →  UAT sign-off by a named person  (uat-checklist.md)
              →  production  (release-checklist.md)
              →  30 minutes of watching  (release-checklist.md §6)
```

Three properties of that path are load-bearing:

- **Everything that reaches production has been on staging**, and staging is production-shaped —
  same `NODE_ENV`, same proxy shape, at least two instances. The production-only configuration
  refusals, the websocket fan-out and the draining behaviour cannot be tested anywhere else.
- **New environment variables are set in the secret store before the image that reads them.** The
  API refuses to start on an invalid environment, so a missing variable is an outage, not a warning.
- **The migration classification happens before deploying, not after something breaks.**

**No CD pipeline exists, and building one is not part of this plan.** For when somebody decides to,
what it would need is: a tagged-release workflow that builds and pushes both images and records
their digests; a registry with retention that outlives a rollback window; deployment credentials
held somewhere the release workflow can reach and a person cannot casually read; an automated
version of the §5 verification in `release-checklist.md`; and an explicit decision about whether a
migration runs automatically or waits for a human. Until all of those exist, **an automated
deployment is a faster way to reach the same manual verification**, and the checklists are the
control that actually holds.

---

## 15. What this deployment does not have

Say these out loud before promising them to anyone. (Same list as `production-runbook.md` §9,
repeated here because this is the page somebody reads before planning a launch.)

- **No automated deployment.** Releases are performed by hand against `release-checklist.md`.
- **No TLS termination in the repository.** Entirely the platform's job.
- **No dead-letter processing.** Failed jobs are retained and readable — the last 5000 per queue by
  default (`infrastructure/queue/queue.module.ts:34`), fewer where a queue overrides it — and
  nothing replays them.
- **No object-storage tenancy.** One bucket, one credential; isolation is enforced by the API.
- **No automated backup verification.** The restore drill is manual.
- **No horizontal read scaling.** One PostgreSQL, no read replicas.
- **No separate worker deployment.** Every API instance is a worker.
- **No error-tracking destination.** `ErrorReporter`'s default does nothing.
- **No mobile release pipeline.** No signing, no build profiles, no store presence.
- **No working telephony.** `IVR_PROVIDER=tata` cannot place a call — see `tata-ivr-handoff.md`.
- **No Theme Manager.** `THEME_PROVIDER=remote` has no vendor to talk to — see
  `theme-manager-integration.md`.
