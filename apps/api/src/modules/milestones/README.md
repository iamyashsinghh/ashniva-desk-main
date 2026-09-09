# milestones

**Owns:** Delivery milestones and their deliverables: dates, owner, dependencies, progress, client
visibility and client sign-off.

**Phase:** 2 — implemented.

**Entities:** milestones, milestone_deliverables, milestone_dependencies, milestone_history

**Endpoints:** `GET|POST /milestones` · `GET|PATCH|DELETE /milestones/:id` ·
`POST /milestones/:id/status|progress` · `POST /milestones/:id/deliverables` ·
`PATCH /milestones/:id/deliverables/:deliverableId` · `GET /portal/milestones`

**Rules:**
- `milestone-progress.service.ts` recomputes progress from the deliverables and the linked tasks;
  a manual override switches the mode and needs a reason, which lands in the history and the audit
  log.
- `milestone-dependencies.ts` refuses a dependency that would create a cycle.
- Only client-visible milestones reach the portal, and sign-off goes through an approval request.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
