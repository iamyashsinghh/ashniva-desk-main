# approvals

**Owns:** Requests for a client decision on an update, a milestone, a contract document, a change
request or a file: prepared internally, published, then approved, returned or rejected by the
client.

**Phase:** 2 — implemented. Client UAT requests remain a later phase.

**Entities:** approval_requests, approval_history, files

**Endpoints:** `GET|POST /approvals` · `GET|PATCH /approvals/:id` ·
`POST /approvals/:id/send-to-internal-review|return-to-draft|publish|withdraw` ·
`GET /portal/approvals` · `GET /portal/approvals/:id` ·
`POST /portal/approvals/:id/approve|request-changes|reject`

**Rules:**
- `approval-workflow.ts` owns the transitions and the sides: internal people prepare and publish,
  only client users of the subject's organization decide, and the requester or publisher can never
  decide for the client.
- `approval-subjects.service.ts` resolves the subject (its client, project, contract and label) so
  no caller can attach an approval to something outside its own tenant.
- Other modules react to a decision through `ApprovalTransitionsService.onDecided(subjectType, …)`;
  change requests use it to follow the client's answer.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
