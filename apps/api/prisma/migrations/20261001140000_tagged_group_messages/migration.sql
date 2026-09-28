-- A tagged group message is private to its sender, the people it tags and the tagged-message
-- reader roles. Existing rows keep the empty default, so history stays readable to everyone.
ALTER TABLE "messages"
  ADD COLUMN "restricted_to_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
