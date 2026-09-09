-- Indexes the operational dashboard (package 7b) needs.
--
-- Every one of these columns was already being filtered on by a dashboard query and none of them
-- was indexed, so each card cost a sequential scan of the whole table. The dashboard asks all of
-- them on one page load, for every manager, once a minute.
--
-- `tasks.started_at` and `tasks.completed_at` carry the organization first because the filter
-- always does: "started today" is never asked without a tenant.
--
-- **Deploying this against a large `tasks` table.** A plain `CREATE INDEX` takes a SHARE lock, so
-- every insert and update to the table blocks until the build finishes. `tasks` is the busiest
-- table in the schema and `prisma migrate deploy` runs on container start, which would make a
-- deployment a short write outage rather than a rolling one.
--
-- `CONCURRENTLY` is the answer and Prisma cannot express it: it wraps each migration file in a
-- transaction, and `CREATE INDEX CONCURRENTLY` is illegal inside one. So the procedure for an
-- installation big enough to care — the threshold is roughly a million rows — is:
--
--   1. Build the four indexes by hand on the primary, before deploying:
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_organization_id_started_at_idx"
--          ON "tasks" ("organization_id", "started_at");
--      …and the other three, one statement at a time, outside any transaction.
--   2. Deploy. `IF NOT EXISTS` below makes this file a no-op for indexes that already exist.
--
-- `IF NOT EXISTS` is what makes step 2 safe. Without it, an operator who took step 1 would find
-- `migrate deploy` aborting with 42P07 and the deployment failing — which is exactly the person
-- who was being careful.
CREATE INDEX IF NOT EXISTS "tasks_organization_id_started_at_idx" ON "tasks" ("organization_id", "started_at");
CREATE INDEX IF NOT EXISTS "tasks_organization_id_completed_at_idx" ON "tasks" ("organization_id", "completed_at");

-- "The projects I manage" and "the projects I lead" are how a manager's scope is resolved.
--
-- Note that the scope predicate is a three-way OR that also reaches `project_members`, so Postgres
-- will build a BitmapOr across these two and the membership join rather than using either alone.
-- They are still worth having — the two legs they cover were unindexed — but they do not make the
-- whole predicate index-only.
CREATE INDEX IF NOT EXISTS "projects_organization_id_manager_user_id_idx" ON "projects" ("organization_id", "manager_user_id");
CREATE INDEX IF NOT EXISTS "projects_organization_id_lead_user_id_idx" ON "projects" ("organization_id", "lead_user_id");
