# Staging checklist

Getting a build onto staging and proving it is worth showing anybody. Everything that reaches
production passes through here first.

Staging is **production-shaped**: `NODE_ENV=production`, real TLS, a real reverse proxy, more than
one API instance. A staging box configured like a developer's laptop proves nothing about
production, and the differences that matter — the trust-proxy setting, the shared websocket
adapter, the production-only configuration refusals — are exactly the ones a laptop cannot show.

Related: `staging-environment.md` (the configuration underneath this procedure),
`uat-checklist.md` (business sign-off), `release-checklist.md` (next).

---

## 1. Staging must differ from production only in data

- [ ] `NODE_ENV=production`
- [ ] Behind the same kind of reverse proxy, with `TRUST_PROXY` set to the real hop count
- [ ] At least **two** API instances — one instance cannot show a websocket fan-out bug or a
      draining bug
- [ ] Its own PostgreSQL, Redis and bucket. Never production's, not even read-only
- [ ] Its own secrets: `JWT_*`, `APP_ENCRYPTION_KEY`, storage credentials. A shared JWT secret
      means a staging token opens production
- [ ] `MESSAGING_PROVIDER=mock` and `IVR_PROVIDER=mock` unless a specific test needs otherwise
      — a staging run that emails real customers or telephones somebody is an incident
- [ ] `ALLOW_DEMO_SEED` unset, unless this staging environment is deliberately demo-seeded
- [ ] `API_DOCS_ENABLED=true` if the team uses the documentation here; it is off by default under
      `NODE_ENV=production`

---

## 2. Before deploying

- [ ] Branch is merged to `main` and CI is green: format, lint, type-check, unit, API e2e, builds,
      compose smoke
- [ ] Migrations reviewed and classified additive or destructive (see `release-checklist.md` §1) —
      staging is where a destructive one is caught, not production
- [ ] `npx prisma migrate diff --from-config-datasource --to-schema ./prisma/schema.prisma --script`
      against the staging database says **"This is an empty migration."** after deploying. A
      non-empty diff means the schema and the migrations disagree
- [ ] Any new environment variable is set here first, and written into the release record

---

## 3. Deploy

- [ ] Deploy the API image; watch the first instance apply migrations in its log
- [ ] Wait for readiness before rolling the rest
- [ ] Deploy the matching web image

---

## 4. Prove the deployment (30 minutes, every time)

### Health and configuration

- [ ] `GET /api/v1/health` is 200 with **all five** components up
- [ ] `.version` is the version you deployed
- [ ] `GET /api/docs/json` is 404 unless `API_DOCS_ENABLED=true` was set deliberately
- [ ] `GET /api/metrics` is 404 without the token and 200 with it
- [ ] `ashniva_queue_schedulers_missing` is `0`
- [ ] The log has no `Could not register a scheduled job`

### The things only a production-shaped environment can show

- [ ] Sign in over TLS; in devtools the refresh cookie has `Secure`, `HttpOnly` and
      `SameSite=Strict`. This is what proves `TRUST_PROXY` is right
- [ ] Open the app in two browsers against **different** API instances (or restart one and
      reconnect). A change made in one appears live in the other — this is the Redis Socket.IO
      adapter, and it is the bug a single-instance environment cannot see
- [ ] The `realtime` health component's message says a shared adapter is in use
- [ ] Restart one instance while the app is open: the browser reconnects, and no request 500s

### Core workflows

- [ ] Client raises a ticket in the portal
- [ ] Support assigns it; the assignee gets a notification within a minute (this is the scheduled
      delivery job, and it is the fastest proof that background work runs)
- [ ] Convert the ticket to a task; start it, log work, submit it
- [ ] Review and approve; publish a client update; the client sees it and nothing internal
- [ ] Resolve and close the ticket
- [ ] Upload an attachment and download it again — it downloads as an attachment, not inline
- [ ] Try uploading a file whose extension lies about its content (rename a `.html` to `.png`);
      it is refused
- [ ] An SLA policy edit saves in a reasonable time and the affected tickets' clocks change
- [ ] The internal chat delivers a message between two browsers

### Isolation

- [ ] A second client organization's user sees none of the first's tickets, projects, files or
      invoices
- [ ] An internal user without a permission gets 403, not a hidden button that still works

### Background work

- [ ] Leave staging running overnight, then check the next morning:
      - the daily report snapshot ran
      - the contract daily job ran
      - `ashniva_queue_jobs{state="failed"}` has not grown

---

## 5. Load and shape (before the first production release, and after anything structural)

- [ ] Seed staging with a realistic volume — thousands of tickets and tasks, not the demo dozen.
      Index problems and N+1s are invisible at demo scale and obvious at customer scale
- [ ] Watch `ashniva_db_pool_connections{state="waiting"}` under that load. Sustained above zero
      means `DB_POOL_MAX` is too small for the traffic
- [ ] Check the p95 of the ticket list, the dashboard and the SLA policy save

---

## 6. Handing over to UAT

- [ ] Everything above passes
- [ ] Staging is seeded with data the business recognises
- [ ] Known issues are written down, so testers report new ones rather than the same three
- [ ] `uat-checklist.md` is sent to the named sign-off person with the staging URL and credentials
