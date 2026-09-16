-- Priority at every assignment level. Title beats phase beats the whole plan;
-- an empty phase or topic falls through, same as assignee.

ALTER TABLE "project_work_plans"
    ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'MEDIUM';

ALTER TABLE "project_work_plan_phases"
    ALTER COLUMN "priority" DROP NOT NULL,
    ALTER COLUMN "priority" DROP DEFAULT;

UPDATE "project_work_plan_phases"
    SET "priority" = NULL
    WHERE "priority" = 'MEDIUM';

ALTER TABLE "project_work_plan_titles"
    ADD COLUMN "priority" "Priority";
