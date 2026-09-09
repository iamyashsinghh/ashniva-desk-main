-- Support routing engine (package 8b).
--
-- Additive throughout: two new tables, four new enums, five new notification types and two
-- columns on `support_ownership`. Nothing is dropped and nothing is rewritten, so a populated
-- installation upgrades by adding rows it did not have rather than by changing rows it did.
--
-- `ticket_routing_state` is a side table rather than columns on `tickets` on purpose: the
-- acknowledgement and escalation timers are swept every two minutes by two narrow indexed
-- queries, and putting six mostly-null columns on the hottest table in the product to serve them
-- would be the wrong trade.
--
-- `ticket_routing_trail` is append-only. A reassignment adds rows; it never edits the ones that
-- explain the decision it replaced.

-- CreateEnum
CREATE TYPE "RoutingOutcome" AS ENUM ('AUTO_ASSIGNED', 'SUPPORT_QUEUE', 'DISABLED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('AUTOMATIC', 'MANUAL', 'NONE');

-- CreateEnum
CREATE TYPE "RoutingRole" AS ENUM ('MODULE_OWNER', 'PRIMARY_DEVELOPER', 'ON_CALL', 'BACKUP_DEVELOPER', 'SENIOR', 'SUPPORT_EXECUTIVE');

-- CreateEnum
CREATE TYPE "RoutingSkipReason" AS ENUM ('ON_LEAVE', 'OUT_OF_HOURS', 'AT_WORKLOAD_LIMIT', 'NOT_PROJECT_MEMBER', 'WORK_AREA_MISMATCH', 'NOT_CONFIGURED', 'ALREADY_CONSIDERED', 'INACTIVE', 'IS_REQUESTER', 'PREVIOUSLY_ASSIGNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TICKET_AUTO_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_ACK_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_ESCALATED';
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_UNROUTABLE';

-- AlterTable
ALTER TABLE "support_ownership" ADD COLUMN     "auto_route_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fallback_user_id" UUID;

-- CreateTable
CREATE TABLE "ticket_routing_state" (
    "ticket_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outcome" "RoutingOutcome" NOT NULL,
    "assignment_type" "AssignmentType" NOT NULL DEFAULT 'NONE',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "routed_at" TIMESTAMP(3),
    "acknowledge_due_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" UUID,
    "escalation_due_at" TIMESTAMP(3),
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "manual_override_by_id" UUID,
    "manual_override_at" TIMESTAMP(3),
    "manual_override_reason" TEXT,
    "queue_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_routing_state_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateTable
CREATE TABLE "ticket_routing_trail" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "candidate_user_id" UUID,
    "role" "RoutingRole" NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "skip_reason" "RoutingSkipReason",
    "detail" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_routing_trail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_routing_state_organization_id_acknowledge_due_at_idx" ON "ticket_routing_state"("organization_id", "acknowledge_due_at");

-- CreateIndex
CREATE INDEX "ticket_routing_state_organization_id_escalation_due_at_idx" ON "ticket_routing_state"("organization_id", "escalation_due_at");

-- CreateIndex
CREATE INDEX "ticket_routing_trail_ticket_id_attempt_position_idx" ON "ticket_routing_trail"("ticket_id", "attempt", "position");

-- CreateIndex
CREATE INDEX "ticket_routing_trail_organization_id_created_at_idx" ON "ticket_routing_trail"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_fallback_user_id_fkey" FOREIGN KEY ("fallback_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_state" ADD CONSTRAINT "ticket_routing_state_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_state" ADD CONSTRAINT "ticket_routing_state_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_state" ADD CONSTRAINT "ticket_routing_state_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_state" ADD CONSTRAINT "ticket_routing_state_manual_override_by_id_fkey" FOREIGN KEY ("manual_override_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_trail" ADD CONSTRAINT "ticket_routing_trail_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_trail" ADD CONSTRAINT "ticket_routing_trail_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_trail" ADD CONSTRAINT "ticket_routing_trail_candidate_user_id_fkey" FOREIGN KEY ("candidate_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
--
-- Both tables are provider-internal. The trail names people who were passed over and says why —
-- that one developer is on leave, that another is at their limit — and that must never be
-- reachable from a client tenant, so the policy is the provider-only shape with no
-- `= app_tenant_id()` branch to widen later. The same decision `support_ownership` made in 8a,
-- and for the same reason.
--
-- FORCE matters: without it the policies do not apply to the table owner, which is the role the
-- application connects as. `app_tenant_id() IS NULL` keeps the background sweep working.

ALTER TABLE ticket_routing_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_routing_state FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticket_routing_state
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE ticket_routing_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_routing_trail FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticket_routing_trail
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
