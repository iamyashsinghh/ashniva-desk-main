# releases

**Owns:** Releases: version, included tasks/tickets/PRs, approvals per project policy, scheduling, typed-version publish confirmation, deployment result, rollback, live-verification assignment, release notes (internal and client).

**Planned phase:** Phase 2 (order 6)

**Entities:** releases, release_items, release_approvals, project_release_policy

**Endpoints:** GET|POST /releases · GET|PATCH /releases/:id · POST /releases/:id/{items,request-approval,approve,schedule,publish,verify-live,rollback}

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
