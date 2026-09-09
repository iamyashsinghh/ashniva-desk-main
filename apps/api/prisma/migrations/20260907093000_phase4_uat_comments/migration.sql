-- The conversation attached to a UAT sign-off.
--
-- `POST /portal/uat/:id/comments` is in the API plan, and a client who asks a question before
-- approving needs somewhere for the answer to live. `from_client` is stored rather than derived
-- from the author's organization: memberships change, and a transcript that re-attributes itself
-- later is worse than none.
--
-- Row-level security scopes it through the parent request, so a comment cannot be visible when
-- the sign-off it belongs to is not.
-- CreateTable
CREATE TABLE "uat_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uat_request_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "from_client" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uat_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uat_comments_uat_request_id_created_at_idx" ON "uat_comments"("uat_request_id", "created_at");

-- AddForeignKey
ALTER TABLE "uat_comments" ADD CONSTRAINT "uat_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_comments" ADD CONSTRAINT "uat_comments_uat_request_id_fkey" FOREIGN KEY ("uat_request_id") REFERENCES "uat_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uat_comments" ADD CONSTRAINT "uat_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE uat_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON uat_comments
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM uat_requests r
      WHERE r.id = uat_comments.uat_request_id
        AND r.client_organization_id = app_tenant_id()
    )
  );
