-- When a refresh token was itself exchanged, as opposed to retired by a retry of its predecessor.
ALTER TABLE "refresh_tokens" ADD COLUMN "presented_at" TIMESTAMP(3);

-- Every token rotated before this column existed was rotated by its own presentation.
UPDATE "refresh_tokens" SET "presented_at" = "revoked_at" WHERE "replaced_by_token_id" IS NOT NULL;
