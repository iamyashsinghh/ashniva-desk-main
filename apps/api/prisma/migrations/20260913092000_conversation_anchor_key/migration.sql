-- Make the conversation anchor actually unique.
--
-- The previous unique index spanned `(project_id, kind, task_id, ticket_id, direct_key)`, and
-- every conversation kind leaves at least one of those columns null: a project channel has three
-- nulls, a task thread two, a direct conversation two. PostgreSQL treats nulls as distinct in a
-- unique index, so the constraint exempted every row it was written to hold — nothing stopped two
-- threads existing for one task, and the unique-violation branch in the repository was
-- unreachable. Three people opening the same task at the same moment produced two threads.
--
-- `anchor_key` flattens the anchor into one non-null string, so the index has two non-null
-- columns and the database is what decides. The old index is dropped only after the new one
-- exists.

ALTER TABLE "conversations" ADD COLUMN "anchor_key" TEXT;

-- Backfill from the columns that were meant to be the anchor. The shapes match what the
-- application now writes, so existing threads keep their identity rather than being re-created
-- beside a new one.
UPDATE "conversations"
SET "anchor_key" = CASE "kind"
  WHEN 'PROJECT' THEN 'PROJECT'
  WHEN 'TASK'    THEN 'TASK:'   || COALESCE("task_id"::text, '')
  WHEN 'TICKET'  THEN 'TICKET:' || COALESCE("ticket_id"::text, '')
  WHEN 'DIRECT'  THEN 'DIRECT:' || COALESCE("direct_key", '')
END
WHERE "anchor_key" IS NULL;

-- A duplicate here would be a pair of threads the broken index already allowed. There is no
-- correct automatic answer to which one to keep — merging messages across them is a decision, not
-- a migration — so the column is made NOT NULL and the index created, and if either fails the
-- migration stops rather than choosing. In practice it cannot fail on a deployment: the table is
-- created two migrations earlier in this same release, so it reaches this point empty.
ALTER TABLE "conversations" ALTER COLUMN "anchor_key" SET NOT NULL;

CREATE UNIQUE INDEX "conversations_project_id_anchor_key_key"
  ON "conversations"("project_id", "anchor_key");

DROP INDEX IF EXISTS "conversations_project_id_kind_task_id_ticket_id_direct_key_key";
