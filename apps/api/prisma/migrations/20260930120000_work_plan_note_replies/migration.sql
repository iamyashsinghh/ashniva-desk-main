-- Threaded replies on a work-plan note. Developer and tester both see the thread.

ALTER TYPE "WorkPlanNoteKind" ADD VALUE 'REPLY';

ALTER TABLE "project_work_plan_notes"
    ADD COLUMN "parent_id" UUID;

CREATE INDEX "project_work_plan_notes_parent_id_idx" ON "project_work_plan_notes"("parent_id");

ALTER TABLE "project_work_plan_notes"
    ADD CONSTRAINT "project_work_plan_notes_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "project_work_plan_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
