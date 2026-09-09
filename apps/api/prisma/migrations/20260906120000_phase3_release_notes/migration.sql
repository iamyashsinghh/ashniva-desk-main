-- CreateEnum
CREATE TYPE "ReleaseNoteStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReleaseNoteItemKind" AS ENUM ('TASK', 'TICKET', 'CLIENT_UPDATE', 'CODE_ACTIVITY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReleaseNoteSource" AS ENUM ('GENERATED', 'MANUAL');

-- CreateTable
CREATE TABLE "release_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "repository_link_id" UUID,
    "version" TEXT NOT NULL,
    "release_date" DATE NOT NULL,
    "status" "ReleaseNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "period_start" DATE,
    "period_end" DATE,
    "internal_notes" TEXT,
    "client_summary" TEXT,
    "generated_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "release_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_note_items" (
    "id" UUID NOT NULL,
    "release_note_id" UUID NOT NULL,
    "kind" "ReleaseNoteItemKind" NOT NULL,
    "source" "ReleaseNoteSource" NOT NULL DEFAULT 'GENERATED',
    "ref_id" UUID,
    "external_ref" TEXT,
    "identity" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "client_label" TEXT,
    "client_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_note_history" (
    "id" UUID NOT NULL,
    "release_note_id" UUID NOT NULL,
    "from_status" "ReleaseNoteStatus",
    "to_status" "ReleaseNoteStatus" NOT NULL,
    "note" TEXT,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_note_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "release_notes_organization_id_status_idx" ON "release_notes"("organization_id", "status");

-- CreateIndex
CREATE INDEX "release_notes_client_organization_id_status_idx" ON "release_notes"("client_organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "release_notes_project_id_version_key" ON "release_notes"("project_id", "version");

-- CreateIndex
CREATE INDEX "release_note_items_release_note_id_sort_order_idx" ON "release_note_items"("release_note_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "release_note_items_release_note_id_identity_key" ON "release_note_items"("release_note_id", "identity");

-- CreateIndex
CREATE INDEX "release_note_history_release_note_id_created_at_idx" ON "release_note_history"("release_note_id", "created_at");

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_repository_link_id_fkey" FOREIGN KEY ("repository_link_id") REFERENCES "repository_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_note_items" ADD CONSTRAINT "release_note_items_release_note_id_fkey" FOREIGN KEY ("release_note_id") REFERENCES "release_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_note_history" ADD CONSTRAINT "release_note_history_release_note_id_fkey" FOREIGN KEY ("release_note_id") REFERENCES "release_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_note_history" ADD CONSTRAINT "release_note_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security.
--
-- release_notes is dual-scoped: the provider organization owns it and the client organization it
-- is for may see it — but only once PUBLISHED, which the portal service enforces on top of this.
-- RLS decides "whose row is it", not "which workflow state is readable"; keeping those separate
-- means a draft is invisible to the client because the query says so AND because the mapper
-- never runs for it, rather than relying on one of the two.
--
-- Items and history follow their parent, so a client that cannot see the note cannot see its
-- lines or its approval trail either.
--
-- Written out rather than calling the app_rls_enable_* helpers, which the Phase 2 migration drops
-- at the end of itself on purpose.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_notes
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR organization_id = app_tenant_id()
    OR client_organization_id = app_tenant_id()
  );

ALTER TABLE release_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_note_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_note_items
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM release_notes n
      WHERE n.id = release_note_items.release_note_id
        AND (n.organization_id = app_tenant_id() OR n.client_organization_id = app_tenant_id())
    )
  );

-- The approval trail names internal reviewers, so a client never sees it: provider only.
ALTER TABLE release_note_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_note_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON release_note_history
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM release_notes n
      WHERE n.id = release_note_history.release_note_id
        AND n.organization_id = app_tenant_id()
    )
  );
