-- Project work plans: one phase outline per project, built from a PDF or entered by hand.
-- Timed points stay hidden until Start; missing the timer steps down this plan's on-time %.

CREATE TYPE "ProjectWorkPlanSource" AS ENUM ('PDF', 'MANUAL', 'MIXED');

CREATE TABLE "project_work_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_file_id" UUID,
    "source" "ProjectWorkPlanSource" NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_work_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_work_plan_phases" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "heading" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_work_plan_phases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_work_plan_titles" (
    "id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_work_plan_titles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_work_plan_points" (
    "id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "estimate_minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "started_by_id" UUID,
    "penalty_applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_work_plan_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_work_plan_scores" (
    "plan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 100,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_work_plan_scores_pkey" PRIMARY KEY ("plan_id","user_id")
);

CREATE UNIQUE INDEX "project_work_plans_project_id_key" ON "project_work_plans"("project_id");
CREATE INDEX "project_work_plans_organization_id_idx" ON "project_work_plans"("organization_id");
CREATE INDEX "project_work_plan_phases_plan_id_sort_order_idx" ON "project_work_plan_phases"("plan_id", "sort_order");
CREATE INDEX "project_work_plan_titles_phase_id_sort_order_idx" ON "project_work_plan_titles"("phase_id", "sort_order");
CREATE INDEX "project_work_plan_points_title_id_sort_order_idx" ON "project_work_plan_points"("title_id", "sort_order");
CREATE INDEX "project_work_plan_points_started_by_id_idx" ON "project_work_plan_points"("started_by_id");

ALTER TABLE "project_work_plans" ADD CONSTRAINT "project_work_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_work_plans" ADD CONSTRAINT "project_work_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plans" ADD CONSTRAINT "project_work_plans_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_work_plans" ADD CONSTRAINT "project_work_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_work_plan_phases" ADD CONSTRAINT "project_work_plan_phases_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "project_work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_titles" ADD CONSTRAINT "project_work_plan_titles_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "project_work_plan_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_points" ADD CONSTRAINT "project_work_plan_points_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "project_work_plan_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_points" ADD CONSTRAINT "project_work_plan_points_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_scores" ADD CONSTRAINT "project_work_plan_scores_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "project_work_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_plan_scores" ADD CONSTRAINT "project_work_plan_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
