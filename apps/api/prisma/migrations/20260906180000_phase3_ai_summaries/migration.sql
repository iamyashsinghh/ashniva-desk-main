-- CreateEnum
CREATE TYPE "AiSummaryType" AS ENUM ('DEVELOPER_DAILY', 'LEAD_DAILY', 'PROJECT_PROGRESS', 'CLIENT_WEEKLY', 'RELEASE_NOTE_DRAFT', 'TICKET_RESOLUTION');

-- CreateEnum
CREATE TYPE "AiSummaryStatus" AS ENUM ('DRAFT', 'GENERATING', 'GENERATION_FAILED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiSourceKind" AS ENUM ('TASK', 'TASK_STATUS_CHANGE', 'WORK_LOG', 'TICKET', 'CLIENT_UPDATE', 'MILESTONE', 'CODE_ACTIVITY', 'RELEASE_NOTE');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'RATE_LIMITED', 'INVALID_RESPONSE', 'NO_SOURCES');

-- CreateTable
CREATE TABLE "ai_summaries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID,
    "project_id" UUID,
    "subject_user_id" UUID,
    "ticket_id" UUID,
    "type" "AiSummaryType" NOT NULL,
    "status" "AiSummaryStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "internal_content" TEXT,
    "client_content" TEXT,
    "missing_data_note" TEXT,
    "review_note" TEXT,
    "cancel_reason" TEXT,
    "is_draft_output" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider_name" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "output_version" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ai_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_summary_sources" (
    "id" UUID NOT NULL,
    "summary_id" UUID NOT NULL,
    "kind" "AiSourceKind" NOT NULL,
    "ref_id" UUID,
    "label" TEXT NOT NULL,
    "prompt_text" TEXT,
    "occurred_at" TIMESTAMP(3),
    "client_visible" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_summary_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_summary_versions" (
    "id" UUID NOT NULL,
    "summary_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AiSummaryStatus" NOT NULL,
    "internal_content" TEXT,
    "client_content" TEXT,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_summary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "summary_id" UUID,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'RUNNING',
    "provider_name" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT NOT NULL,
    "output_version" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ai_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_summaries_organization_id_type_status_idx" ON "ai_summaries"("organization_id", "type", "status");

-- CreateIndex
CREATE INDEX "ai_summaries_organization_id_subject_user_id_period_start_idx" ON "ai_summaries"("organization_id", "subject_user_id", "period_start");

-- CreateIndex
CREATE INDEX "ai_summaries_client_organization_id_status_idx" ON "ai_summaries"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "ai_summaries_project_id_period_start_idx" ON "ai_summaries"("project_id", "period_start");

-- CreateIndex
CREATE INDEX "ai_summary_sources_summary_id_sort_order_idx" ON "ai_summary_sources"("summary_id", "sort_order");

-- CreateIndex
CREATE INDEX "ai_summary_versions_summary_id_version_idx" ON "ai_summary_versions"("summary_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_summary_versions_summary_id_version_key" ON "ai_summary_versions"("summary_id", "version");

-- CreateIndex
CREATE INDEX "ai_generation_runs_organization_id_started_at_idx" ON "ai_generation_runs"("organization_id", "started_at");

-- CreateIndex
CREATE INDEX "ai_generation_runs_summary_id_started_at_idx" ON "ai_generation_runs"("summary_id", "started_at");

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summary_sources" ADD CONSTRAINT "ai_summary_sources_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "ai_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summary_versions" ADD CONSTRAINT "ai_summary_versions_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "ai_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summary_versions" ADD CONSTRAINT "ai_summary_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_runs" ADD CONSTRAINT "ai_generation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_runs" ADD CONSTRAINT "ai_generation_runs_summary_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "ai_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security
--
-- ai_summaries is dual-scoped only where it has a client: an internal summary has a NULL
-- client_organization_id and is therefore visible to the owning provider alone. Publication state
-- is not an RLS concern — RLS answers "whose row is it", the portal query answers "is it
-- published" — so an unpublished client summary is invisible to the client because the query says
-- so AND because the portal mapper never runs for it.
--
-- Sources, versions and runs are provider-only without exception. They carry prompt text, review
-- notes, earlier drafts and provider details, none of which a client has any business reading,
-- so they do not follow the parent's client scope the way release-note items do.
--
-- Written out rather than calling the app_rls_enable_* helpers, which the Phase 2 migration drops
-- at the end of itself on purpose.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_summaries
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR organization_id = app_tenant_id()
    OR client_organization_id = app_tenant_id()
  );

ALTER TABLE ai_summary_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summary_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_summary_sources
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM ai_summaries s
      WHERE s.id = ai_summary_sources.summary_id
        AND s.organization_id = app_tenant_id()
    )
  );

ALTER TABLE ai_summary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summary_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_summary_versions
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM ai_summaries s
      WHERE s.id = ai_summary_versions.summary_id
        AND s.organization_id = app_tenant_id()
    )
  );

ALTER TABLE ai_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_generation_runs
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR organization_id = app_tenant_id()
  );
