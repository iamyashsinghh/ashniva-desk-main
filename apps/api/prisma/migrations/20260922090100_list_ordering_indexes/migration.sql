-- Indexes that match the sort the list endpoints actually issue.
--
-- Every paginated list in Desk is a keyset page: a `WHERE` on the tenant, an `ORDER BY` of two or
-- three columns, and `LIMIT n + 1`. The indexes declared so far cover the `WHERE` and stop there,
-- so PostgreSQL had to read every matching row and sort it to find the first twenty-five. That is
-- a parallel sequential scan of the table on page one, and it grows with the table rather than
-- with the page.
--
-- Measured on a throwaway database (200k tickets, 200k tasks, 100k incidents, 100k problems,
-- 400k audit logs), `EXPLAIN (ANALYZE, BUFFERS)` on the first page:
--
--   tickets      5046 buffers / 62.371 ms  ->  4 buffers / 0.070 ms
--   tasks        4554 buffers / 47.773 ms  ->  5 buffers / 0.083 ms
--   incidents    2378 buffers / 46.406 ms  ->  4 buffers / 0.051 ms
--   problems     2075 buffers / 50.858 ms  ->  4 buffers / 0.084 ms
--   audit_logs   7363 buffers / 71.016 ms  ->  5 buffers / 0.061 ms
--
-- The column order is the `ORDER BY` verbatim, direction included. A btree can be read backwards,
-- so a single-column sort does not need a matching direction — a *mixed* one does, and all five of
-- these are mixed (descending priority, then descending date, then descending id; or ascending due
-- date with nulls last, then descending priority). Get one direction wrong and the index is not
-- usable for ordering at all.
--
-- On `tickets` and `tasks` the index is partial on `deleted_at IS NULL`, which every one of these
-- lists filters on and which no ordering index can otherwise satisfy. `problems` and `incidents`
-- have no `deleted_at` column, so theirs are plain.
--
-- These are written here rather than as Prisma `@@index` attributes for the same reason as
-- `20260919090000_soft_delete_partial_indexes` and `20260916090000_dashboard_indexes`: Prisma
-- cannot express a `WHERE` clause, and keeping a family of indexes in one place beats splitting it
-- across two files. `prisma migrate diff` ignores partial indexes; the four plain ones are
-- additions the schema does not know about, exactly as `tasks_organization_id_started_at_idx` from
-- the dashboard migration already is.
--
-- **Deploying this against a large table.** A plain `CREATE INDEX` takes a SHARE lock, which blocks
-- writes to the table until the build finishes, and `prisma migrate deploy` wraps the whole file in
-- one transaction — so the six locks below are held together, for the sum of the six builds, and
-- `tickets` pays it longest. `CONCURRENTLY` is the answer and Prisma cannot express it: it is
-- illegal inside a transaction. So for an installation large enough to care — roughly a million
-- rows in any one of these tables — the procedure is the same one the dashboard migration
-- documents:
--
--   1. Build the indexes by hand on the primary, before deploying, one statement at a time and
--      outside any transaction:
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "tickets_org_priority_created_live_idx"
--          ON "tickets" ("organization_id", "priority" DESC, "created_at" DESC, "id" DESC)
--          WHERE "deleted_at" IS NULL;
--      …and the other five, copied from below with CONCURRENTLY added.
--   2. Deploy. `IF NOT EXISTS` makes each statement here a no-op for an index that already exists.
--
-- Without `IF NOT EXISTS` an operator who took step 1 would meet 42P07 and a failed deployment —
-- which is exactly the person who was being careful. Time the whole file against a restored copy
-- before running it anywhere with real data.

-- Tickets: `ORDER BY priority DESC, created_at DESC, id DESC` — the ticket list, the queue and the
-- client portal's ticket list all issue it.
CREATE INDEX IF NOT EXISTS "tickets_org_priority_created_live_idx"
  ON "tickets" ("organization_id", "priority" DESC, "created_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL;

-- Tasks: `ORDER BY due_date ASC NULLS LAST, priority DESC, id DESC`. NULLS LAST is PostgreSQL's
-- default for ASC, so naming the direction is enough to match it.
CREATE INDEX IF NOT EXISTS "tasks_org_due_priority_live_idx"
  ON "tasks" ("organization_id", "due_date" ASC, "priority" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL;

-- Incidents: severity first, because an open Critical belongs at the top whoever is looking.
CREATE INDEX IF NOT EXISTS "incidents_org_severity_started_idx"
  ON "incidents" ("organization_id", "severity" DESC, "started_at" DESC, "id" DESC);

-- Problems: newest first.
CREATE INDEX IF NOT EXISTS "problems_org_created_idx"
  ON "problems" ("organization_id", "created_at" DESC, "id" DESC);

-- Audit logs, the fastest-growing table in the system.
--
-- `organization_id` is an *optional* filter on GET /audit-logs, so the default request — the one
-- the screen makes when it opens — has no equality predicate at all and the existing
-- `(organization_id, created_at)` index cannot serve the ordering. This one has no leading column
-- to miss.
--
-- `fix/entity-access-gates` is making `organization_id` a mandatory tenant predicate on that
-- repository. When it lands, `audit_logs_organization_id_created_at_idx` becomes the better index
-- for the default screen and this one stays the right index for a cross-tenant super-admin read
-- and for any filter that names an action or an entity but no organization. Both are cheap; the
-- planner picks.
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_id_idx"
  ON "audit_logs" ("created_at" DESC, "id" DESC);

-- The support-hour ledger is read by `(contract_id, period_start)` — one billing period of one
-- contract — by the contract list, the portal, the detail screens and the support-hours report.
-- The only index starting with `contract_id` carried `created_at` second, so every read of one
-- period scanned every ledger row the contract has ever had.
CREATE INDEX IF NOT EXISTS "contract_hour_ledger_contract_period_idx"
  ON "contract_hour_ledger" ("contract_id", "period_start");
