-- Product registry and external support ingress (package 8c).
--
-- Additive throughout: four new tables, one enum, three nullable columns on `tickets`. Nothing
-- is dropped and nothing is rewritten, so a populated installation upgrades by gaining rows it
-- did not have. Every existing ticket keeps a null `product_id`, which is exactly right: it did
-- not come through a product.
--
-- `product_credentials` stores a hash, not ciphertext. Nothing in the product ever needs to read
-- a machine secret back, so nothing should be able to — the only operation is verification, and
-- the only recovery from a lost secret is rotation.
--
-- The unique constraint on (product_id, idempotency_key) is not an optimisation: it is the
-- mechanism that makes a retried ingress request produce one ticket instead of two.

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('BASIC', 'STANDARD', 'PRIORITY', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "external_reference" TEXT,
ADD COLUMN     "external_requester_id" UUID,
ADD COLUMN     "product_id" UUID;

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "project_id" UUID,
    "support_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_route_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ivr_enabled" BOOLEAN NOT NULL DEFAULT false,
    "support_tier" "SupportTier" NOT NULL DEFAULT 'STANDARD',
    "allowed_sources" "TicketSource"[],
    "allowed_work_areas" TEXT[],
    "default_priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "default_type" "TicketType" NOT NULL DEFAULT 'SUPPORT',
    "support_requester_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "key_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_requesters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_requesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ingress_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "ticket_id" UUID NOT NULL,
    "credential_key_id" TEXT,
    "external_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ingress_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_is_active_idx" ON "products"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_code_key" ON "products"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_credentials_key_id_key" ON "product_credentials"("key_id");

-- CreateIndex
CREATE INDEX "product_credentials_product_id_is_active_idx" ON "product_credentials"("product_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "external_requesters_product_id_external_id_key" ON "external_requesters"("product_id", "external_id");

-- CreateIndex
CREATE INDEX "support_ingress_requests_organization_id_created_at_idx" ON "support_ingress_requests"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_ingress_requests_product_id_idempotency_key_key" ON "support_ingress_requests"("product_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_external_requester_id_fkey" FOREIGN KEY ("external_requester_id") REFERENCES "external_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_support_requester_id_fkey" FOREIGN KEY ("support_requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_credentials" ADD CONSTRAINT "product_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_credentials" ADD CONSTRAINT "product_credentials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_credentials" ADD CONSTRAINT "product_credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_requesters" ADD CONSTRAINT "external_requesters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_requesters" ADD CONSTRAINT "external_requesters_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ingress_requests" ADD CONSTRAINT "support_ingress_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ingress_requests" ADD CONSTRAINT "support_ingress_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ingress_requests" ADD CONSTRAINT "support_ingress_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
--
-- All four tables are provider-internal. A product's support configuration, its credentials and
-- the reporters behind its tickets are Ashniva's operational data, not a client tenant's, so the
-- policy is the provider-only shape with no `= app_tenant_id()` branch to widen later. The same
-- decision `support_ownership` and the routing tables made, for the same reason.
--
-- FORCE matters: without it the policies do not apply to the table owner, which is the role the
-- application connects as. `app_tenant_id() IS NULL` keeps the ingress path working, since a
-- machine credential establishes a product rather than a tenant session.

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE product_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_credentials
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE external_requesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_requesters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON external_requesters
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE support_ingress_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ingress_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_ingress_requests
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
