-- Native (Expo) push: one row per install of the mobile app.
CREATE TABLE "device_push_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_push_tokens_token_key" ON "device_push_tokens"("token");
CREATE INDEX "device_push_tokens_organization_id_user_id_idx" ON "device_push_tokens"("organization_id", "user_id");

ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A device token is personal: only its owner (or their organization) sees it on a stamped
-- connection. There is deliberately no provider clause — nobody needs another tenant's phones.
-- Re-binding a token that moved to another person, and delivery, run as the system (no tenant).
ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_push_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON device_push_tokens
  USING (app_tenant_id() IS NULL OR organization_id = app_tenant_id() OR user_id = app_user_id());
