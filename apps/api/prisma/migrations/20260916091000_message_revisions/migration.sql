-- What a message said before somebody edited it.
--
-- The edit window is short but not zero, so a colleague may already have read the words being
-- replaced. Keeping the previous body means an edit cannot quietly rewrite what somebody relied
-- on. It lives here rather than in the audit log because a message body has no business in an
-- audit payload, and a revision belongs under the same tenancy, the same row-level policy and the
-- same retention as the row it supersedes.

-- CreateTable
CREATE TABLE "message_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "edited_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_revisions_message_id_created_at_idx" ON "message_revisions"("message_id", "created_at");

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_edited_by_id_fkey" FOREIGN KEY ("edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, the same provider-only shape the rest of package 9b uses: there is no
-- `= app_tenant_id()` branch, because a message revision belongs to the provider organization and
-- no client tenant may ever match it.
ALTER TABLE message_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON message_revisions
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
