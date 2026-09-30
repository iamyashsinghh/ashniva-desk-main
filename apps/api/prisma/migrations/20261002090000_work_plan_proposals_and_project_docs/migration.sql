-- CreateEnum
CREATE TYPE "WorkPlanProposalStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "project_work_plan_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "WorkPlanProposalStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "phase_id" UUID,
    "phase_heading" TEXT,
    "title_id" UUID,
    "title" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "assigned_to_id" UUID,
    "reviewer_id" UUID,
    "priority" "Priority",
    "due_date" DATE,
    "context" TEXT,
    "created_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "published_title_id" UUID,
    "published_task_id" UUID,
    "published_task_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_work_plan_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_docs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "markdown" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_work_plan_proposals_project_id_status_idx" ON "project_work_plan_proposals"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_work_plan_proposals_organization_id_source_external_id_key" ON "project_work_plan_proposals"("organization_id", "source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_docs_project_id_key" ON "project_docs"("project_id");

-- AddForeignKey
ALTER TABLE "project_work_plan_proposals" ADD CONSTRAINT "project_work_plan_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_docs" ADD CONSTRAINT "project_docs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Provider-owned rows: a client tenant sees neither table.
ALTER TABLE project_work_plan_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_proposals
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());

ALTER TABLE project_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_docs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_docs
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());
