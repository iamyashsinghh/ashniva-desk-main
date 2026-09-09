# Load test — 2026-09-08

**Status: executed, but not on production-shaped infrastructure.** Read the caveat in §1 before
quoting any number here. The *findings* transfer; the *numbers* do not.

---

## 1. What this was, and what it was not

Everything ran on one container: 4 vCPU, 16 GB, with the API, PostgreSQL 16, Redis and an
S3-compatible store all co-located. A production deployment separates at least the database, so
absolute throughput here is a floor rather than an estimate, and the CPU was shared between the
load generator and the thing being measured.

What that setup *can* establish, and does:

- which layer saturates first, and at what concurrency;
- whether `DB_POOL_MAX` is the binding constraint;
- whether raising it helps, and where it stops helping;
- that nothing errors, leaks or deadlocks under sustained concurrency.

What it cannot establish: the request rate a real deployment sustains, or the pool size it wants.
Those need the staging run described in §5.

Tool: `autocannon`. Target: a seeded database (8 organizations, 24 users, 11 projects, 57 tasks,
28 tickets) restored from the backup drill. Mock providers throughout — no third-party service was
contacted.

---

## 2. The rate limiter works, and it measured itself first

The first run returned 120 × `200` and 9,946 × `429` in ten seconds. `RATE_LIMIT_MAX` is 120 per
minute per IP, and the throttler was doing exactly its job.

That is a real positive result — but it means any load test through the throttler measures the
throttler. Every number below was taken with `RATE_LIMIT_MAX` raised **locally only**, to reach the
layer underneath. The shipped default is unchanged.

Two related facts worth carrying into capacity planning:

- **The throttler has no shared store**, so the limit is per instance: N instances allow roughly
  N × `RATE_LIMIT_MAX`.
- **`METRICS_TOKEN` has a 16-character minimum** and the endpoint answers `404` both when unset and
  when the token is wrong. Both were confirmed by accident, then on purpose.

---

## 3. Read paths, by concurrency

20-second runs. All responses `200`; zero errors, zero timeouts, throughout.

| Endpoint | c=10 | c=50 | c=100 |
| --- | --- | --- | --- |
| `GET /dashboard` | 69 rps · p50 140 ms · p95 177 | 62 rps · p50 792 · p95 885 | 61 rps · p50 1521 · p95 2021 |
| `GET /tickets` | 192 rps · p50 50 · p95 64 | 176 rps · p50 279 · p95 334 | 175 rps · p50 552 · p95 663 |
| `GET /projects` | 186 rps · p50 53 · p95 66 | 160 rps · p50 309 · p95 376 | 175 rps · p50 550 · p95 750 |
| `GET /tasks` | 216 rps · p50 44 · p95 57 | 209 rps · p50 235 · p95 273 | 200 rps · p50 491 · p95 560 |

The shape is the finding: **throughput is flat while latency grows linearly with concurrency.**
That is a saturated resource with a queue in front of it, not a system with headroom. The dashboard
is roughly three times more expensive than the other three, which is expected — it is the
Manager/TL aggregate.

---

## 4. The saturated resource is the connection pool

Sampling `ashniva_db_pool_connections` every two seconds during a `c=100` run against
`/dashboard`:

```
total  5  idle 5  waiting    0     <- before load
total 11  idle 0  waiting 1106
total 11  idle 0  waiting  311
total 11  idle 0  waiting  199
total 11  idle 0  waiting  873
total 11  idle 0  waiting 1500
total 11  idle 0  waiting 1360
…
```

`total` pinned at 11 — exactly `DB_POOL_MAX` — `idle` at zero throughout, and a waiting queue
peaking at 1,500. There is no ambiguity here: **at this concurrency the pool is the binding
constraint.**

### Does raising it help?

Same request, same duration, `c=100`, pool varied:

| `DB_POOL_MAX` | rps | p50 | p95 | p99 |
| --- | --- | --- | --- | --- |
| 11 (current default) | 40 | 2478 | 3396 | 3478 |
| 25 | **50** | **1886** | **2777** | **2842** |
| 50 | 35 | 2711 | 2984 | 3026 |

Throughput improves 25% from 11 → 25 and then **degrades** at 50. More is not better: past a
point the connections contend for the same four cores and the same PostgreSQL, and the queue moves
rather than disappears.

---

## 5. Recommendation: keep the default at 11, and tune on staging

`DB_POOL_MAX = 11` is **not** a throughput-tuned number and was never meant to be. It exists so
that eleven queue workers, each holding one connection while a job runs, cannot starve the HTTP
server — `worker-concurrency.spec.ts` enforces that relationship, and raising any queue's
concurrency requires raising the pool in the same change.

Changing that default on the evidence above would be inventing a production number from a
co-located four-core box, which is precisely the mistake the comment in `env.schema.ts` warns
against. So it stays at 11, and the tuning is a staging exercise:

1. Deploy to staging with the intended production instance count and a database on its own host.
2. Set `RATE_LIMIT_MAX` to the production value; do not raise it. If the throttler is the first
   thing you hit, that *is* your answer for a single client, and you should generate load from
   multiple source addresses.
3. Drive `/dashboard`, `/tickets`, `/projects`, `/tasks`, ticket creation and message send at the
   concurrency you actually expect, plus 2×.
4. Watch `ashniva_db_pool_connections{state="waiting"}`. Sustained non-zero means the pool is the
   constraint — that is the signal to raise it, and the only honest one.
5. Raise in steps, re-measure, and stop at the first step that does not improve p95. The curve has
   a peak; find yours rather than borrowing the 25 above.
6. Bound the result: `DB_POOL_MAX × instances` must stay under PostgreSQL's `max_connections`
   with room for migrations and `psql`.

Record the answer here, with the hardware it was measured on.

---

## 6. Not covered

Write paths (ticket creation, message send), WebSocket connection counts, queue throughput under
load, and callback delivery were **not** load-tested — the read paths saturated first and there was
no headroom left to measure anything behind them meaningfully. They belong in the staging run.
