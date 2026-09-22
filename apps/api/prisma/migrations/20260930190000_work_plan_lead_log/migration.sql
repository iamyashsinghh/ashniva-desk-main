-- Extra time beyond the estimate, plus a send-to-tester / error trail for
-- admin, project manager and team lead until the point is marked Good.

CREATE TYPE "WorkPlanEventKind" AS ENUM ('SENT_TO_TESTER', 'ERROR');

ALTER TABLE "project_work_plan_points"
    ADD COLUMN "overrun_seconds" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "project_work_plan_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "kind" "WorkPlanEventKind" NOT NULL,
    "body" TEXT,
    "elapsed_seconds" INTEGER NOT NULL,
    "since_submit_seconds" INTEGER,
    "extra_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_work_plan_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_work_plan_events_point_id_created_at_idx"
    ON "project_work_plan_events"("point_id", "created_at");
CREATE INDEX "project_work_plan_events_organization_id_idx"
    ON "project_work_plan_events"("organization_id");

ALTER TABLE "project_work_plan_events"
    ADD CONSTRAINT "project_work_plan_events_point_id_fkey"
    FOREIGN KEY ("point_id") REFERENCES "project_work_plan_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_events"
    ADD CONSTRAINT "project_work_plan_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE project_work_plan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_work_plan_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_work_plan_events
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());
