-- Freeze leftover seconds on Send to tester so the developer's clock does not
-- run while the tester holds the point. Resume restores this remaining time.

ALTER TABLE "project_work_plan_points"
    ADD COLUMN "paused_remaining_seconds" INTEGER;
