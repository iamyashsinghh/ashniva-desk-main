# Staging environment

The same configuration as production, answered differently in a small number of places — and
identical in every place where a difference would stop staging proving anything.

`production-environment.md` is the reference for what each variable is and what breaks when it is
wrong. This document says only where staging departs from it and why. `staging-checklist.md` is the
procedure for getting a build onto staging and proving it; this is the configuration underneath it.

---

## 1. What staging is for

To be the last place a mistake is cheap. That only works if staging is **production-shaped**: the
same `NODE_ENV`, the same kind of reverse proxy, more than one API instance. A staging box
configured like a developer's laptop proves nothing about production, because the failures that
reach production are the ones a laptop cannot show — the trust-proxy setting, the shared websocket
adapter, the production-only configuration refusals in `production-environment.md` §3, and a
migration's real duration against real row counts.

So the rule is: **staging differs from production in its data and its outbound reach, not in its
shape.**

---

## 2. What must be identical

| Setting | Why it cannot differ |
| --- | --- |
| `NODE_ENV=production` | Every refusal in `production-environment.md` §3 is switched on by this one value. Staging on `development` proves nothing about whether production will start |
| `TRUST_PROXY` | Set to staging's real hop count. This is the only place the refresh cookie's `Secure` flag and the per-IP throttle can be checked before they matter |
| `STORAGE_AUTO_CREATE_BUCKET=false` | Refused in production anyway. Create the staging bucket deliberately, as production will have to |
| `DB_POOL_MAX`, and the pool timeouts | Pool exhaustion under load is one of the things staging exists to find |
| `QUEUE_SHUTDOWN_GRACE_MS`, and the orchestrator's termination grace period | Draining on deploy cannot be tested on one instance or with a mismatched grace period |
| At least **two** API instances | One instance cannot show a websocket fan-out bug or a draining bug. The `realtime` health component says which Socket.IO adapter is in use; on staging it must say the shared one |
| The reverse proxy, and real TLS | `Secure`, `HttpOnly`, `SameSite=Strict` on the refresh cookie are only observable over TLS through a proxy |

---

## 3. What must differ

### 3.1 Its own everything

| Setting | Staging value |
| --- | --- |
| `DATABASE_URL` | Its own PostgreSQL. **Never production's, not even read-only** |
| `REDIS_URL` | Its own Redis. A shared Redis means staging's queue workers pick up production's jobs |
| `STORAGE_*` | Its own bucket and its own credentials. One credential reads every tenant's files in whichever bucket it points at |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Its own pair, generated. **A shared JWT secret means a staging token opens production** |
| `APP_ENCRYPTION_KEY` | Its own key. Sharing production's puts a production-grade secret on a box more people can reach |
| `CORS_ORIGINS`, `APP_WEB_URL` | Staging's own hostnames |
| `METRICS_TOKEN` | Its own, if staging is scraped |

These are not conveniences. Each one is the difference between "staging was compromised" and
"production was compromised".

### 3.2 A real but non-customer database

Staging's database is a real PostgreSQL running the real migrations — that is the point — but it
holds **no customer data**. Two acceptable ways to fill it, and one that is not:

- **Seeded demo data.** `pnpm db:seed` plants fictional organizations and `@example.com` users.
  Under `NODE_ENV=production` the seed refuses unless `ALLOW_DEMO_SEED=true`
  (`apps/api/prisma/seed.ts:34`), so a deliberately demo-seeded staging sets it — and a staging
  environment used for anything closer to production should not. Every demo user shares one
  password from `SEED_USER_PASSWORD`, so set that to something staging-specific and treat the
  staging URL as semi-public.
- **Generated volume.** `staging-checklist.md` §5 asks for thousands of tickets and tasks before
  the first production release. Index problems and N+1 queries are invisible at demo scale and
  obvious at customer scale, and this is the only environment where finding them is free.
- **Not a copy of production.** A restored production dump on staging puts real customer records,
  real audit history and real integration ciphertext on a box with weaker access control and a
  URL more people hold. If a production-shaped dataset is genuinely needed to reproduce a bug,
  that is an anonymised extract with an agreed lifetime, decided as a data-protection question
  rather than an engineering convenience.

### 3.3 Mock providers, so staging cannot reach a customer

This is the difference that matters most, because getting it wrong is an incident rather than a
test failure.

| Setting | Staging | Why |
| --- | --- | --- |
| `MESSAGING_PROVIDER` | `mock` | `live` sends real email and real WhatsApp messages to whatever addresses the data contains. A staging run that emails customers is an incident. Captured in memory instead, and nothing leaves the deployment |
| `SUPPORT_CALLBACK_TRANSPORT` | `mock` | `live` posts to a registered product's real callback endpoint. Set it `live` only against an endpoint someone owns and expects to be hit |
| `IVR_PROVIDER` | `mock` | `live` telephony on staging telephones a real person. `mock` records what would have been asked and exercises the whole routing, fallback and recording path without a telephony account — and it is the only way to test that path at all today (`tata-ivr-handoff.md`) |
| `AI_PROVIDER` | `mock` | The default anyway. `http` spends a tenant's AI credit on test data |
| `THEME_PROVIDER` | `local` | The default. `remote` has no vendor to talk to (`theme-manager-integration.md`) |
| `OUTBOUND_ALLOWED_HOSTS`, `SMTP_ALLOWED_HOSTS` | empty unless a specific test needs one | Staging is where an accidentally permissive allow-list is discovered cheaply |

