-- Package 11 — recurring issues, problems, root-cause analysis and incidents.
--
-- Additive throughout: nine enums, nine tables, four new columns on `tickets`, two on
-- `support_ownership`, two on `files`, and two values on `CounterKind`. Nothing is dropped,
-- renamed or rewritten, and every new column is nullable or carries a default, so an existing
-- database applies this without touching a single stored row.
--
-- The one thing worth reading twice is at the bottom: every table here is provider-only. §19.2 of
-- the Architecture Plan says a client may **never** see another client's ticket through a problem,
-- so none of these policies has a `= app_tenant_id()` branch that a later edit could widen, and
-- there is no client mapper anywhere that could serialise one of these rows.

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN', 'RCA_REQUESTED', 'RCA_SUBMITTED', 'FIX_ASSIGNED', 'FIX_RELEASED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProblemTicketRelation" AS ENUM ('DUPLICATE', 'RELATED');

-- CreateEnum
CREATE TYPE "SimilarityDecision" AS ENUM ('PENDING', 'LINKED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RcaStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "RcaActionKind" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmergencyFixStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IncidentTimelineKind" AS ENUM ('OPENED', 'STATUS_CHANGED', 'SEVERITY_CHANGED', 'OWNER_CHANGED', 'NOTE', 'LINK_ADDED', 'EMERGENCY_FIX_REQUESTED', 'EMERGENCY_FIX_APPROVED', 'EMERGENCY_FIX_REJECTED', 'CLIENT_SUMMARY_PUBLISHED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentLinkKind" AS ENUM ('TICKET', 'TASK', 'RELEASE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CounterKind" ADD VALUE 'PROBLEM';
ALTER TYPE "CounterKind" ADD VALUE 'INCIDENT';

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "incident_id" UUID,
ADD COLUMN     "rca_report_id" UUID;

-- AlterTable
ALTER TABLE "support_ownership" ADD COLUMN     "duplicate_threshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "similarity_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "keywords" TEXT[],
ADD COLUMN     "problem_id" UUID,
ADD COLUMN     "product_version" TEXT;

-- CreateTable
CREATE TABLE "similarity_matches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "candidate_ticket_id" UUID NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "signals" TEXT[],
    "decision" "SimilarityDecision" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "similarity_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Priority" NOT NULL DEFAULT 'HIGH',
    "project_id" UUID,
    "product_id" UUID,
    "module" TEXT,
    "versions" TEXT[],
    "owner_id" UUID,
    "threshold_hit_at" TIMESTAMP(3),
    "rca_due_date" DATE,
    "fix_task_id" UUID,
    "preventive_test_task_id" UUID,
    "preventive_test" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_tickets" (
    "problem_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "relation" "ProblemTicketRelation" NOT NULL DEFAULT 'DUPLICATE',
    "linked_by_id" UUID,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_tickets_pkey" PRIMARY KEY ("problem_id","ticket_id")
);

