-- CreateEnum
CREATE TYPE "CodeActivityKind" AS ENUM ('COMMIT', 'BRANCH_PUSH', 'PULL_REQUEST', 'REVIEW', 'MERGE', 'RELEASE', 'TAG');

-- CreateTable
CREATE TABLE "repository_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "external_repo_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "webhook_id" TEXT,
    "linked_by_id" UUID NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "SyncStatus" NOT NULL DEFAULT 'NEVER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "repository_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "repository_link_id" UUID NOT NULL,
    "kind" "CodeActivityKind" NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author_name" TEXT,
    "author_external_id" TEXT,
    "url" TEXT,
    "branch" TEXT,
    "state" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "task_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_links_organization_id_idx" ON "repository_links"("organization_id");

-- CreateIndex
CREATE INDEX "repository_links_project_id_idx" ON "repository_links"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "repository_links_connection_id_external_repo_id_key" ON "repository_links"("connection_id", "external_repo_id");

-- CreateIndex
CREATE INDEX "code_activities_organization_id_occurred_at_idx" ON "code_activities"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "code_activities_task_id_idx" ON "code_activities"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "code_activities_repository_link_id_kind_external_id_key" ON "code_activities"("repository_link_id", "kind", "external_id");

-- AddForeignKey
ALTER TABLE "repository_links" ADD CONSTRAINT "repository_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_links" ADD CONSTRAINT "repository_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_links" ADD CONSTRAINT "repository_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_links" ADD CONSTRAINT "repository_links_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_activities" ADD CONSTRAINT "code_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_activities" ADD CONSTRAINT "code_activities_repository_link_id_fkey" FOREIGN KEY ("repository_link_id") REFERENCES "repository_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_activities" ADD CONSTRAINT "code_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security. Both tables are provider-owned, and development activity is internal by
-- design: commit messages, branch names, PR titles and reviewer names never reach the client
-- portal, so a client tenant matches neither branch and sees nothing here.
--
-- Written out rather than calling app_rls_enable_org(), which the Phase 2 migration drops at the
-- end of itself on purpose.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE repository_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE repository_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON repository_links
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());

ALTER TABLE code_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON code_activities
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider() OR organization_id = app_tenant_id());
