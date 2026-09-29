-- A profile picture: an uploaded photo (its storage key) or a built-in preset, never both.
-- The check is enforced here because Prisma cannot express it, so a bug in the service cannot
-- leave a person with two pictures and clients guessing which one to draw.
ALTER TABLE "users"
  ADD COLUMN "avatar_key" TEXT,
  ADD COLUMN "avatar_preset" TEXT,
  ADD COLUMN "avatar_updated_at" TIMESTAMP(3),
  ADD CONSTRAINT "users_avatar_one_kind_check"
    CHECK ("avatar_key" IS NULL OR "avatar_preset" IS NULL);

-- A quoted reply. SET NULL rather than CASCADE: messages are soft-deleted, so this only fires if a
-- row is ever purged, and then the reply should survive as an ordinary message.
ALTER TABLE "messages" ADD COLUMN "reply_to_id" UUID;

CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_reply_to_id_fkey"
  FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
