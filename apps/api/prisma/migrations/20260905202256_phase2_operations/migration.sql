-- CreateEnum
CREATE TYPE "RoleAudience" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FIXED_PRICE', 'RETAINER', 'AMC', 'SUPPORT_HOURS', 'DEDICATED_DEV');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY', 'WHOLE_TERM');

-- CreateEnum
CREATE TYPE "CarryForwardRule" AS ENUM ('NONE', 'FULL', 'CAPPED');

-- CreateEnum
CREATE TYPE "HourLedgerKind" AS ENUM ('INCLUDED', 'PURCHASED', 'CARRY_FORWARD', 'EXPIRED', 'CONSUMED', 'RESERVED', 'RELEASED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MilestoneProgressMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "MilestoneHistoryKind" AS ENUM ('CREATED', 'STATUS', 'PROGRESS', 'DELIVERABLE', 'UPDATED', 'APPROVAL');

-- CreateEnum
CREATE TYPE "SlaTargetStatus" AS ENUM ('NONE', 'ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'MET', 'MET_LATE');

-- CreateEnum
CREATE TYPE "SlaEventKind" AS ENUM ('STARTED', 'PAUSED', 'RESUMED', 'FIRST_RESPONSE_MET', 'RESOLUTION_MET', 'FIRST_RESPONSE_WARNING', 'FIRST_RESPONSE_BREACHED', 'RESOLUTION_WARNING', 'RESOLUTION_BREACHED', 'RECALCULATED', 'POLICY_CHANGED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'SCHEDULED', 'COMPLETED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'PUBLISHED', 'CLIENT_APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalSubjectType" AS ENUM ('CLIENT_UPDATE', 'MILESTONE', 'CONTRACT_DOCUMENT', 'CHANGE_REQUEST', 'FILE');

-- CreateEnum
CREATE TYPE "ApprovalSide" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'TASK_REVIEW_REQUESTED', 'TASK_REVIEW_REJECTED', 'TICKET_NEW', 'TICKET_REPLY', 'SLA_WARNING', 'SLA_BREACH', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'CONTRACT_RENEWAL', 'CONTRACT_EXPIRY', 'SUPPORT_HOURS_LOW', 'CHANGE_REQUEST_STATUS');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CounterKind" ADD VALUE 'CONTRACT';
ALTER TYPE "CounterKind" ADD VALUE 'CHANGE_REQUEST';

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "change_request_id" UUID;

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "approval_id" UUID,
ADD COLUMN     "change_request_id" UUID,
ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "milestone_id" UUID;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "audience" "RoleAudience" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "template_key" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "change_request_id" UUID,
ADD COLUMN     "milestone_id" UUID;

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "project_id" UUID,
    "number" INTEGER NOT NULL,
    "number_label" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "renewal_date" DATE,
    "renewal_notice_days" INTEGER NOT NULL DEFAULT 30,
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "contract_value" DECIMAL(14,2),
    "internal_cost" DECIMAL(14,2),
    "included_minutes_per_period" INTEGER NOT NULL DEFAULT 0,
    "billing_period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "carry_forward_rule" "CarryForwardRule" NOT NULL DEFAULT 'NONE',
    "carry_forward_cap_minutes" INTEGER,
    "low_hours_threshold_minutes" INTEGER NOT NULL DEFAULT 300,
    "internal_notes" TEXT,
    "client_notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_periods" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_hour_ledger" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "kind" "HourLedgerKind" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "balance_after_minutes" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE,
    "work_log_id" UUID,
    "task_id" UUID,
    "ticket_id" UUID,
    "reason" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_hour_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_milestones" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "milestone_id" UUID,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "due_date" DATE,
    "status" "PaymentMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID,
    "change_request_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_user_id" UUID,
    "start_date" DATE,
    "due_date" DATE,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "progress_mode" "MilestoneProgressMode" NOT NULL DEFAULT 'AUTO',
    "client_visible" BOOLEAN NOT NULL DEFAULT false,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_deliverables" (
    "id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_dependencies" (
    "milestone_id" UUID NOT NULL,
    "depends_on_id" UUID NOT NULL,

    CONSTRAINT "milestone_dependencies_pkey" PRIMARY KEY ("milestone_id","depends_on_id")
);

-- CreateTable
CREATE TABLE "milestone_history" (
    "id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "kind" "MilestoneHistoryKind" NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "reason" TEXT,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "business_hours_start" TEXT NOT NULL DEFAULT '09:00',
    "business_hours_end" TEXT NOT NULL DEFAULT '18:00',
    "business_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "pause_statuses" "TicketStatus"[] DEFAULT ARRAY['WAITING_CLIENT']::"TicketStatus"[],
    "warning_percent" INTEGER NOT NULL DEFAULT 80,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policy_rules" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "priority" "Priority" NOT NULL,
    "first_response_minutes" INTEGER NOT NULL,
    "resolution_minutes" INTEGER NOT NULL,

    CONSTRAINT "sla_policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_sla" (
    "ticket_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "first_response_due_at" TIMESTAMP(3),
    "first_response_warn_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "first_response_status" "SlaTargetStatus" NOT NULL DEFAULT 'ON_TRACK',
    "resolution_due_at" TIMESTAMP(3),
    "resolution_warn_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution_status" "SlaTargetStatus" NOT NULL DEFAULT 'ON_TRACK',
    "paused_at" TIMESTAMP(3),
    "paused_total_minutes" INTEGER NOT NULL DEFAULT 0,
    "first_response_elapsed_minutes" INTEGER NOT NULL DEFAULT 0,
    "resolution_elapsed_minutes" INTEGER NOT NULL DEFAULT 0,
    "clock_started_at" TIMESTAMP(3) NOT NULL,
    "last_evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_sla_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateTable
CREATE TABLE "sla_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "kind" "SlaEventKind" NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "project_id" UUID,
    "contract_id" UUID,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "business_reason" TEXT,
    "scope" TEXT,
    "impact" TEXT,
    "estimated_minutes" INTEGER,
    "cost_impact" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timeline_impact_days" INTEGER,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "internal_notes" TEXT,
    "decision_note" TEXT,
    "requested_by_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "scheduled_for" DATE,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_request_history" (
    "id" UUID NOT NULL,
    "change_request_id" UUID NOT NULL,
    "from_status" "ChangeRequestStatus",
    "to_status" "ChangeRequestStatus" NOT NULL,
    "note" TEXT,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_request_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "project_id" UUID,
    "contract_id" UUID,
    "change_request_id" UUID,
    "subject_type" "ApprovalSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "internal_notes" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "due_date" DATE,
    "requested_by_id" UUID NOT NULL,
    "internal_reviewer_id" UUID,
    "internal_reviewed_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_history" (
    "id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "from_status" "ApprovalStatus",
    "to_status" "ApprovalStatus" NOT NULL,
    "side" "ApprovalSide" NOT NULL,
    "comment" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "dedupe_key" TEXT,
    "group_key" TEXT,
    "grouped_count" INTEGER NOT NULL DEFAULT 1,
    "delivered_at" TIMESTAMP(3),
    "deliver_after" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '22:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '07:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id","organization_id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_organization_id_status_idx" ON "contracts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "contracts_client_organization_id_status_idx" ON "contracts"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "contracts_project_id_idx" ON "contracts"("project_id");

-- CreateIndex
CREATE INDEX "contracts_end_date_idx" ON "contracts"("end_date");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_organization_id_number_key" ON "contracts"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "contract_periods_contract_id_period_start_key" ON "contract_periods"("contract_id", "period_start");

-- CreateIndex
CREATE INDEX "contract_hour_ledger_contract_id_created_at_idx" ON "contract_hour_ledger"("contract_id", "created_at");

-- CreateIndex
CREATE INDEX "contract_hour_ledger_organization_id_created_at_idx" ON "contract_hour_ledger"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "contract_hour_ledger_work_log_id_idx" ON "contract_hour_ledger"("work_log_id");

-- CreateIndex
CREATE INDEX "payment_milestones_contract_id_sort_order_idx" ON "payment_milestones"("contract_id", "sort_order");

-- CreateIndex
CREATE INDEX "milestones_organization_id_status_idx" ON "milestones"("organization_id", "status");

-- CreateIndex
CREATE INDEX "milestones_project_id_sort_order_idx" ON "milestones"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "milestones_contract_id_idx" ON "milestones"("contract_id");

-- CreateIndex
CREATE INDEX "milestones_owner_user_id_idx" ON "milestones"("owner_user_id");

-- CreateIndex
CREATE INDEX "milestones_due_date_idx" ON "milestones"("due_date");

-- CreateIndex
CREATE INDEX "milestone_deliverables_milestone_id_sort_order_idx" ON "milestone_deliverables"("milestone_id", "sort_order");

-- CreateIndex
CREATE INDEX "milestone_dependencies_depends_on_id_idx" ON "milestone_dependencies"("depends_on_id");

-- CreateIndex
CREATE INDEX "milestone_history_milestone_id_created_at_idx" ON "milestone_history"("milestone_id", "created_at");

-- CreateIndex
CREATE INDEX "sla_policies_organization_id_idx" ON "sla_policies"("organization_id");

-- CreateIndex
CREATE INDEX "sla_policies_client_organization_id_idx" ON "sla_policies"("client_organization_id");

-- CreateIndex
CREATE INDEX "sla_policies_project_id_idx" ON "sla_policies"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policy_rules_policy_id_priority_key" ON "sla_policy_rules"("policy_id", "priority");

-- CreateIndex
CREATE INDEX "ticket_sla_policy_id_idx" ON "ticket_sla"("policy_id");

-- CreateIndex
CREATE INDEX "ticket_sla_first_response_due_at_idx" ON "ticket_sla"("first_response_due_at");

-- CreateIndex
CREATE INDEX "ticket_sla_resolution_due_at_idx" ON "ticket_sla"("resolution_due_at");

-- CreateIndex
CREATE INDEX "sla_events_ticket_id_created_at_idx" ON "sla_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "change_requests_organization_id_status_idx" ON "change_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "change_requests_client_organization_id_status_idx" ON "change_requests"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "change_requests_project_id_idx" ON "change_requests"("project_id");

-- CreateIndex
CREATE INDEX "change_requests_contract_id_idx" ON "change_requests"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "change_requests_organization_id_number_key" ON "change_requests"("organization_id", "number");

-- CreateIndex
CREATE INDEX "change_request_history_change_request_id_created_at_idx" ON "change_request_history"("change_request_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_organization_id_status_idx" ON "approval_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_client_organization_id_status_idx" ON "approval_requests"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_subject_type_subject_id_idx" ON "approval_requests"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "approval_requests_project_id_idx" ON "approval_requests"("project_id");

-- CreateIndex
CREATE INDEX "approval_history_approval_id_created_at_idx" ON "approval_history"("approval_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_dedupe_key_idx" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_deliver_after_idx" ON "notifications"("deliver_after");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_organization_id_type_chann_key" ON "notification_preferences"("user_id", "organization_id", "type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "user_invitations_user_id_idx" ON "user_invitations"("user_id");

-- CreateIndex
CREATE INDEX "user_invitations_organization_id_created_at_idx" ON "user_invitations"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "comments_change_request_id_created_at_idx" ON "comments"("change_request_id", "created_at");

-- CreateIndex
CREATE INDEX "files_contract_id_idx" ON "files"("contract_id");

-- CreateIndex
CREATE INDEX "files_milestone_id_idx" ON "files"("milestone_id");

-- CreateIndex
CREATE INDEX "files_change_request_id_idx" ON "files"("change_request_id");

-- CreateIndex
CREATE INDEX "files_approval_id_idx" ON "files"("approval_id");

-- CreateIndex
CREATE INDEX "tasks_milestone_id_idx" ON "tasks"("milestone_id");

-- CreateIndex
CREATE INDEX "tasks_change_request_id_idx" ON "tasks"("change_request_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_periods" ADD CONSTRAINT "contract_periods_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_hour_ledger" ADD CONSTRAINT "contract_hour_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_hour_ledger" ADD CONSTRAINT "contract_hour_ledger_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_hour_ledger" ADD CONSTRAINT "contract_hour_ledger_work_log_id_fkey" FOREIGN KEY ("work_log_id") REFERENCES "work_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_hour_ledger" ADD CONSTRAINT "contract_hour_ledger_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_hour_ledger" ADD CONSTRAINT "contract_hour_ledger_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_deliverables" ADD CONSTRAINT "milestone_deliverables_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "milestone_dependencies_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "milestone_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_history" ADD CONSTRAINT "milestone_history_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_history" ADD CONSTRAINT "milestone_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policy_rules" ADD CONSTRAINT "sla_policy_rules_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sla" ADD CONSTRAINT "ticket_sla_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_sla" ADD CONSTRAINT "ticket_sla_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "sla_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_history" ADD CONSTRAINT "change_request_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_internal_reviewer_id_fkey" FOREIGN KEY ("internal_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written constraints (Prisma cannot express partial indexes or CHECKs)
-- ---------------------------------------------------------------------------------------------

-- A comment belongs to exactly one parent: task, ticket or change request.
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "ck_comments_single_parent";
ALTER TABLE "comments" ADD CONSTRAINT "ck_comments_single_parent"
  CHECK (num_nonnulls("task_id", "ticket_id", "change_request_id") = 1);

-- A file hangs off at most one parent.
ALTER TABLE "files" ADD CONSTRAINT "ck_files_single_parent"
  CHECK (num_nonnulls("task_id", "ticket_id", "project_id", "contract_id", "milestone_id", "change_request_id", "approval_id") <= 1);

-- One consumption per work log: the database itself forbids deducting the same work twice.
CREATE UNIQUE INDEX "ux_ledger_consumed_work_log" ON "contract_hour_ledger" ("work_log_id")
  WHERE "kind" = 'CONSUMED' AND "work_log_id" IS NOT NULL;

-- Retried manual credits and adjustments are absorbed, not duplicated.
CREATE UNIQUE INDEX "ux_ledger_idempotency" ON "contract_hour_ledger" ("contract_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Every ledger movement moves the balance; a zero row is a bug.
ALTER TABLE "contract_hour_ledger" ADD CONSTRAINT "ck_ledger_minutes_nonzero" CHECK ("minutes" <> 0);

-- Warning and breach events happen once per ticket and target, so the monitor never notifies twice.
CREATE UNIQUE INDEX "ux_sla_events_once" ON "sla_events" ("ticket_id", "kind")
  WHERE "kind" IN ('FIRST_RESPONSE_WARNING', 'FIRST_RESPONSE_BREACHED', 'RESOLUTION_WARNING', 'RESOLUTION_BREACHED');

-- One default policy per organization; one policy per client organization and per project.
CREATE UNIQUE INDEX "ux_sla_policies_default" ON "sla_policies" ("organization_id")
  WHERE "is_default" = TRUE AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "ux_sla_policies_client" ON "sla_policies" ("organization_id", "client_organization_id")
  WHERE "client_organization_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "ux_sla_policies_project" ON "sla_policies" ("organization_id", "project_id")
  WHERE "project_id" IS NOT NULL AND "deleted_at" IS NULL;
ALTER TABLE "sla_policies" ADD CONSTRAINT "ck_sla_warning_percent" CHECK ("warning_percent" BETWEEN 1 AND 99);
ALTER TABLE "sla_policy_rules" ADD CONSTRAINT "ck_sla_rule_minutes"
  CHECK ("first_response_minutes" > 0 AND "resolution_minutes" > 0);

-- Progress is a percentage.
ALTER TABLE "milestones" ADD CONSTRAINT "ck_milestones_progress" CHECK ("progress_percent" BETWEEN 0 AND 100);
-- A milestone cannot depend on itself.
ALTER TABLE "milestone_dependencies" ADD CONSTRAINT "ck_milestone_dependency_not_self"
  CHECK ("milestone_id" <> "depends_on_id");

-- Contract dates and hour settings must make sense.
ALTER TABLE "contracts" ADD CONSTRAINT "ck_contracts_dates" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "contracts" ADD CONSTRAINT "ck_contracts_minutes"
  CHECK ("included_minutes_per_period" >= 0 AND "low_hours_threshold_minutes" >= 0);
ALTER TABLE "contract_periods" ADD CONSTRAINT "ck_contract_periods_dates" CHECK ("period_end" >= "period_start");

-- One open (unaccepted, unrevoked) invitation per user and organization.
CREATE UNIQUE INDEX "ux_invitations_open" ON "user_invitations" ("organization_id", "user_id")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- Custom roles are unique by name inside their organization (system roles by key, from init).
CREATE UNIQUE INDEX "ux_roles_org_name" ON "roles" ("organization_id", lower("name"))
  WHERE "organization_id" IS NOT NULL AND "deleted_at" IS NULL;
