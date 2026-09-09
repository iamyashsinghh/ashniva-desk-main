-- Partial indexes for the queries the application actually issues.
--
-- Nothing in Desk is deleted; rows are stamped with `deleted_at` and every list, board, count and
-- report filters `deleted_at IS NULL`. None of the declared indexes contained that column, so a
-- ticket list matching `(organization_id, deleted_at IS NULL, status)` could use
-- `tickets_organization_id_status_idx` for the first and third and then re-check every row it
-- found for the second. On a table where almost every row is live that is tolerable; on one that
-- has accumulated a few years of cancelled work it is a growing scan of rows that can never match.
--
-- Written by hand because Prisma's `@@index` cannot express a `WHERE` clause. `prisma migrate diff`
-- ignores partial indexes, so the schema and the database still agree afterwards.
--
-- These are *additions*. The full indexes they shadow are left in place deliberately: dropping an
-- index is a decision that wants `pg_stat_user_indexes` from a real deployment behind it, not a
-- guess made on the same day the replacement was created. docs/production-runbook.md says which
-- ones to look at and when.
--
-- Thirteen indexes across six tables: three on tickets, three on tasks, one on messages, two on
-- comments, two on files and two on notifications.
--
-- CONCURRENTLY is not used: `prisma migrate deploy` runs each migration inside a transaction and
-- PostgreSQL refuses `CREATE INDEX CONCURRENTLY` there. These tables are small enough at present
-- that the lock is brief; docs/release-checklist.md carries the note for when they are not.
--
-- What "brief" has to mean, because the locks compound. `CREATE INDEX` takes a SHARE lock, which
-- blocks writes to that table, and one transaction wraps all thirteen — so the SHARE on `tickets`
-- taken by the first statement is held until the last statement on `notifications` commits. The
-- cost is not the slowest index; it is the sum of all thirteen, charged to writes on every one of
-- the six tables, and `tickets` pays it longest. Time the whole migration against a restored copy
-- before running it anywhere with real data, and build the indexes with CREATE INDEX CONCURRENTLY
-- beforehand if that total is not acceptable — each statement below is `IF NOT EXISTS`, so a
-- pre-built index makes it a no-op.

-- Tickets: the list, the board, the client portal and every KPI count.
CREATE INDEX IF NOT EXISTS "tickets_org_status_live_idx"
  ON "tickets" ("organization_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "tickets_client_status_live_idx"
  ON "tickets" ("client_organization_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "tickets_assignee_live_idx"
  ON "tickets" ("assigned_to_id", "status") WHERE "deleted_at" IS NULL;

-- Tasks: the same three shapes, plus "what is on my plate", which orders by due date.
CREATE INDEX IF NOT EXISTS "tasks_org_status_live_idx"
  ON "tasks" ("organization_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "tasks_project_status_live_idx"
  ON "tasks" ("project_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "tasks_assignee_due_live_idx"
  ON "tasks" ("assigned_to_id", "due_date") WHERE "deleted_at" IS NULL;

-- Internal chat: one conversation's messages, newest last. The hottest read in the product.
CREATE INDEX IF NOT EXISTS "messages_conversation_created_live_idx"
  ON "messages" ("conversation_id", "created_at") WHERE "deleted_at" IS NULL;

-- Comments on a ticket or a task, which the detail screens load in full.
CREATE INDEX IF NOT EXISTS "comments_ticket_created_live_idx"
  ON "comments" ("ticket_id", "created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "comments_task_created_live_idx"
  ON "comments" ("task_id", "created_at") WHERE "deleted_at" IS NULL;

-- Attachments of one parent. `files` is queried by a nullable parent id plus `deleted_at IS NULL`,
-- so the partial index is also much smaller than the full one: only rows with that parent.
CREATE INDEX IF NOT EXISTS "files_ticket_live_idx"
  ON "files" ("ticket_id") WHERE "deleted_at" IS NULL AND "ticket_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "files_task_live_idx"
  ON "files" ("task_id") WHERE "deleted_at" IS NULL AND "task_id" IS NOT NULL;

-- Notifications have no `deleted_at`, but they have the same shape of problem: the delivery job
-- runs every minute and asks for `delivered_at IS NULL AND deliver_after <= now()`, against an
-- index on `deliver_after` alone that covers every notification ever sent. The partial index holds
-- only the ones still waiting — normally a handful of rows, whatever the table's size.
CREATE INDEX IF NOT EXISTS "notifications_pending_delivery_idx"
  ON "notifications" ("deliver_after") WHERE "delivered_at" IS NULL;

-- The unread badge, which every signed-in browser asks for.
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx"
  ON "notifications" ("user_id", "created_at") WHERE "read_at" IS NULL;
