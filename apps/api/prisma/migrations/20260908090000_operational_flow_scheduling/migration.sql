-- Project responsibilities, task scheduling and the timing indicator.
--
-- Additive in every sense: five nullable or array columns, no drops, no type changes, no backfill.
-- A Postgres text[] defaults to an empty array for existing rows, so every task and membership
-- already in the database keeps working with no responsibilities and no scheduled start — which is
-- exactly what they had before.
--
-- Why `due_at` sits beside `due_date` rather than replacing it: `due_date` is a calendar date and
-- is what the daily reports, the overdue views and the milestone rollups already group by. "Late"
-- is a question about a moment, and a date cannot answer it, so the timing indicator needs an
-- instant. Migrating `due_date` to a timestamp would have changed the meaning of every existing
-- report by inventing a time of day nobody entered.

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN     "responsibilities" TEXT[];

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "due_at" TIMESTAMP(3),
ADD COLUMN     "scheduled_start_at" TIMESTAMP(3),
ADD COLUMN     "work_areas" TEXT[];

-- The assignee's queue is filtered on the scheduled start every time it is read, so that column is
-- in the hot path for the one screen a developer keeps open all day.
CREATE INDEX "tasks_scheduled_start_at_idx" ON "tasks"("scheduled_start_at");

-- Managers ask "what is late" across a project, which is a scan over the expected completion time.
-- A plain index rather than one partial on open work: Prisma's schema cannot express a partial
-- index, and an index that exists in the database but not in the schema is a permanent phantom
-- difference in every `migrate diff` from here on.
CREATE INDEX "tasks_due_at_idx" ON "tasks"("due_at");
