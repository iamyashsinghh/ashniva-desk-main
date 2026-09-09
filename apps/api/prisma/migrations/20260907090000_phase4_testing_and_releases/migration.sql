-- CreateEnum
CREATE TYPE "TestingAssignmentKind" AS ENUM ('QA', 'RETEST', 'LIVE_VERIFICATION', 'UAT');

-- CreateEnum
CREATE TYPE "TestingAssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CLARIFICATION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestOutcome" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TestEnvironmentStatus" AS ENUM ('UP', 'DOWN', 'DEPLOYING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CredentialRotationPolicy" AS ENUM ('AFTER_TEST', 'DAILY', 'MANUAL');

-- CreateEnum
CREATE TYPE "CredentialAction" AS ENUM ('GENERATE', 'REVEAL', 'ROTATE', 'REVOKE');

-- CreateEnum
CREATE TYPE "UatDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "TestEnvironmentKind" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'APPROVAL_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'VERIFIED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "ReleaseApproverRole" AS ENUM ('SENIOR', 'PROJECT_MANAGER', 'QA_LEAD', 'CLIENT', 'DIRECTOR');

-- CreateEnum
CREATE TYPE "ReleaseApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReleaseItemKind" AS ENUM ('TASK', 'TICKET', 'CHANGE_REQUEST');

