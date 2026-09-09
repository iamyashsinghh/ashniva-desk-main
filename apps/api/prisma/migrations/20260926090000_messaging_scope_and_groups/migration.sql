-- Scope-based direct messaging and group chat.
--
-- Package 9b derived the right to talk to somebody from a shared project, and that stays exactly
-- as it is for the four kinds that name one. What is added beside it is a second family whose
-- authority is a *management relationship* — the people on the projects and teams somebody runs —
-- and which therefore has no project at all. Two new kinds, `SCOPE_DIRECT` and `GROUP`, and every
-- column below exists because one of them needs it.
--
-- The one genuinely dangerous change is `project_id` becoming nullable, and not for the obvious
-- reason. `@@unique([project_id, anchor_key])` is the constraint that holds one thread per anchor,
-- and PostgreSQL treats NULLs as distinct: the moment `project_id` can be null, that index stops
-- enforcing anything for exactly the rows that leave it null. It is the same trap `anchor_key`
-- was invented to dodge, a second time. So the unique index moves to
-- `(organization_id, anchor_key)` — two columns that can never be null — and the project's id
-- moves *into* the key for the kinds that have one, which is what the backfill below is.
--
-- Additive except for two things, both named: the dead `muted_at` column is dropped (zero reads,
-- zero writes since it was created), and the superseded unique index is dropped after its
-- replacement exists. No row is deleted and no message is touched.

-- ---------------------------------------------------------------------------------------------
-- The new kinds, and standing on a member list.
-- ---------------------------------------------------------------------------------------------
--
-- Neither new value is used anywhere in this file. PostgreSQL will not let a value added by
-- ALTER TYPE be used in the transaction that added it, and Prisma runs a migration as one
-- transaction, so using one here would fail at deploy time rather than in review.

ALTER TYPE "ConversationKind" ADD VALUE 'SCOPE_DIRECT';
ALTER TYPE "ConversationKind" ADD VALUE 'GROUP';

CREATE TYPE "ConversationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- ---------------------------------------------------------------------------------------------
-- A conversation, and a message, may have no project.
-- ---------------------------------------------------------------------------------------------
--
-- Dropping a NOT NULL removes no data: every row that names a project still names it, and the
-- foreign keys keep cascading, so deleting a project still takes its conversations and messages
-- with it and leaves the project-less ones alone.

ALTER TABLE "conversations" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "project_id" DROP NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Re-base thread identity on the tenant rather than on the project.
-- ---------------------------------------------------------------------------------------------
--
-- `anchor_key` was unique per project, so it did not have to say which project it belonged to.
-- Now that the index spans the organization it does, for the two kinds whose key was previously
-- only unique within one: a project channel and a project-anchored direct conversation. A task
-- and a ticket key already carry a globally unique id, so they are left exactly as they are and
-- existing threads keep their identity.

UPDATE "conversations"
SET "anchor_key" = 'PROJECT:' || "project_id"::text
WHERE "kind" = 'PROJECT';

UPDATE "conversations"
SET "anchor_key" = 'DIRECT:' || "project_id"::text || ':' || COALESCE("direct_key", '')
WHERE "kind" = 'DIRECT';

-- Created before the old one is dropped, so there is no moment at which nothing enforces the
-- anchor. A duplicate here would be two threads the *old* index already permitted, and there is
-- no correct automatic answer to which of them to keep — merging messages across two threads is a
-- decision, not a migration — so this fails the deploy rather than choosing.
CREATE UNIQUE INDEX "conversations_organization_id_anchor_key_key"
  ON "conversations" ("organization_id", "anchor_key");

DROP INDEX IF EXISTS "conversations_project_id_anchor_key_key";

-- ---------------------------------------------------------------------------------------------
-- A group has a picture, and a title somebody may change.
-- ---------------------------------------------------------------------------------------------
--
-- An ordinary `files` row, so the picture inherits the upload path, the content-type rules, the
-- size limit, the storage key and the tenancy every other file in the product already has. ON
-- DELETE SET NULL: a deleted file leaves a group without a picture, never without a group.

ALTER TABLE "conversations" ADD COLUMN "image_file_id" UUID;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_image_file_id_fkey"
  FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Membership becomes something a person can hold, be given, and leave.
-- ---------------------------------------------------------------------------------------------
--
-- For a project-anchored conversation these rows stay what they were: a read cursor and a hint,
-- never consulted as authorization. For a `GROUP` they *are* the membership, because there is no
-- project to derive one from — the change of contract this release carries. What stops a stored
-- list going stale is that every addition is re-checked against the adder's live management scope
-- at the moment it is made, and that leaving is expressible: `left_at` is set rather than the row
-- being deleted, so the thread still renders who said what and a former member reads nothing.
--
-- `muted_at` goes. It was added with the table, has never been read or written by any code path,
-- and a column that has never meant anything is worse than no column: the next person to read the
-- schema has to work out whether muting exists. Group notifications are handled the way the
-- project channels' already are — only a mention notifies — so nothing needed it.

ALTER TABLE "conversation_members" DROP COLUMN "muted_at";

ALTER TABLE "conversation_members"
  ADD COLUMN "role" "ConversationMemberRole" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "left_at" TIMESTAMP(3),
  ADD COLUMN "added_by_id" UUID;

-- Existing rows joined when they were created, not when this migration ran.
UPDATE "conversation_members" SET "joined_at" = "created_at";

ALTER TABLE "conversation_members"
  ADD CONSTRAINT "conversation_members_added_by_id_fkey"
  FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- The two indexes the busy paths were missing.
-- ---------------------------------------------------------------------------------------------
--
-- `messages`: paging a thread is `conversation_id = $1 AND id < $2 ORDER BY id DESC`, and nothing
-- supported it. The existing `(conversation_id, created_at)` index answers the unread-count
-- group-by, not the cursor walk, so reading back through a long thread sorted it each time. Ids
-- are UUIDv7, so descending by id is descending by time.
--
-- `conversation_members`: the primary key is `(conversation_id, user_id)`, which cannot serve
-- "the conversations this person is in" — the predicate behind every list and every membership
-- check. Member-first, and carrying the conversation id so the lookup never touches the heap.
-- It replaces the `(user_id)` index, which it covers as a prefix.

CREATE INDEX "messages_conversation_id_id_idx" ON "messages" ("conversation_id", "id" DESC);

CREATE INDEX "conversation_members_user_id_conversation_id_idx"
  ON "conversation_members" ("user_id", "conversation_id");

DROP INDEX IF EXISTS "conversation_members_user_id_idx";
