# Production runbook

What Ashniva Desk is made of, what each piece does when it breaks, and where to look. Read this
once before you are on call; the other operations documents assume it.

- Deploying a release → `release-checklist.md`
- Undoing one → `rollback-procedure.md`
- Something is broken right now → `incident-procedure.md`
- Backups → `backup-and-restore.md`
- Every setting and what it does → `production-environment.md`
- How the pieces are deployed, and the decisions still open → `deployment-plan.md`

---

## 1. The shape of a deployment

| Piece | What it is | Loses what if it dies |
| --- | --- | --- |
| **API** | NestJS, `apps/api`, stateless, N instances behind a load balancer | Nothing, if N > 1 |
| **Web** | Static React build served by nginx, which also proxies `/api` and `/ws` | Nothing |
| **PostgreSQL 16** | Every record. Row-level security is enforced here, not only in code | Everything. This is the only thing that must be backed up |
| **Redis** | BullMQ queues, job schedules, and the Socket.IO fan-out between instances | Queued and scheduled jobs; live updates degrade to one instance |
| **S3-compatible storage** | File attachments and invoice PDFs, one bucket, org-prefixed keys | Every attachment. Back it up |

**Every API instance is also a worker.** There is no separate worker deployment: each instance
runs the BullMQ processors as well as serving HTTP. That is why an instance count of one means a
single point of failure for background work, and why draining on deploy matters (§5).

### File storage isolation is application-level

One bucket, one credential, keys prefixed `<organizationId>/<uuid>/<name>`. The keys are
unguessable and every download is authorized by the API before a byte is read
(`files.service.ts`), but PostgreSQL row-level security has no equivalent in the object store:
anything holding `STORAGE_ACCESS_KEY` can read every tenant's files. Treat that credential as
equivalent to a database superuser password.

---

## 2. Health, and what each answer means

| Endpoint | Auth | Use it for |
| --- | --- | --- |
| `GET /api/v1/health/live` | none | Liveness. Answers while the process runs. Restart on failure |
| `GET /api/v1/health` | none | Readiness. 200 = take traffic, 503 = do not |
| `GET /api/metrics` | `Authorization: Bearer $METRICS_TOKEN` | Prometheus scrape. 404 without the token |
| `GET /api/v1/ivr/health` | permission | IVR provider reachability. Not part of readiness |

Readiness has five components. **What each 503 means:**

| Component down | What is actually wrong | First thing to check |
| --- | --- | --- |
| `database` | PostgreSQL unreachable, or the pool is exhausted and acquires are timing out | `ashniva_db_pool_connections{state="waiting"}`; PostgreSQL `max_connections` |
| `redis` | Redis unreachable | Redis process, memory, `maxmemory-policy` |
| `storage` | Bucket unreachable or the wrong name | `STORAGE_BUCKET`; the endpoint's own status |
| `queues` | A scheduled job is **not running**. The API serves requests correctly and does no background work | The message names the queue and job. §5 |
| `realtime` | Socket.IO never attached to the HTTP server | Almost always a startup bug, not an environment problem |

Queue **depth** deliberately does not fail readiness. A backlog means the workers are behind;
taking instances out of the load balancer for that turns a backlog into an outage. Alert on depth
from metrics instead (§3).

---

## 3. Metrics worth an alert

Scrape `GET /api/metrics` with the bearer token in `METRICS_TOKEN`.

| Metric | Alert when | Why |
| --- | --- | --- |
| `ashniva_queue_schedulers_missing` | `> 0` for 5 minutes | Background work is not happening at all |
| `ashniva_queue_jobs{state="waiting"}` | rising for 15 minutes | Workers cannot keep up, or a job is failing on repeat |
| `ashniva_queue_jobs{state="failed"}` | increasing | Jobs are exhausting their retries. §5 |
| `ashniva_db_pool_connections{state="waiting"}` | `> 0` sustained | `DB_POOL_MAX` is the bottleneck; every waiter is paying in request latency |
| `ashniva_http_errors_total` | any sustained rate | 5xx. Cross-reference the request id in the logs |
| `ashniva_http_request_duration_seconds` p95 | above your target | Route labels are patterns, so this groups per endpoint |
| `ashniva_realtime_connections` | drops to 0 with users online | Websockets are not reaching this instance |

Every log line carries `requestId`, and so does every error response body. That is the join key
between a user's screenshot and the log.

---

## 4. Configuration

Full list, defaults and consequences: `production-environment.md`. The schema itself is
`apps/api/src/config/env.schema.ts`. The API refuses to start on an
invalid environment, with a message naming every problem at once. In production it additionally
refuses: a JWT secret that appears in `.env.example` or reads as a placeholder, the same secret
used for both tokens, an empty `CORS_ORIGINS`, a missing `APP_WEB_URL`, and
`STORAGE_AUTO_CREATE_BUCKET=true`.

The settings most likely to be wrong in a new deployment:

