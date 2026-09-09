-- Let a failed outbound message be sent again.
--
-- The title, body and link of a message live in the queue payload rather than in a column, and a
-- BullMQ job is gone once it has run. So a resend had nothing to resend: the row records who the
-- message was for and which template it used, but not what it said. `payload` keeps the rendered
-- request beside the row that stands for it.
--
-- Both columns are nullable and nothing backfills them. A row written before this migration has
-- no payload, and the resend endpoint refuses it with that reason rather than inventing content —
-- which is the honest answer, and the reason this needs no data migration.
--
-- `resent_from_id` is deliberately a plain column and not a foreign key: it points at history,
-- and history is exactly the thing that should not stop being deletable because something later
-- referenced it.

ALTER TABLE "outbound_messages" ADD COLUMN "payload" JSONB;
ALTER TABLE "outbound_messages" ADD COLUMN "resent_from_id" UUID;
