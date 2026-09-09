# Release checklist

Deploying to production. Work top to bottom; tick each box in the release record, not in your head.

There is no automated deployment — no CD workflow exists, on purpose. A release is performed by a
person against this page.

Related: `staging-checklist.md` (before this), `uat-checklist.md` (sign-off), `rollback-procedure.md`
(when it goes wrong), `production-environment.md` (what every variable does),
`deployment-plan.md` (how the pieces are deployed).

---

## 0. Preconditions

- [ ] Everything in the release has been on staging, against `staging-checklist.md`
- [ ] UAT is signed off (`uat-checklist.md`) by a named person
- [ ] `main` is green: format, lint, type-check, unit tests, API e2e, builds, compose smoke
- [ ] No unmerged fix is expected to go out "at the same time"
- [ ] The previous release's image tag is written down — you will need it to roll back
- [ ] Someone other than you knows the release is happening and when

---

## 1. Classify the migrations

**Do this before anything else.** It decides whether a rollback is a redeploy or a restore.

```bash
git diff --name-only <previous-release-tag>..HEAD -- apps/api/prisma/migrations
```

For each migration, read the SQL and classify:

- [ ] **Additive** — new tables, new nullable columns, new indexes, new enum values. The previous
      image runs fine against the new schema.
- [ ] **Destructive** — a dropped or renamed column or table, a narrowed type, a new `NOT NULL`, a
      removed enum value. The previous image will break.

If **any** migration is destructive:

- [ ] A written reversal exists and has been reviewed alongside the migration
- [ ] It has been tested against a restored copy of production, not a seeded database
- [ ] The rollback plan says "restore", and the acceptable data loss is agreed **before** deploying
- [ ] The deployment window is chosen for that risk, not for convenience

Record the classification in the release record. `rollback-procedure.md` §1 explains why.

### Long-running migrations

`prisma migrate deploy` runs on container start, inside a transaction, and blocks the instance
until it finishes. A migration that takes minutes on production-sized tables is a minutes-long
outage.

- [ ] Any index on a large table has been timed against a restored copy — the **whole migration**,
      not the slowest statement. `CREATE INDEX` takes a SHARE lock that blocks writes, and one
      transaction wraps every statement, so the lock taken by the first is held until the last one
      commits. `20260919090000_soft_delete_partial_indexes` creates thirteen indexes across six
      tables; writes to all six are blocked for the sum of all thirteen, and
      `20260922090100_list_ordering_indexes` adds six more across `tickets`, `tasks`, `incidents`,
      `problems`, `audit_logs` and `contract_hour_ledger`. Both files spell out the
      `CREATE INDEX CONCURRENTLY` procedure to take beforehand, and both are `IF NOT EXISTS`, so
      an index built by hand makes its statement a no-op rather than a failed deployment
- [ ] If it is slow, it ships as its own release, ahead of the code, using
      `CREATE INDEX CONCURRENTLY` in a migration marked to run outside a transaction

---

## 2. Prepare

- [ ] Version bumped and tagged; `apps/api/src/version.ts` matches the tag
- [ ] Release notes written: what changed, what operators must do, what is risky
- [ ] Images built from the tagged commit, for API **and** web, and pushed
- [ ] Image digests recorded (a tag can be moved; a digest cannot)
- [ ] New environment variables from this release are set in the secret store **before** deploying
      — the API refuses to start on an invalid environment, so a missing one is an outage, not a
      warning

New settings in this release:

| Variable | Required? | Default |
| --- | --- | --- |
| `TRUST_PROXY` | **yes** — the API will not start in production without it | none |
| `DB_POOL_MAX` | no | `11` |
| `DB_POOL_IDLE_TIMEOUT_MS` | no | `30000` |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | no | `10000` |
| `DB_STATEMENT_TIMEOUT_MS` | no | `30000` |
| `QUEUE_SHUTDOWN_GRACE_MS` | no | `15000` |
| `API_DOCS_ENABLED` | no | off in production |
| `METRICS_TOKEN` | no | unset — `/api/metrics` answers 404 |
| `ALLOW_DEMO_SEED` | no | `false` |

Also check the settings this release starts **refusing** in production:

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are generated, different from each other, and
      are not the values in `.env.example`
- [ ] `CORS_ORIGINS` lists the exact origins the web and portal are served from
- [ ] `APP_WEB_URL` is the real public URL
- [ ] `STORAGE_AUTO_CREATE_BUCKET` is `false`
- [ ] `TRUST_PROXY` is stated — the number of proxies in front of the API, or `false` when there
      are none. This one bites an **existing** deployment on upgrade: nothing about it changed
      before, so a stack behind nginx or an ALB has never had to set it, and left unset the
      refresh cookie loses `Secure` on an HTTPS site without a single error anywhere

---

## 3. Immediately before

- [ ] Take a database backup **now**, and confirm it is readable:
      ```bash
      pg_restore --list <today>.dump | tail -5
      ```
- [ ] `GET /api/v1/health` is 200 on every component right now — do not deploy onto a broken system
- [ ] Note the current image tag and digest for both services
- [ ] Announce the window

---

## 4. Deploy

- [ ] Deploy the API image. Migrations apply on start; watch the first instance's logs for
      `[api] applying database migrations` and the migration names
- [ ] Wait for that first instance to report ready before rolling the rest:
      ```bash
      watch -n 2 'curl -fsS https://<api-host>/api/v1/health | jq -c ".status, .version"'
      ```
- [ ] Roll the remaining instances one at a time
- [ ] Deploy the matching web image

**Draining.** On SIGTERM each instance closes its queue workers first, letting in-flight jobs
finish within `QUEUE_SHUTDOWN_GRACE_MS`, before the database and storage clients close. Give the
orchestrator a termination grace period longer than that, or it kills the process mid-drain and
the setting buys nothing.

---

## 5. Verify

Automated:

- [ ] `curl -fsS https://<api-host>/api/v1/health | jq .` — status `up`, and **all five**
      components up, including `queues` and `realtime`
- [ ] `.version` matches the release
- [ ] `curl -o /dev/null -w '%{http_code}' https://<api-host>/api/docs/json` returns **404** —
      the documentation must not be published in production
- [ ] `curl -o /dev/null -w '%{http_code}' https://<api-host>/api/metrics` returns **404** without
      the token, and 200 with it
- [ ] `ashniva_queue_schedulers_missing` is `0`
- [ ] Error rate and p95 latency are where they were before the deploy

By hand, from a browser:

- [ ] Sign in as an internal user; the refresh cookie carries `Secure` and `HttpOnly`
      (check it in devtools — this is what `TRUST_PROXY` decides)
- [ ] Open a ticket list and a ticket
- [ ] Upload an attachment and download it again; the download is an attachment, not inline
- [ ] Sign in as a client user; the portal shows only their own work
- [ ] A live update arrives without refreshing (badge or list), on more than one browser if the
      deployment has more than one instance
- [ ] Anything specific to this release's changes

---

## 6. Watch

- [ ] Stay for 30 minutes. Watch error rate, p95, queue depth and pool waiters
- [ ] Confirm at least one scheduled job has run — the notification delivery job runs every minute,
      so `ashniva_queue_jobs{queue="notifications"}` moving is the fastest proof the workers are
      alive
- [ ] Check the log for `Could not register a scheduled job`

If any of §5 fails and is not fixable in minutes → `rollback-procedure.md`.

---

## 7. After

- [ ] Record: version, image digests, migrations applied and their classification, who deployed,
      when, anything unexpected
- [ ] Tell the team and, where it matters to them, the customers
- [ ] Close the release ticket
- [ ] If anything in this checklist was wrong or missing, fix it today
