# projects

**Owns:** Projects of every type (internal, fixed price, monthly, AMC, dedicated, support-only), members, modules, progress rollup, client summary, release policy and test environments.

**Planned phase:** Phase 1 (order 3)

**Entities:** projects, project_members, project_modules, project_release_policy, test_environments

**Endpoints:** GET|POST /projects · GET|PATCH /projects/:id · GET /projects/:id/plan · POST /projects/:id/members · GET /projects/:id/summary · GET|POST /projects/:id/environments

**Rules:**
- Progress and health are derived, never stored: `projects.mapper.ts` computes them from the task
  counts, and `project-plan.service.ts` reuses the same function so the plan cannot disagree with
  the row it was opened from.
- The plan (`project-plan.*`) is milestones plus the work grouped under them, on a calendar.
  There is no plan table — it is read from projects, milestones, deliverables and tasks. The
  client portal builds its own copy from the same service through an allow-list mapper.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
