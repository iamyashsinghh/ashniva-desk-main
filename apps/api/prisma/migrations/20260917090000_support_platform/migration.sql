-- CreateEnum
CREATE TYPE "SupportCallbackStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SupportFallbackStrategy" AS ENUM ('SUPPORT_QUEUE', 'NOTIFY_EXECUTIVE');

-- CreateEnum
CREATE TYPE "SupportAvailabilityWindow" AS ENUM ('BUSINESS_HOURS', 'ALWAYS');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "allowed_origins" TEXT[];

-- CreateTable
CREATE TABLE "product_callback_endpoints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "signing_secret_encrypted" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rotated_at" TIMESTAMP(3),
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_callback_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_callback_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "ticket_id" UUID,
    "event" TEXT NOT NULL,
    "status" "SupportCallbackStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "response_status" INTEGER,
    "payload" JSONB NOT NULL,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_callback_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tier_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tier" "SupportTier" NOT NULL,
    "admission_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sla_policy_id" UUID,
    "minimum_priority" "Priority",
    "calls_enabled" BOOLEAN NOT NULL DEFAULT true,
    "requester_initiated_calls" BOOLEAN NOT NULL DEFAULT true,
    "dedicated_ownership" BOOLEAN NOT NULL DEFAULT false,
    "ack_minutes" INTEGER,
    "escalation_minutes" INTEGER,
    "fallback_strategy" "SupportFallbackStrategy" NOT NULL DEFAULT 'SUPPORT_QUEUE',
    "availability_window" "SupportAvailabilityWindow" NOT NULL DEFAULT 'BUSINESS_HOURS',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tier_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_callback_endpoints_product_id_key" ON "product_callback_endpoints"("product_id");

-- CreateIndex
CREATE INDEX "product_callback_endpoints_organization_id_idx" ON "product_callback_endpoints"("organization_id");

-- CreateIndex
CREATE INDEX "support_callback_deliveries_organization_id_product_id_queu_idx" ON "support_callback_deliveries"("organization_id", "product_id", "queued_at");

-- CreateIndex
CREATE INDEX "support_callback_deliveries_status_updated_at_idx" ON "support_callback_deliveries"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_callback_deliveries_organization_id_idempotency_key_key" ON "support_callback_deliveries"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "support_tier_policies_organization_id_idx" ON "support_tier_policies"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tier_policies_organization_id_tier_key" ON "support_tier_policies"("organization_id", "tier");

-- AddForeignKey
ALTER TABLE "product_callback_endpoints" ADD CONSTRAINT "product_callback_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_callback_endpoints" ADD CONSTRAINT "product_callback_endpoints_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_callback_endpoints" ADD CONSTRAINT "product_callback_endpoints_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_callback_deliveries" ADD CONSTRAINT "support_callback_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_callback_deliveries" ADD CONSTRAINT "support_callback_deliveries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_callback_deliveries" ADD CONSTRAINT "support_callback_deliveries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tier_policies" ADD CONSTRAINT "support_tier_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tier_policies" ADD CONSTRAINT "support_tier_policies_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tier_policies" ADD CONSTRAINT "support_tier_policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security.
--
-- All three tables are provider-owned configuration and provider-owned delivery history. A client
-- tenant matches neither branch and sees nothing: where a callback goes, what signs it and what a
-- tier entitles a product to are the provider's business, not the client's.
--
-- Written out rather than calling app_rls_enable_org(), which the Phase 2 migration drops at the
-- end of itself on purpose.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE product_callback_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_callback_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_callback_endpoints
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());

ALTER TABLE support_callback_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_callback_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_callback_deliveries
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());

ALTER TABLE support_tier_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tier_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_tier_policies
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());
