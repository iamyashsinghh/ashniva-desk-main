# client-updates

**Owns:** Client-visible updates drafted automatically from completed client-visible tasks, approved and published by a senior/PM into the client's 'Completed Today'.

**Planned phase:** Phase 1 (order 4)

**Entities:** client_updates

**Endpoints:** GET /client-updates?status&date · PATCH /client-updates/:id · POST /client-updates/:id/publish · POST /client-updates/:id/reject · GET /portal/projects/:id/updates

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
