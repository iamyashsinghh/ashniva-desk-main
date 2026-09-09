# change-requests

**Owns:** Client change requests: numbering, the workflow from draft to completed, the estimate and
impact, the client decision through an approval, and turning an approved request into tasks under a
milestone.

**Phase:** 2 — implemented.

**Entities:** change_requests, change_request_history, comments, files, tasks, milestones,
approval_requests

**Endpoints:** `GET|POST /change-requests` · `GET|PATCH /change-requests/:id` ·
`POST /change-requests/:id/comments` ·
`POST /change-requests/:id/submit|start-internal-review|send-to-client|request-changes|reject|schedule|complete|cancel|reopen-draft|generate-tasks` ·
`GET|POST /portal/change-requests` · `GET|PATCH /portal/change-requests/:id` ·
`POST /portal/change-requests/:id/comments|submit|cancel|approve|request-changes|reject`

**Rules:**
- Transitions and who may make them live in `change-request-workflow.ts`; the detail response
  carries `actions[]` so screens render exactly what the workflow allows.
- Only the client organization decides during client review; sending to the client creates,
  reviews and publishes an approval, and cancelling withdraws it.
- Estimates, cost impact and internal notes are written by staff only; the portal projection drops
  internal notes and internal comments.
- Generated tasks and milestones keep `changeRequestId`, so the work traces back to the request.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
