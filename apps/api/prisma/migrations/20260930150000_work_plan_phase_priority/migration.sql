-- How urgent this phase's work is. Same Low / Medium / High / Critical scale as tasks.

ALTER TABLE "project_work_plan_phases"
    ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'MEDIUM';
