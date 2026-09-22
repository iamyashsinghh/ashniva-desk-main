-- Assignment stamps for leads, tester-pass events, and error steps that resume
-- the original point's timer on Start.

ALTER TABLE "project_work_plans"
    ADD COLUMN "assigned_at" TIMESTAMP(3);
ALTER TABLE "project_work_plan_phases"
    ADD COLUMN "assigned_at" TIMESTAMP(3);
ALTER TABLE "project_work_plan_titles"
    ADD COLUMN "assigned_at" TIMESTAMP(3);

ALTER TABLE "project_work_plan_points"
    ADD COLUMN "is_error" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "parent_point_id" UUID;

CREATE INDEX "project_work_plan_points_parent_point_id_idx"
    ON "project_work_plan_points"("parent_point_id");

ALTER TABLE "project_work_plan_points"
    ADD CONSTRAINT "project_work_plan_points_parent_point_id_fkey"
    FOREIGN KEY ("parent_point_id") REFERENCES "project_work_plan_points"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "WorkPlanEventKind" ADD VALUE 'PASSED';

UPDATE "project_work_plans"
SET "assigned_at" = "updated_at"
WHERE "assigned_to_id" IS NOT NULL AND "assigned_at" IS NULL;
UPDATE "project_work_plan_phases"
SET "assigned_at" = "updated_at"
WHERE "assigned_to_id" IS NOT NULL AND "assigned_at" IS NULL;
UPDATE "project_work_plan_titles"
SET "assigned_at" = "updated_at"
WHERE "assigned_to_id" IS NOT NULL AND "assigned_at" IS NULL;
