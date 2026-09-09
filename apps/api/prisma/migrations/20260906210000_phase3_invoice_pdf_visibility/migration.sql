-- A client can read the PDF of their own invoice.
--
-- Every other client-visible file hangs off a row that names the client — a ticket, a project, a
-- contract. An invoice PDF does not: the link runs the other way, from `invoices.pdf_file_id`, so
-- the file itself has no parent column and the policy had no branch that could match it. The
-- portal handed a client a file id and `/files/:id/download` answered 404 for their own invoice.
--
-- This replaces the policy with the same one plus that branch. Nothing else about it changes, and
-- nothing is widened beyond invoices: `visibility = 'CLIENT'` still gates the whole clause, and
-- the invoice must be addressed to the tenant asking. Historical PDFs on `invoice_history` are
-- deliberately not included — those are the provider's record of what an invoice used to say.

DROP POLICY IF EXISTS tenant_isolation ON files;

CREATE POLICY tenant_isolation ON files USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR organization_id = app_tenant_id()
  OR (
    visibility = 'CLIENT' AND (
      EXISTS (SELECT 1 FROM tickets t WHERE t.id = files.ticket_id AND t.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = files.project_id AND p.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM tasks k JOIN projects p ON p.id = k.project_id WHERE k.id = files.task_id AND p.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM contracts c WHERE c.id = files.contract_id AND c.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM change_requests r WHERE r.id = files.change_request_id AND r.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM approval_requests a WHERE a.id = files.approval_id AND a.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = files.milestone_id AND p.client_organization_id = app_tenant_id())
      OR EXISTS (SELECT 1 FROM invoices v WHERE v.pdf_file_id = files.id AND v.client_organization_id = app_tenant_id())
    )
  )
);

-- The lookup above is by `pdf_file_id`, which nothing indexed: the column exists for the forward
-- link and every query so far went the other way.
CREATE INDEX IF NOT EXISTS "invoices_pdf_file_id_idx" ON "invoices"("pdf_file_id");