| Setting | Set it to | Getting it wrong looks like |
| --- | --- | --- |
| `TRUST_PROXY` | the **number** of proxies in front of the API (1 for one load balancer) | Everyone shares one rate-limit bucket, so a single client throttles the deployment; the refresh cookie loses `Secure` |
| `CORS_ORIGINS` | the exact origins the web and portal are served from | The browser refuses every request, including the websocket handshake |
| `APP_WEB_URL` | the public URL of the web app | Invitation and password-reset links point somewhere unusable — and nobody notices for a week |
| `DB_POOL_MAX` | so that `max × instances` stays under PostgreSQL's `max_connections`, with room for migrations and psql | Either "too many connections" from PostgreSQL, or requests queueing on the pool |
| `METRICS_TOKEN` | a generated secret, or leave unset | Unset means `/api/metrics` answers 404 to everyone |
| `QUEUE_SHUTDOWN_GRACE_MS` | shorter than the orchestrator's kill grace period | The process is killed mid-drain and the bound buys nothing |

**`TRUST_PROXY` is a count, never `true`.** `true` trusts the whole `X-Forwarded-For` chain, so a
client can prepend addresses and choose its own rate-limit bucket. The API refuses `true`.

### The connection pool and the per-checkout round trip

Every connection handed out by the pool is stamped with the request's tenant — `SET ROLE` plus
`set_config('app.tenant_id', …)` — so PostgreSQL row-level security applies even to a query that
forgot its filter (`tenant-aware-pool.ts`). That is one extra round trip **per checkout**, not per
query: a request that borrows one connection and runs six queries pays it once.

The consequence for tuning: a pool that is too small forces more checkouts for the same work, so
it pays the stamp more often *and* makes callers queue. Sizing up trades PostgreSQL memory for
fewer stamps. Watch `ashniva_db_pool_connections{state="waiting"}`: a sustained non-zero value is
the signal to raise `DB_POOL_MAX` — but only if PostgreSQL has the headroom, because the real
ceiling is `DB_POOL_MAX × instances` plus whatever else connects.

---

## 5. Queues and background work

Eleven queues, all defined in `apps/api/src/infrastructure/queue/queue-names.ts`. Each API instance
runs a worker for every one of them.

**Worker concurrency is charged to `DB_POOL_MAX`.** The workers and the HTTP server share one
`PrismaService`, so a running job holds one pooled connection. Eleven queues at a concurrency of one
already equal the default pool of eleven: there is no spare capacity to hand a queue. Raising one
means raising `DB_POOL_MAX` in the same change, and `worker-concurrency.spec.ts` fails until it
is. The symptom of getting this wrong is HTTP requests failing at `DB_POOL_ACQUIRE_TIMEOUT_MS`
while the API looks healthy, with `ashniva_db_pool_connections{state="waiting"}` above zero.

### Scheduled jobs

The job column is the literal name — the scheduler id, and what "run a sweep by hand" below wants.

| Queue | Job | What it does | When |
| --- | --- | --- | --- |
| `notifications` | `deliver-deferred` | deliver deferred notifications | every minute |
| `notifications` | `daily-reminders` | daily reminders | 08:30 IST |
| `sla-monitor` | `sla-monitor` | SLA warnings and breaches | every 2 minutes |
| `routing-monitor` | `routing-monitor` | acknowledgement timers | every minute |
| `ivr-events` | `call-monitor` | stale-call sweep | every minute |
| `messaging` | `stalled-send-sweep` | stalled outbound-send sweep | every 5 minutes |
| `contracts` | `contract-daily` | contract expiry and period rollover | 00:30 IST |
| `billing` | `billing-sweep` | overdue marking and payment reminders | 07:00 IST |
| `support-callbacks` | `stalled-callback-sweep` | stalled outbound-callback sweep | every 5 minutes |
| `daily-reports` | `daily-snapshot` | end-of-day snapshots | 18:30 IST |

Registration is not fire-and-forget: `QueueSchedulerRegistrar` records whether each one landed,
retries in the background if Redis was not ready, and readiness reports any that are missing.

**"queues" is down.** The health body names the queue and job, and one of two reasons:

- `registration-failed` — Redis was unreachable when the instance started. The registrar keeps
  retrying, so confirm Redis is healthy and wait a minute. If it does not clear, restart the
  instance.
- `absent-from-redis` — it registered and has since disappeared (a flushed Redis, a mistaken
  cleanup). Restarting any one instance re-creates it.

### Failed jobs

`removeOnFail: 5000` is **retention, not a dead-letter queue**: the last 5000 failures per queue
stay in Redis so they can be read, and nothing consumes them. There is no automatic replay.

To look at them, from a host with Redis access:

```bash
# how many are failed, per queue
redis-cli --scan --pattern 'bull:*:failed' | while read -r key; do
  printf '%s %s\n' "$(redis-cli zcard "$key")" "$key"
done | sort -rn
```

Nothing is lost by leaving them; they age out as new failures arrive. Replaying one means
re-triggering the domain action (re-send the message, re-run the sweep), not resurrecting the job.

