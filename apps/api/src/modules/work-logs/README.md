# work-logs

**Owns:** Time entries derived from task completion and manual logging; work kind (development, management, testing, support) feeds reports and contract hour ledgers.

**Planned phase:** Phase 1 (order 4)

**Entities:** work_logs

**Endpoints:** GET /work-logs?user&from&to · POST /work-logs · PATCH|DELETE /work-logs/:id

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
