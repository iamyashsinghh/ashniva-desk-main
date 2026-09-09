# metrics

**Owns:** the Prometheus registry, the middleware that times every request, and `GET /api/metrics`.

**Route:** version-neutral under the global prefix, so it is `/api/metrics` (not `/api/v1/...`) — a
scrape configuration outlives an API version.

**Access:** `MetricsTokenGuard`, not a permission. The caller is a scraper: it holds no account,
cannot sign in and cannot refresh a token, so a shared secret from `METRICS_TOKEN` is what it can
actually present. With no token configured the route answers **404**, exactly as it would if it did
not exist; a wrong token gets the same answer. `@Public()` here means only "no JWT" — the guard
still runs.

**What is exported**

| Metric | Kind | Labels |
| --- | --- | --- |
| `ashniva_http_request_duration_seconds` | histogram | method, route, status |
| `ashniva_http_errors_total` | counter | method, route, status |
| `ashniva_queue_jobs` | gauge | queue, state (waiting/active/delayed/failed) |
| `ashniva_queue_schedulers_missing` | gauge | — |
| `ashniva_db_pool_connections` | gauge | state (total/idle/waiting) |
| `ashniva_realtime_connections` | gauge | — |
| `ashniva_*` process/node defaults | various | — |

Queue depth, scheduler state, pool usage and socket count are collected **at scrape time**: asking
is cheap, and a gauge only updated when something happens goes stale exactly when it matters. The
two queue gauges share one snapshot behind a two-second cache so a scrape asks Redis once.

**Cardinality.** Route labels are the Express *pattern* (`/api/v1/tickets/:id`), never the resolved
URL — a label per ticket id is how a metrics endpoint becomes the most expensive thing in a
deployment. Nothing is labelled with a user or an organization.

**Why a middleware and not an interceptor:** interceptors run after the guards, so a request
rejected by the throttler or the JWT guard — precisely what you want to see during an incident —
would never be counted. `res.on('finish')` catches all of them.

What to alert on is in `docs/production-runbook.md`, §3.
