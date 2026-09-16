-- Each Summary topic can drive one task, so the assignee and tester work it
-- the same way as any other task on the board.

ALTER TABLE "tasks"
    ADD COLUMN "work_plan_title_id" UUID;
CREATE UNIQUE INDEX "tasks_work_plan_title_id_key" ON "tasks"("work_plan_title_id");
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_work_plan_title_id_fkey"
    FOREIGN KEY ("work_plan_title_id") REFERENCES "project_work_plan_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
