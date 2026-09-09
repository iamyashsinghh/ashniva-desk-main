# audit-logs

**Owns:** the append-only `audit_logs` table and the two ways of writing to it:

- `@Audited({ action, entityType })` on a controller handler → `AuditInterceptor` records one entry
  after success (actor, organization, request id, ip, user agent, result).
- `AuditLogService.record()` from a service for fine-grained entries with `before` / `after`.

**Must be audited (Architecture Plan §18):** task status changes, credential generate/reveal/rotate,
QA results, approvals, deployments, publishes, rollbacks, check overrides, preview-as sessions,
ticket assignment / acknowledgement / escalation / reassignment, emergency-fix approvals.

**Phase 1:** `GET /audit-logs?entity&actor&from&to` (permission `audit-log:read`) and the admin
"Audit log" screen with detail view.
