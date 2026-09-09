-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GITHUB', 'GITLAB', 'EMAIL', 'WHATSAPP', 'AI');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('NEVER', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE', 'REJECTED');

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_name" TEXT,
    "encrypted_credentials" TEXT,
    "credentials_expire_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webhook_secret_encrypted" TEXT,
    "external_account_id" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "SyncStatus" NOT NULL DEFAULT 'NEVER',
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID,
    "provider" "IntegrationProvider" NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "payload_digest" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_connections_organization_id_status_idx" ON "integration_connections"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organization_id_provider_key" ON "integration_connections"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "integration_events_organization_id_received_at_idx" ON "integration_events"("organization_id", "received_at");

-- CreateIndex
CREATE INDEX "integration_events_status_idx" ON "integration_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_events_provider_external_event_id_key" ON "integration_events"("provider", "external_event_id");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Row-level security for the Phase 3 foundation tables.
--
-- Written out rather than calling app_rls_enable_org(): 20260905202714_row_level_security drops
-- those helpers at the end of itself, on purpose — they are setup scaffolding, not API. The
-- policy body below is exactly what the helper produced.
--
-- Both tables are provider-owned, so a client tenant matches neither branch and sees no
-- integration connection and no webhook event at all. That is the intent: integrations are an
-- internal concern and nothing here is ever exposed through the client portal.
--
-- Grants are already covered by the ALTER DEFAULT PRIVILEGES set in the Phase 2 migration, which
-- applies to tables created afterwards by the same owner.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_connections
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());

ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_events
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());