Turning one of these to `live` for a specific test is legitimate; turning it on and leaving it is
how staging mails a customer six weeks later. Put it back in the same session, and write down that
it was changed.

### 3.4 Documentation and observability

| Setting | Staging | Why |
| --- | --- | --- |
| `API_DOCS_ENABLED` | `true`, if the team uses it | Off by default under `NODE_ENV=production`. Staging is a reasonable place to publish it deliberately; production is not |
| `LOG_LEVEL` | `debug` is defensible | Bodies are never logged at any level, so this is a volume decision. Production stays at `info` |
| `RATE_LIMIT_MAX` | same as production | Tempting to raise it for test runs. Don't: the per-instance counter (`production-environment.md` §5) is one of the things staging should surface |

---

## 4. A worked staging environment

Differences from the production example in `production-environment.md` §4 are marked.

```sh
NODE_ENV=production                 # same as production, deliberately
PORT=3000
LOG_LEVEL=debug                     # differs: volume only, no bodies are logged
TRUST_PROXY=1                       # same shape as production; count staging's own proxies

DATABASE_URL=postgresql://ashniva_app:<generated>@<staging-db>:5432/ashniva_desk?schema=public
DB_POOL_MAX=11                      # same as production
DB_POOL_IDLE_TIMEOUT_MS=30000
DB_POOL_ACQUIRE_TIMEOUT_MS=10000
DB_STATEMENT_TIMEOUT_MS=30000

REDIS_URL=redis://:<generated>@<staging-redis>:6379
QUEUE_SHUTDOWN_GRACE_MS=15000

STORAGE_ENDPOINT=https://<staging-object-storage>
STORAGE_REGION=<region>
STORAGE_BUCKET=ashniva-desk-staging
STORAGE_ACCESS_KEY=<generated, staging only>
STORAGE_SECRET_KEY=<generated, staging only>
STORAGE_FORCE_PATH_STYLE=false
STORAGE_AUTO_CREATE_BUCKET=false    # same as production; refused as true

JWT_ACCESS_SECRET=<generated, staging only>
JWT_REFRESH_SECRET=<a different one, staging only>
APP_ENCRYPTION_KEY=<openssl rand -base64 32, staging only>

CORS_ORIGINS=https://desk.staging.example.com
APP_WEB_URL=https://desk.staging.example.com
RATE_LIMIT_TTL_SECONDS=60
RATE_LIMIT_MAX=120                  # same as production, on purpose

APP_TIMEZONE=Asia/Kolkata
INVITATION_TTL_HOURS=168
PASSWORD_RESET_TTL_MINUTES=60
REAUTH_TTL_SECONDS=300

OUTBOUND_ALLOWED_HOSTS=
SMTP_ALLOWED_HOSTS=

MESSAGING_PROVIDER=mock             # differs: nothing may reach a customer
SUPPORT_CALLBACK_TRANSPORT=mock     # differs
AI_PROVIDER=mock
IVR_PROVIDER=mock                   # differs from a telephony-enabled production
THEME_PROVIDER=local

API_DOCS_ENABLED=true               # differs: deliberate, for the team
METRICS_TOKEN=<generated, staging only>

# Only on a deliberately demo-seeded staging environment:
ALLOW_DEMO_SEED=true                # differs; never on production
SEED_USER_PASSWORD=<staging-specific, not ChangeMe123!>
```

---

## 5. Promoting a configuration change to production

A staging environment is also the record of what production will need. Every variable that changes
here has to arrive in production's secret store **before** the image that reads it, because the API
refuses to start on an invalid environment — a missing variable is an outage, not a warning.

- [ ] The new variable is set on staging first, and the deployment restarted cleanly with it
- [ ] It is written into the release record with its production value decided (not its staging one)
- [ ] Whether it is a *shape* setting (must match production) or a *reach* setting (must not) is
      stated explicitly — the mock switches in §3.3 are the ones that get promoted by accident
- [ ] `production-environment.md` §2 is updated in the same pull request as the schema change

---

## 6. What staging still does not prove

Say these out loud rather than discovering them in production.

- **Migration duration.** A migration is timed honestly only against production-sized tables. If
  staging's data is demo-scale, `release-checklist.md` §1 still requires timing against a restored
  copy of production.
- **The production secret store.** Staging can prove the API starts with a value; it cannot prove
  that production's store injects it correctly.
- **Real provider behaviour.** With every provider on `mock`, staging exercises Desk's half of each
  integration and none of the vendor's. The Tata IVR adapter in particular has no vendor half at
  all (`tata-ivr-handoff.md`), so no amount of staging changes that.
- **Load, unless someone generates it.** §5 of `staging-checklist.md` is a task, not a property of
  the environment.
