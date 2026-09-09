-- The provider's record of how each client is invoiced.
--
-- A GST tax invoice must carry the recipient's name, address and GSTIN (CGST Rule 46). There was
-- nowhere to hold them: `buildInvoiceSnapshot` read the *client's* own `billing_profiles` row,
-- and that table's policy is `app_tenant_is_provider() AND organization_id = app_tenant_id()`, so
-- a provider asking for a client's row can never be given one. Every B2B invoice went out with an
-- empty "Bill to" block.
--
-- The row is the provider's: `organization_id` is who invoices, `client_organization_id` is who
-- is invoiced. That is what lets ordinary tenant isolation cover it. NO EXISTING POLICY IS
-- ALTERED OR DROPPED BY THIS MIGRATION — the alternative considered and rejected was widening
-- `billing_profiles`, which would have handed one tenant's banking details to another.
--
-- `ON DELETE RESTRICT` on both keys, stated rather than inherited: hard-deleting either
-- organization is refused rather than silently dropping how that client was billed. Organizations
-- are retired with `deleted_at` in practice, so the row stays with them.

-- CreateTable
CREATE TABLE "client_billing_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "gstin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_billing_profiles_client_organization_id_idx" ON "client_billing_profiles"("client_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_billing_profiles_organization_id_client_organization_key" ON "client_billing_profiles"("organization_id", "client_organization_id");

-- AddForeignKey
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "client_billing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_billing_profiles" ADD CONSTRAINT "client_billing_profiles_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
--
-- The same shape `billing_profiles` uses, and for the same reason: this is provider-owned
-- configuration. A client tenant matches neither branch, so it can neither read nor write the
-- record of how it is billed. `organization_id = app_tenant_id()` also keeps one provider out of
-- another's records rather than trusting that there is only ever one provider organization.
--
-- FORCE matters because the migrations run as the table owner, which a plain ENABLE would exempt.
-- Written out rather than calling app_rls_enable_org(), which the Phase 2 migration drops at the
-- end of itself on purpose.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE client_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_billing_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_billing_profiles
  USING (
    app_tenant_id() IS NULL
    OR (app_tenant_is_provider() AND organization_id = app_tenant_id())
  );
