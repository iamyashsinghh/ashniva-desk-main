-- The invoice branch of the files policy needs a status, like every other client-visible path.
--
-- `20260906210000` added the branch so a client could download their own invoice, and matched on
-- the link alone: `invoices.pdf_file_id = files.id AND client_organization_id = app_tenant_id()`.
-- The link is not authority to read. An invoice keeps its row when it is cancelled and keeps its
-- link when it is soft-deleted, and `findForClient` refuses both — so the policy was wider than
-- the module's own definition of what a client may see.
--
-- `CLIENT_VISIBLE_INVOICE_STATUSES` in packages/types is the definition, and this is it in SQL.
-- VOID is deliberately in the set: voiding keeps the number in use precisely because the client
-- relied on the document, and the portal still lists a void invoice and still hands out its file
-- id. Excluding it here would make the portal offer a download that 404s.
--
-- Nulling `pdf_file_id` when an invoice is cancelled stays where it is. It is now the second
-- line rather than the only one, and it does nothing for a row cancelled before that code shipped.

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
      OR EXISTS (
        SELECT 1 FROM invoices v
        WHERE v.pdf_file_id = files.id
          AND v.client_organization_id = app_tenant_id()
          AND v.deleted_at IS NULL
          AND v.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID')
      )
    )
  )
);