-- CreateTable
CREATE TABLE "problem_questions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "asked_by_id" UUID NOT NULL,
    "asked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer" TEXT,
    "answered_by_id" UUID,
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "problem_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rca_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "status" "RcaStatus" NOT NULL DEFAULT 'DRAFT',
    "what" TEXT NOT NULL DEFAULT '',
    "why" TEXT NOT NULL DEFAULT '',
    "affected_clients_versions" TEXT NOT NULL DEFAULT '',
    "introduced_by" TEXT NOT NULL DEFAULT '',
    "introduced_by_release_id" UUID,
    "workaround" TEXT NOT NULL DEFAULT '',
    "permanent_fix" TEXT NOT NULL DEFAULT '',
    "prevention" TEXT NOT NULL DEFAULT '',
    "tests_added" TEXT NOT NULL DEFAULT '',
    "owner_id" UUID,
    "target_date" DATE,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rca_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rca_actions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "rca_report_id" UUID NOT NULL,
    "kind" "RcaActionKind" NOT NULL,
    "description" TEXT NOT NULL,
    "owner_id" UUID,
    "due_date" DATE,
    "task_id" UUID,
    "completed_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rca_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Priority" NOT NULL DEFAULT 'HIGH',
    "impact" TEXT,
    "project_id" UUID,
    "product_id" UUID,
    "problem_id" UUID,
    "owner_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" UUID,
    "resolution" TEXT,
    "closed_at" TIMESTAMP(3),
    "internal_notes" TEXT,
    "client_summary" TEXT,
    "client_summary_published_at" TIMESTAMP(3),
    "emergency_fix_status" "EmergencyFixStatus" NOT NULL DEFAULT 'NONE',
    "emergency_fix_reason" TEXT,
    "emergency_fix_requested_by_id" UUID,
    "emergency_fix_decided_by_id" UUID,
    "emergency_fix_decided_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_timeline_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "kind" "IncidentTimelineKind" NOT NULL,
    "body" TEXT NOT NULL,
    "actor_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "kind" "IncidentLinkKind" NOT NULL,
    "ticket_id" UUID,
    "task_id" UUID,
    "release_id" UUID,
    "added_by_id" UUID,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "similarity_matches_organization_id_decision_idx" ON "similarity_matches"("organization_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "similarity_matches_ticket_id_candidate_ticket_id_key" ON "similarity_matches"("ticket_id", "candidate_ticket_id");

-- CreateIndex
CREATE INDEX "problems_organization_id_status_idx" ON "problems"("organization_id", "status");

-- CreateIndex
CREATE INDEX "problems_project_id_status_idx" ON "problems"("project_id", "status");

-- CreateIndex
CREATE INDEX "problems_owner_id_idx" ON "problems"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "problems_organization_id_number_key" ON "problems"("organization_id", "number");

-- CreateIndex
CREATE INDEX "problem_tickets_ticket_id_idx" ON "problem_tickets"("ticket_id");

-- CreateIndex
CREATE INDEX "problem_questions_problem_id_asked_at_idx" ON "problem_questions"("problem_id", "asked_at");

-- CreateIndex
CREATE UNIQUE INDEX "rca_reports_problem_id_key" ON "rca_reports"("problem_id");

-- CreateIndex
CREATE INDEX "rca_reports_organization_id_status_idx" ON "rca_reports"("organization_id", "status");

-- CreateIndex
CREATE INDEX "rca_actions_rca_report_id_kind_idx" ON "rca_actions"("rca_report_id", "kind");

-- CreateIndex
CREATE INDEX "rca_actions_organization_id_due_date_idx" ON "rca_actions"("organization_id", "due_date");

-- CreateIndex
CREATE INDEX "incidents_organization_id_status_idx" ON "incidents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "incidents_project_id_status_idx" ON "incidents"("project_id", "status");

-- CreateIndex
CREATE INDEX "incidents_problem_id_idx" ON "incidents"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_organization_id_number_key" ON "incidents"("organization_id", "number");

-- CreateIndex
CREATE INDEX "incident_timeline_entries_incident_id_occurred_at_idx" ON "incident_timeline_entries"("incident_id", "occurred_at");

-- CreateIndex
CREATE INDEX "incident_links_incident_id_kind_idx" ON "incident_links"("incident_id", "kind");

-- CreateIndex
CREATE INDEX "incident_links_ticket_id_idx" ON "incident_links"("ticket_id");

-- Three indexes on `tickets`, and `tickets` is the busiest table in the product.
--
-- **Deploying these against a large `tickets` table.** A plain `CREATE INDEX` takes a SHARE lock,
-- so every insert and update to the table blocks until the build finishes — and one of the three
-- is a GIN build over an array column, which is the slowest of them. `prisma migrate deploy` runs
-- on container start, so on a big installation this file is a short write outage on the one table
-- nobody can afford to stop taking rows.
--
-- `CONCURRENTLY` is the answer and Prisma cannot express it: it wraps each migration file in a
-- transaction, and `CREATE INDEX CONCURRENTLY` is illegal inside one. So the procedure for an
-- installation big enough to care — the threshold is roughly a million tickets — is:
--
--   1. Build the three indexes by hand on the primary, before deploying:
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "tickets_problem_id_idx"
--          ON "tickets" ("problem_id");
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "tickets_organization_id_fingerprint_idx"
--          ON "tickets" ("organization_id", "fingerprint");
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "tickets_keywords_idx"
--          ON "tickets" USING GIN ("keywords");
--      …one statement at a time, outside any transaction. A concurrent build that fails leaves an
--      invalid index behind: `DROP INDEX` it and start that one again.
--   2. Deploy. `IF NOT EXISTS` below and on the GIN index at the end of this file makes this a
--      no-op for indexes that already exist.
--
-- `IF NOT EXISTS` is what makes step 2 safe. Without it, an operator who took step 1 would find
-- `migrate deploy` aborting with 42P07 and the deployment failing — which is exactly the person
-- who was being careful.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tickets_problem_id_idx" ON "tickets"("problem_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tickets_organization_id_fingerprint_idx" ON "tickets"("organization_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_rca_report_id_fkey" FOREIGN KEY ("rca_report_id") REFERENCES "rca_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_matches" ADD CONSTRAINT "similarity_matches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_matches" ADD CONSTRAINT "similarity_matches_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_matches" ADD CONSTRAINT "similarity_matches_candidate_ticket_id_fkey" FOREIGN KEY ("candidate_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_matches" ADD CONSTRAINT "similarity_matches_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_fix_task_id_fkey" FOREIGN KEY ("fix_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_preventive_test_task_id_fkey" FOREIGN KEY ("preventive_test_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_tickets" ADD CONSTRAINT "problem_tickets_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_tickets" ADD CONSTRAINT "problem_tickets_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_tickets" ADD CONSTRAINT "problem_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_tickets" ADD CONSTRAINT "problem_tickets_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_questions" ADD CONSTRAINT "problem_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_questions" ADD CONSTRAINT "problem_questions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_questions" ADD CONSTRAINT "problem_questions_asked_by_id_fkey" FOREIGN KEY ("asked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_questions" ADD CONSTRAINT "problem_questions_answered_by_id_fkey" FOREIGN KEY ("answered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_reports" ADD CONSTRAINT "rca_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_reports" ADD CONSTRAINT "rca_reports_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_reports" ADD CONSTRAINT "rca_reports_introduced_by_release_id_fkey" FOREIGN KEY ("introduced_by_release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_reports" ADD CONSTRAINT "rca_reports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_reports" ADD CONSTRAINT "rca_reports_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_reports" ADD CONSTRAINT "rca_reports_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_actions" ADD CONSTRAINT "rca_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_actions" ADD CONSTRAINT "rca_actions_rca_report_id_fkey" FOREIGN KEY ("rca_report_id") REFERENCES "rca_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_actions" ADD CONSTRAINT "rca_actions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_actions" ADD CONSTRAINT "rca_actions_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_actions" ADD CONSTRAINT "rca_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_emergency_fix_requested_by_id_fkey" FOREIGN KEY ("emergency_fix_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_emergency_fix_decided_by_id_fkey" FOREIGN KEY ("emergency_fix_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_entries" ADD CONSTRAINT "incident_timeline_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_entries" ADD CONSTRAINT "incident_timeline_entries_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_entries" ADD CONSTRAINT "incident_timeline_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security.
--
-- Written longhand: the `app_rls_enable_*` helpers were dropped at the end of the Phase 2 RLS
-- migration, so every policy since has been spelled out. FORCE matters — without it the policies
-- do not apply to the table owner, which is the role the application connects as.
--
-- Every one of these is the provider-only shape. A problem names the other clients who reported
-- the same fault; an RCA is an internal post-mortem; an incident carries internal notes and a
-- blame trail. None of it has a client-visible form, so none of these policies admits a client
-- tenant at all rather than admitting one under a condition somebody could later loosen.

ALTER TABLE similarity_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE similarity_matches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON similarity_matches
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON problems
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE problem_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON problem_tickets
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE problem_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON problem_questions
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE rca_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE rca_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rca_reports
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE rca_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rca_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON rca_actions
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incidents
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE incident_timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_timeline_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incident_timeline_entries
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE incident_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incident_links
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

-- `files` is deliberately not touched. Its existing policy admits a client only to a row whose
-- visibility is CLIENT *and* whose parent is one of the named client-facing entities; `rca_report_id`
-- and `incident_id` are not among them, so an RCA attachment is invisible to a client without the
-- policy changing at all.

-- A GIN index on the extracted keywords: the duplicate query asks "which other tickets share any
-- of these words", which is an array-overlap test, and a btree cannot answer one.
--
-- The slowest of the three builds this file does on `tickets`; see the note beside the other two
-- for the out-of-band `CREATE INDEX CONCURRENTLY` procedure, and why this one says IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS "tickets_keywords_idx" ON "tickets" USING GIN ("keywords");
