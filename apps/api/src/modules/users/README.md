# users

**Owns:** User profiles, invitations, activation/suspension and per-user settings (show Development section, default view, timezone).

**Planned phase:** Phase 1 (order 2)

**Entities:** users, user_settings

**Endpoints:** GET|POST /users · PATCH /users/:id · POST /users/:id/roles · PATCH /admin/users/:id/settings · PATCH /users/:id/availability

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