### Running a sweep by hand

Every sweep is an ordinary method with a default `now`, exposed for exactly this. There is no
admin endpoint, and there is deliberately no HTTP route that runs one.

**Prefer restarting an instance.** A restart re-registers every scheduler, and the ones that run
every minute or every two minutes then catch up on their own. That fixes the usual cause and needs
no special access.

When a schedule has been missing for hours and the backlog matters, run a one-off container from
the same image, with the same environment, and let it enqueue the job:

```bash
# Compose:
docker compose run --rm api sweep <queue> <job>
# Kubernetes, from the API deployment:
kubectl run sweep --rm -it --image=<the API image> \
  --overrides='{"spec":{"containers":[{"name":"sweep","image":"<the API image>",
  "args":["sweep","<queue>","<job>"],"envFrom":[{"secretRef":{"name":"<the API secret>"}}]}]}}'
```

Run it with no arguments to print the queues and the job names they accept. It starts no workers
and writes to no table: it calls BullMQ's `Queue.add`, which is the only supported way to create a
job, and exits.

**Never write a job into Redis by hand.** `bull:<queue>:wait` holds job **ids**; the job's hash,
the counters and `bull:<queue>:meta` are created together by BullMQ's `addJob` script. An
`LPUSH` of a JSON payload leaves an entry no worker can load — a poison record in a live queue,
created during the incident it was supposed to end.

Then watch `ashniva_queue_jobs{queue="<queue>",state="active"}` and the instance's log. If nothing
picks it up, the workers are not running at all, which is a different problem — go back to §2.

Do not write directly to application tables to "fix" what a sweep would have done. Every sweep
writes an audit trail and, in the case of messaging, decides what a client is told; a manual
`UPDATE` produces a record that says something happened which did not.

---

## 6. Realtime

Socket.IO is served on `/ws`, and events are fanned out between API instances over Redis pub/sub
(`redis-io.adapter.ts`). If Redis is briefly unavailable, cross-instance delivery pauses and
resumes; sockets stay connected and local emits still arrive.

The failure to watch for is **silent**: with more than one instance and no shared adapter, a user
on instance A receives none of instance B's events — badges, live updates and the internal chat
half-work, and it reads as flakiness. `GET /api/v1/health` states which adapter is in use in the
`realtime` component's message.

nginx must forward the websocket upgrade for `/ws` (see `apps/web/nginx.conf`) and the load
balancer must allow long-lived connections.

---

## 7. Slow, and why

| Symptom | Usual cause | Check |
| --- | --- | --- |
| One endpoint slow, others fine | A missing index, or a query that grew | `ashniva_http_request_duration_seconds` by route; `pg_stat_statements` |
| Everything slow, pool waiting > 0 | `DB_POOL_MAX` too small, or a long transaction holding connections | `pg_stat_activity` for `state='idle in transaction'` |
| Everything slow, pool fine | PostgreSQL itself: locks, autovacuum, disk | `pg_locks`, `pg_stat_activity` |
| Saving an SLA policy is slow | It reapplies every open ticket in the tenant, in pages, with a ceiling of 5000 | The log line "Stopped reapplying SLA policies at the ceiling"; `reapply.truncated` on the response and `reapplyTruncated` on the audit record say the same thing without a log search |

### Indexes

Migration `20260919090000_soft_delete_partial_indexes` added partial indexes (`WHERE deleted_at IS
NULL`) on the hot tables, because every list and count filters out soft-deleted rows and none of
the declared indexes contained that column. They were added **alongside** the full indexes they
shadow rather than replacing them.

Once a deployment has a few weeks of traffic, check whether the full ones are still used and drop
the dead weight:

```sql
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE relname IN ('tickets','tasks','messages','comments','files','notifications')
ORDER BY idx_scan;
```

An index with `idx_scan = 0` after a representative period is a candidate. Drop it in a migration,
never by hand — and use `DROP INDEX CONCURRENTLY` in a migration marked to run outside a
transaction if the table is large.

---

## 8. Errors

Unhandled 5xx errors are logged with the request id and passed to `ErrorReporter`
(`apps/api/src/common/errors/error-reporter.ts`). The default implementation does nothing.

To send them to Sentry, GlitchTip or an internal collector, replace one provider in
`ErrorsModule` — do not edit the exception filter. 4xx is deliberately not reported: a backend
that pages somebody for every rejected form is a backend somebody turns off.

---

## 9. Things this deployment does not have

Say these out loud before promising them to anyone.

- **No automated deployment.** There is no CD workflow. Releases are performed by hand against the
  release checklist.
- **No dead-letter processing.** Failed jobs are retained and readable; nothing replays them.
- **No object-storage tenancy.** One bucket, one credential; isolation is enforced by the API.
- **No automated backup verification.** The restore drill in `backup-and-restore.md` is manual.
- **No horizontal read scaling.** One PostgreSQL, no read replicas.
