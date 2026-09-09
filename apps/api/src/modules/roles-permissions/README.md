# roles-permissions

**Owns:** The permission catalogue, the nine system roles seeded from `packages/types`, and custom
per-organization roles with their change history.

**Phase:** 1 (read-only matrix) and 2 (custom roles) — implemented. Preview-as remains a later
phase.

**Entities:** roles, permissions, role_permissions, audit_logs

**Endpoints:** `GET|POST /roles` · `GET /roles/permissions` · `GET|PATCH|DELETE /roles/:id` ·
`GET /roles/:id/history` · `POST /users/:id/role`

**Rules:**
- `role-rules.ts` owns them: a custom role starts from a system-role template, may never hold a
  permission its author lacks, a client-audience role is limited to `CLIENT_SAFE_PERMISSIONS`,
  system roles cannot be edited or deleted, and a role with members cannot be deleted.
- Every write needs a fresh password check (`@RequireRecentAuth`) and is audited with before and
  after, so the history screen can show what changed.
- Permissions come back sorted by key, so the editor, the API and diffs are stable.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
