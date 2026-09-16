-- Developer → tester loop on work-plan points, plus notes for doubts and issues.
-- Additive: existing rows keep their timers; status is backfilled from started/completed.

CREATE TYPE "WorkPlanPointStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'AWAITING_TEST', 'RETURNED', 'COMPLETED');
CREATE TYPE "WorkPlanNoteKind" AS ENUM ('DOUBT', 'ISSUE');

ALTER TABLE "project_work_plan_points"
    ADD COLUMN "status" "WorkPlanPointStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "completed_by_id" UUID,
    ADD COLUMN "submitted_at" TIMESTAMP(3);

UPDATE "project_work_plan_points"
SET "status" = 'COMPLETED'
WHERE "completed_at" IS NOT NULL;

UPDATE "project_work_plan_points"
SET "status" = 'IN_PROGRESS'
WHERE "completed_at" IS NULL AND "started_at" IS NOT NULL;

CREATE INDEX "project_work_plan_points_status_idx" ON "project_work_plan_points"("status");

ALTER TABLE "project_work_plan_points"
    ADD CONSTRAINT "project_work_plan_points_completed_by_id_fkey"
    FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_work_plan_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "WorkPlanNoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_work_plan_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_work_plan_notes_point_id_created_at_idx" ON "project_work_plan_notes"("point_id", "created_at");
CREATE INDEX "project_work_plan_notes_organization_id_idx" ON "project_work_plan_notes"("organization_id");

ALTER TABLE "project_work_plan_notes"
    ADD CONSTRAINT "project_work_plan_notes_point_id_fkey"
    FOREIGN KEY ("point_id") REFERENCES "project_work_plan_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_notes"
    ADD CONSTRAINT "project_work_plan_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provider-only RLS, same shape as other internal tables (helpers were dropped after Phase 2).
ALTER TABLE project_work_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plans
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());

ALTER TABLE project_work_plan_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_phases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_phases
  USING (
    app_tenant_id() IS NULL OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM project_work_plans p
      WHERE p.id = project_work_plan_phases.plan_id AND p.organization_id = app_tenant_id()
    )
  );

ALTER TABLE project_work_plan_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_titles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_titles
  USING (
    app_tenant_id() IS NULL OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM project_work_plan_phases ph
      JOIN project_work_plans p ON p.id = ph.plan_id
      WHERE ph.id = project_work_plan_titles.phase_id AND p.organization_id = app_tenant_id()
    )
  );

ALTER TABLE project_work_plan_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_points FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_points
  USING (
    app_tenant_id() IS NULL OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM project_work_plan_titles t
      JOIN project_work_plan_phases ph ON ph.id = t.phase_id
      JOIN project_work_plans p ON p.id = ph.plan_id
      WHERE t.id = project_work_plan_points.title_id AND p.organization_id = app_tenant_id()
    )
  );

ALTER TABLE project_work_plan_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_scores
  USING (
    app_tenant_id() IS NULL OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM project_work_plans p
      WHERE p.id = project_work_plan_scores.plan_id AND p.organization_id = app_tenant_id()
    )
  );

ALTER TABLE project_work_plan_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_notes
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());
