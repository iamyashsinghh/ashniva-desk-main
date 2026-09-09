-- IVR support calls (Phase 4, package 9).
--
-- Additive throughout: four new enums, two new values on two existing ones, and three new tables.
-- Nothing existing is dropped, renamed or rewritten, so an upgrade over a populated database
-- changes no row that is already there.
--
-- `IntegrationProvider` gains IVR rather than a parallel `ivr_providers` table. The encrypted
-- credentials, the webhook secret, the external account id that attributes an unauthenticated
-- delivery to a tenant, and the idempotency index on integration_events all already exist on
-- integration_connections; a second copy of that machinery is a second thing to get wrong.

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('REQUESTED', 'RINGING', 'CONNECTED', 'COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecordingPolicy" AS ENUM ('DISABLED', 'ON_CONSENT', 'ALWAYS');

-- CreateEnum
CREATE TYPE "RecordingPlaybackScope" AS ENUM ('LEADS_ONLY', 'CONNECTED_STAFF', 'PROJECT_STAFF');

-- CreateEnum
CREATE TYPE "CallRoutingStep" AS ENUM ('ASSIGNED_OWNER', 'ROUTING_CHAIN', 'ESCALATION', 'POLICY_FALLBACK', 'SUPPORT_QUEUE');

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'IVR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_CALL_INCOMING';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_CALL_MISSED';

-- CreateTable
CREATE TABLE "product_ivr_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "recording_policy" "RecordingPolicy" NOT NULL DEFAULT 'DISABLED',
    "recording_playback_scope" "RecordingPlaybackScope" NOT NULL DEFAULT 'LEADS_ONLY',
    "allowed_tiers" "SupportTier"[],
    "requester_initiate_enabled" BOOLEAN NOT NULL DEFAULT false,
    "fallback_user_id" UUID,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_ivr_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "product_id" UUID,
    "project_id" UUID,
    "provider_key" TEXT NOT NULL,
    "provider_call_id" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'REQUESTED',
    "provider_disposition" TEXT,
    "initiated_by_id" UUID,
    "requester_id" UUID,
    "external_requester_id" UUID,
    "connected_user_id" UUID,
    "client_phone_ref" TEXT,
    "recording_consent" BOOLEAN NOT NULL DEFAULT false,
    "recording_ref" TEXT,
    "recording_ready_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "queue_reason" TEXT,
    "last_error" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ringing_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "step" "CallRoutingStep" NOT NULL,
    "routing_role" TEXT,
    "target_user_id" UUID,
    "status" "CallStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "provider_call_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_ivr_policies_product_id_key" ON "product_ivr_policies"("product_id");

-- CreateIndex
CREATE INDEX "product_ivr_policies_organization_id_idx" ON "product_ivr_policies"("organization_id");

-- CreateIndex
CREATE INDEX "call_logs_organization_id_requested_at_idx" ON "call_logs"("organization_id", "requested_at");

-- CreateIndex
CREATE INDEX "call_logs_ticket_id_requested_at_idx" ON "call_logs"("ticket_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_provider_key_provider_call_id_key" ON "call_logs"("provider_key", "provider_call_id");

-- CreateIndex
CREATE INDEX "call_attempts_organization_id_started_at_idx" ON "call_attempts"("organization_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "call_attempts_call_id_sequence_key" ON "call_attempts"("call_id", "sequence");

-- CreateIndex
CREATE INDEX "call_attempts_provider_call_id_idx" ON "call_attempts"("provider_call_id");

-- AddForeignKey
ALTER TABLE "product_ivr_policies" ADD CONSTRAINT "product_ivr_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ivr_policies" ADD CONSTRAINT "product_ivr_policies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ivr_policies" ADD CONSTRAINT "product_ivr_policies_fallback_user_id_fkey" FOREIGN KEY ("fallback_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ivr_policies" ADD CONSTRAINT "product_ivr_policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_external_requester_id_fkey" FOREIGN KEY ("external_requester_id") REFERENCES "external_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_connected_user_id_fkey" FOREIGN KEY ("connected_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
--
-- `call_logs` is a child of `tickets`, and deliberately so: a client may read their own ticket's
-- call history through the portal, and the child policy is exactly "visible whenever the parent
-- row is". What a client is *shown* is decided by the allow-list mapper in the API — this is the
-- second layer, for the query that forgets its filter.
--
-- `call_attempts` and `product_ivr_policies` are provider-only. Which people were rung, in what
-- order, and why each one was passed over is staff data — the same judgement the routing trail
-- made — so the policy is the provider-only shape with no `= app_tenant_id()` client branch that
-- a later edit could widen. A client session reads nothing from either table at all.
--
-- FORCE matters: without it the policies do not apply to the table owner, which is the role the
-- application connects as.

-- The child shape, written out longhand: the helper functions the base RLS migration used are
-- dropped at the end of it, so every migration since spells its policies out. The EXISTS is what
-- makes this a child policy — the subquery is itself subject to the tickets policy, so a client
-- session finds the parent row only for its own tickets and therefore sees only its own calls.
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON call_logs
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (SELECT 1 FROM tickets t WHERE t.id = call_logs.ticket_id)
  );

ALTER TABLE call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON call_attempts
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE product_ivr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ivr_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_ivr_policies
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
