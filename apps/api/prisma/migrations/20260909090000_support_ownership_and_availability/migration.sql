-- Support ownership, working hours, availability and on-call (package 8a).
--
-- Purely additive: three enums and four new tables. Nothing existing is dropped, altered or
-- backfilled, so an installation that upgrades to this migration keeps behaving exactly as it did
-- until somebody configures a rota.
--
-- These are the entities Architecture Plan §19.3 named and `modules/on-call/README.md` has been
-- listing as planned since Phase 2b. The routing engine of package 8b reads them; nothing in this
-- migration routes anything yet.


-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'ON_LEAVE', 'OUT_OF_HOURS', 'AT_LIMIT');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('MANUAL', 'HR', 'SCHEDULE', 'WORKLOAD');

-- CreateEnum
CREATE TYPE "OnCallSource" AS ENUM ('MANUAL', 'ROTATION');

-- CreateTable
CREATE TABLE "user_work_schedules" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "working_days" INTEGER[],
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "workload_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "user_work_schedules_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_availability" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "source" "AvailabilitySource" NOT NULL,
    "until" TIMESTAMP(3),
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "user_availability_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "on_call_schedule" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "on_date" DATE NOT NULL,
    "user_id" UUID NOT NULL,
    "backup_user_id" UUID,
    "source" "OnCallSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "on_call_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ownership" (
    "project_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "primary_developer_id" UUID,
    "backup_developer_id" UUID,
    "senior_id" UUID,
    "tester_id" UUID,
    "support_executive_id" UUID,
    "module_owners" JSONB NOT NULL DEFAULT '{}',
    "workload_limit" INTEGER,
    "ack_minutes" INTEGER NOT NULL DEFAULT 15,
    "escalation_minutes" INTEGER NOT NULL DEFAULT 30,
    "direct_types" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "support_ownership_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "user_work_schedules_organization_id_idx" ON "user_work_schedules"("organization_id");

-- CreateIndex
CREATE INDEX "user_availability_organization_id_status_idx" ON "user_availability"("organization_id", "status");

-- CreateIndex
CREATE INDEX "on_call_schedule_organization_id_on_date_idx" ON "on_call_schedule"("organization_id", "on_date");

-- CreateIndex
CREATE UNIQUE INDEX "on_call_schedule_project_id_on_date_key" ON "on_call_schedule"("project_id", "on_date");

-- CreateIndex
CREATE INDEX "support_ownership_organization_id_idx" ON "support_ownership"("organization_id");

-- AddForeignKey
ALTER TABLE "user_work_schedules" ADD CONSTRAINT "user_work_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_work_schedules" ADD CONSTRAINT "user_work_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_work_schedules" ADD CONSTRAINT "user_work_schedules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedule" ADD CONSTRAINT "on_call_schedule_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedule" ADD CONSTRAINT "on_call_schedule_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedule" ADD CONSTRAINT "on_call_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedule" ADD CONSTRAINT "on_call_schedule_backup_user_id_fkey" FOREIGN KEY ("backup_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_call_schedule" ADD CONSTRAINT "on_call_schedule_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_primary_developer_id_fkey" FOREIGN KEY ("primary_developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_backup_developer_id_fkey" FOREIGN KEY ("backup_developer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_senior_id_fkey" FOREIGN KEY ("senior_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_support_executive_id_fkey" FOREIGN KEY ("support_executive_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ownership" ADD CONSTRAINT "support_ownership_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security.
--
-- All four are provider-internal: a rota, an attendance state, an on-call day and a support
-- ownership row are staff records, and no client tenant has any business reading them. The policy
-- is therefore the provider-only shape with no `= app_tenant_id()` branch to widen later — the
-- same decision `test_accounts` made, and for the same reason.
--
-- FORCE matters: without it the policies do not apply to the table owner, which is the role the
-- application connects as. `app_tenant_id() IS NULL` keeps background jobs working.

ALTER TABLE user_work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_work_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_work_schedules
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE user_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_availability FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_availability
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE on_call_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE on_call_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON on_call_schedule
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE support_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ownership FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_ownership
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