-- CreateTable
CREATE TABLE "testing_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "TestingAssignmentKind" NOT NULL,
    "status" "TestingAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "environment" "TestEnvironmentKind" NOT NULL DEFAULT 'STAGING',
    "task_id" UUID,
    "ticket_id" UUID,
    "release_id" UUID,
    "assigned_to_user_id" UUID,
    "client_organization_id" UUID,
    "assigned_by_id" UUID NOT NULL,
    "staging_url" TEXT,
    "what_developed" TEXT,
    "what_to_test" TEXT,
    "acceptance_criteria" TEXT,
    "developer_notes" TEXT,
    "browser_device" TEXT[],
    "checks_status" "CheckStatus",
    "test_account_id" UUID,
    "clarification_question" TEXT,
    "clarification_answer" TEXT,
    "due_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "testing_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "outcome" "TestOutcome" NOT NULL,
    "environment" "TestEnvironmentKind" NOT NULL DEFAULT 'STAGING',
    "what_tested" TEXT NOT NULL,
    "actual_result" TEXT NOT NULL,
    "failure_description" TEXT,
    "severity" "TestSeverity",
    "browser_device" TEXT,
    "comment_for_developer" TEXT,
    "retest_required" BOOLEAN NOT NULL DEFAULT false,
    "evidence_file_id" UUID,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "environment" "TestEnvironmentKind" NOT NULL,
    "environment_id" UUID,
    "label" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "notes" TEXT,
    "rotation_policy" "CredentialRotationPolicy" NOT NULL DEFAULT 'AFTER_TEST',
    "reset_hook_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rotated_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "test_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "test_account_id" UUID NOT NULL,
    "granted_to_user_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_access_log" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "grant_id" UUID,
    "test_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "CredentialAction" NOT NULL DEFAULT 'REVEAL',
    "revealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "credential_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "environment" "TestEnvironmentKind" NOT NULL DEFAULT 'PRODUCTION',
    "notes" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),
    "rollback_reason" TEXT,
    "failure_reason" TEXT,
    "release_note_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_items" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "kind" "ReleaseItemKind" NOT NULL,
    "task_id" UUID,
    "ticket_id" UUID,
    "change_request_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "approver_role" "ReleaseApproverRole" NOT NULL,
    "decision" "ReleaseApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "approver_user_id" UUID,
    "note" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_history" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "from_status" "ReleaseStatus",
    "to_status" "ReleaseStatus" NOT NULL,
    "note" TEXT,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_release_policy" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "approver_roles" "ReleaseApproverRole"[],
    "requires_qa_pass" BOOLEAN NOT NULL DEFAULT true,
    "requires_client_uat" BOOLEAN NOT NULL DEFAULT false,
    "requires_live_verification" BOOLEAN NOT NULL DEFAULT true,
    "requires_typed_confirmation" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_release_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_environments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "TestEnvironmentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "status" "TestEnvironmentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "deployed_version" TEXT,
    "deployed_at" TIMESTAMP(3),
    "github_environment_name" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "test_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uat_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "release_id" UUID,
    "task_id" UUID,
    "summary_plain" TEXT NOT NULL,
    "preview_url" TEXT,
    "checklist" TEXT[],
    "status" "UatDecision" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "uat_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "testing_assignments_organization_id_status_idx" ON "testing_assignments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "testing_assignments_assigned_to_user_id_status_idx" ON "testing_assignments"("assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "testing_assignments_project_id_kind_idx" ON "testing_assignments"("project_id", "kind");

-- CreateIndex
CREATE INDEX "testing_assignments_release_id_idx" ON "testing_assignments"("release_id");

-- CreateIndex
CREATE INDEX "testing_assignments_client_organization_id_status_idx" ON "testing_assignments"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "test_results_assignment_id_created_at_idx" ON "test_results"("assignment_id", "created_at");

-- CreateIndex
CREATE INDEX "test_results_organization_id_outcome_idx" ON "test_results"("organization_id", "outcome");

-- CreateIndex
CREATE INDEX "test_accounts_organization_id_project_id_idx" ON "test_accounts"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_accounts_project_id_environment_label_key" ON "test_accounts"("project_id", "environment", "label");

-- CreateIndex
CREATE INDEX "credential_grants_organization_id_expires_at_idx" ON "credential_grants"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "credential_grants_granted_to_user_id_expires_at_idx" ON "credential_grants"("granted_to_user_id", "expires_at");

-- CreateIndex
CREATE INDEX "credential_grants_test_account_id_idx" ON "credential_grants"("test_account_id");

-- CreateIndex
CREATE INDEX "credential_access_log_organization_id_revealed_at_idx" ON "credential_access_log"("organization_id", "revealed_at");

-- CreateIndex
CREATE INDEX "credential_access_log_test_account_id_revealed_at_idx" ON "credential_access_log"("test_account_id", "revealed_at");

-- CreateIndex
CREATE INDEX "releases_organization_id_status_idx" ON "releases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "releases_project_id_status_idx" ON "releases"("project_id", "status");

-- CreateIndex
CREATE INDEX "releases_organization_id_scheduled_for_idx" ON "releases"("organization_id", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "releases_project_id_version_key" ON "releases"("project_id", "version");

-- CreateIndex
CREATE INDEX "release_items_release_id_position_idx" ON "release_items"("release_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "release_items_release_id_task_id_key" ON "release_items"("release_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_items_release_id_ticket_id_key" ON "release_items"("release_id", "ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_items_release_id_change_request_id_key" ON "release_items"("release_id", "change_request_id");

-- CreateIndex
CREATE INDEX "release_approvals_organization_id_decision_idx" ON "release_approvals"("organization_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "release_approvals_release_id_approver_role_key" ON "release_approvals"("release_id", "approver_role");

-- CreateIndex
CREATE INDEX "release_history_release_id_created_at_idx" ON "release_history"("release_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_release_policy_project_id_key" ON "project_release_policy"("project_id");

-- CreateIndex
CREATE INDEX "project_release_policy_organization_id_idx" ON "project_release_policy"("organization_id");

-- CreateIndex
CREATE INDEX "test_environments_organization_id_project_id_idx" ON "test_environments"("organization_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_environments_project_id_kind_url_key" ON "test_environments"("project_id", "kind", "url");

-- CreateIndex
CREATE INDEX "uat_requests_organization_id_status_idx" ON "uat_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "uat_requests_client_organization_id_status_idx" ON "uat_requests"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "uat_requests_release_id_idx" ON "uat_requests"("release_id");

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "testing_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_accounts" ADD CONSTRAINT "test_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_accounts" ADD CONSTRAINT "test_accounts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_accounts" ADD CONSTRAINT "test_accounts_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "test_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_accounts" ADD CONSTRAINT "test_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_grants" ADD CONSTRAINT "credential_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_grants" ADD CONSTRAINT "credential_grants_test_account_id_fkey" FOREIGN KEY ("test_account_id") REFERENCES "test_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_grants" ADD CONSTRAINT "credential_grants_granted_to_user_id_fkey" FOREIGN KEY ("granted_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_grants" ADD CONSTRAINT "credential_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_access_log" ADD CONSTRAINT "credential_access_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_access_log" ADD CONSTRAINT "credential_access_log_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "credential_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_access_log" ADD CONSTRAINT "credential_access_log_test_account_id_fkey" FOREIGN KEY ("test_account_id") REFERENCES "test_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_access_log" ADD CONSTRAINT "credential_access_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_release_note_id_fkey" FOREIGN KEY ("release_note_id") REFERENCES "release_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_items" ADD CONSTRAINT "release_items_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_items" ADD CONSTRAINT "release_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_items" ADD CONSTRAINT "release_items_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_items" ADD CONSTRAINT "release_items_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approvals" ADD CONSTRAINT "release_approvals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approvals" ADD CONSTRAINT "release_approvals_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approvals" ADD CONSTRAINT "release_approvals_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_history" ADD CONSTRAINT "release_history_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_history" ADD CONSTRAINT "release_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_release_policy" ADD CONSTRAINT "project_release_policy_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_release_policy" ADD CONSTRAINT "project_release_policy_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_environments" ADD CONSTRAINT "test_environments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_environments" ADD CONSTRAINT "test_environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_environments" ADD CONSTRAINT "test_environments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_requests" ADD CONSTRAINT "uat_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_requests" ADD CONSTRAINT "uat_requests_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_requests" ADD CONSTRAINT "uat_requests_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_requests" ADD CONSTRAINT "uat_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_requests" ADD CONSTRAINT "uat_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_requests" ADD CONSTRAINT "uat_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

