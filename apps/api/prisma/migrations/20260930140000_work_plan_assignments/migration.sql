-- Super admin, project manager and team lead can assign the whole plan, a phase,
-- or a topic (title) to a developer. More specific rows override broader ones.

ALTER TABLE "project_work_plans"
    ADD COLUMN "assigned_to_id" UUID;
CREATE INDEX "project_work_plans_assigned_to_id_idx" ON "project_work_plans"("assigned_to_id");
ALTER TABLE "project_work_plans"
    ADD CONSTRAINT "project_work_plans_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_work_plan_phases"
    ADD COLUMN "assigned_to_id" UUID;
CREATE INDEX "project_work_plan_phases_assigned_to_id_idx" ON "project_work_plan_phases"("assigned_to_id");
ALTER TABLE "project_work_plan_phases"
    ADD CONSTRAINT "project_work_plan_phases_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_work_plan_titles"
    ADD COLUMN "assigned_to_id" UUID;
CREATE INDEX "project_work_plan_titles_assigned_to_id_idx" ON "project_work_plan_titles"("assigned_to_id");
ALTER TABLE "project_work_plan_titles"
    ADD CONSTRAINT "project_work_plan_titles_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'WORK_PLAN_ASSIGNED';
