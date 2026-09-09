-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');

-- CreateEnum
CREATE TYPE "SupplyType" AS ENUM ('INTRA_STATE', 'INTER_STATE', 'EXPORT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceLineSource" AS ENUM ('MANUAL', 'MILESTONE', 'SUPPORT_HOURS', 'CHANGE_REQUEST', 'CONTRACT');

-- CreateTable
CREATE TABLE "billing_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "gstin" TEXT,
    "pan" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "default_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "default_tax_treatment" "TaxTreatment" NOT NULL DEFAULT 'EXCLUSIVE',
    "round_totals" BOOLEAN NOT NULL DEFAULT true,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "sequence_year" TEXT NOT NULL DEFAULT '',
    "financial_year_start_month" INTEGER NOT NULL DEFAULT 4,
    "logo_file_id" UUID,
    "signature_file_id" UUID,
    "bank_details" TEXT,
    "terms" TEXT,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "number_label" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "project_id" UUID,
    "contract_id" UUID,
    "milestone_id" UUID,
    "change_request_id" UUID,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "place_of_supply_state" TEXT NOT NULL,
    "place_of_supply_code" TEXT NOT NULL,
    "supply_type" "SupplyType" NOT NULL DEFAULT 'INTRA_STATE',
    "tax_treatment" "TaxTreatment" NOT NULL DEFAULT 'EXCLUSIVE',
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rounding_adjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_in_words" TEXT,
    "notes" TEXT,
    "internal_notes" TEXT,
    "snapshot" JSONB,
    "pdf_file_id" UUID,
    "issued_by_id" UUID,
    "issued_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "voided_by_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "last_reminder_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsn_sac" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,
    "source" "InvoiceLineSource" NOT NULL DEFAULT 'MANUAL',
    "source_ref_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_tax_breakdowns" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "hsn_sac" TEXT NOT NULL DEFAULT '',
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_tax_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "unallocated_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "notes" TEXT,
    "internal_notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "allocated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_history" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "from_status" "InvoiceStatus",
    "to_status" "InvoiceStatus" NOT NULL,
    "note" TEXT,
    "document_snapshot" JSONB,
    "pdf_file_id" UUID,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "number_label" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "issued_by_id" UUID,
    "issued_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_profiles_organization_id_key" ON "billing_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_due_date_idx" ON "invoices"("organization_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_client_organization_id_status_idx" ON "invoices"("client_organization_id", "status");

-- CreateIndex
CREATE INDEX "invoices_organization_id_issue_date_idx" ON "invoices"("organization_id", "issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_number_label_key" ON "invoices"("organization_id", "number_label");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_position_idx" ON "invoice_line_items"("invoice_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_tax_breakdowns_invoice_id_tax_rate_hsn_sac_key" ON "invoice_tax_breakdowns"("invoice_id", "tax_rate", "hsn_sac");

-- CreateIndex
CREATE INDEX "payments_organization_id_paid_at_idx" ON "payments"("organization_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_client_organization_id_paid_at_idx" ON "payments"("client_organization_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_reference_key" ON "payments"("organization_id", "reference");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_history_invoice_id_created_at_idx" ON "invoice_history"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE INDEX "credit_notes_client_organization_id_status_idx" ON "credit_notes"("client_organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_organization_id_number_label_key" ON "credit_notes"("organization_id", "number_label");

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_signature_file_id_fkey" FOREIGN KEY ("signature_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_tax_breakdowns" ADD CONSTRAINT "invoice_tax_breakdowns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_history" ADD CONSTRAINT "invoice_history_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_history" ADD CONSTRAINT "invoice_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_history" ADD CONSTRAINT "invoice_history_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Money constraints
--
-- Enforced in the database as well as the service. These are financial records: a bug in a
-- future code path must not be able to write a negative invoice total or an allocation that
-- exceeds its payment.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE invoices
  ADD CONSTRAINT invoices_amounts_non_negative
    CHECK (subtotal >= 0 AND taxable_value >= 0 AND tax_total >= 0 AND total >= 0
           AND amount_paid >= 0 AND discount_total >= 0),
  ADD CONSTRAINT invoices_balance_matches
    CHECK (balance_due = total - amount_paid),
  ADD CONSTRAINT invoices_due_after_issue
    CHECK (due_date >= issue_date);

ALTER TABLE invoice_line_items
  ADD CONSTRAINT invoice_line_items_positive
    CHECK (quantity > 0 AND unit_price >= 0 AND taxable_value >= 0 AND discount_amount >= 0),
  ADD CONSTRAINT invoice_line_items_tax_rate_sane
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  ADD CONSTRAINT invoice_line_items_discount_percent_sane
    CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive
    CHECK (amount > 0),
  -- Cannot leave more unapplied than was received, nor apply more than was received.
  ADD CONSTRAINT payments_unallocated_within_amount
    CHECK (unallocated_amount >= 0 AND unallocated_amount <= amount);

ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_amount_positive
    CHECK (amount > 0);

ALTER TABLE credit_notes
  ADD CONSTRAINT credit_notes_amounts_non_negative
    CHECK (taxable_value >= 0 AND total >= 0);

ALTER TABLE billing_profiles
  ADD CONSTRAINT billing_profiles_sequence_positive
    CHECK (next_sequence >= 1),
  ADD CONSTRAINT billing_profiles_fy_month_valid
    CHECK (financial_year_start_month BETWEEN 1 AND 12);

-- ---------------------------------------------------------------------------------------------
-- Row-level security
--
-- Invoices, payments and credit notes are dual-scoped: the provider that raised them, and the
-- client they are addressed to — a client must be able to read its own invoices in the portal.
--
-- The billing profile, the invoice history and the internal tax breakdown are provider-only.
-- The profile holds the supplier's own banking details; the history holds internal notes and
-- superseded financial snapshots.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_profiles
  USING (
    app_tenant_id() IS NULL
    OR (app_tenant_is_provider() AND organization_id = app_tenant_id())
  );

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR client_organization_id = app_tenant_id()
  );

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_line_items
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.client_organization_id = app_tenant_id()
    )
  );

ALTER TABLE invoice_tax_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_tax_breakdowns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_tax_breakdowns
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_tax_breakdowns.invoice_id
        AND i.client_organization_id = app_tenant_id()
    )
  );

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR client_organization_id = app_tenant_id()
  );

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_allocations
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payment_allocations.invoice_id
        AND i.client_organization_id = app_tenant_id()
    )
  );

-- Provider only: the trail carries internal notes and superseded financial documents.
ALTER TABLE invoice_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_history
  USING (
    app_tenant_id() IS NULL
    OR (
      app_tenant_is_provider()
      AND EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.id = invoice_history.invoice_id AND i.organization_id = app_tenant_id()
      )
    )
  );

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_notes
  USING (
    app_tenant_id() IS NULL
    OR app_tenant_is_provider()
    OR client_organization_id = app_tenant_id()
  );
