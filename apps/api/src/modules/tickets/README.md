# tickets

**Owns:** Ticket numbering, the ticket workflow, public/internal replies, convert-to-tasks, resolve/close/reopen, SLA policies and the client portal ticket views.

**Planned phase:** Phase 1 (order 5)

**Entities:** tickets, sla_policies, comments (entity TICKET), ticket_assignments

**Endpoints:** GET /tickets?view=open|new|mine|waiting|critical|sla-at-risk|sla-breached|resolved|all (plus a `resolvedToday=true` filter, so the dashboard SLA and resolution cards open exactly what they counted) · POST /tickets · GET|PATCH /tickets/:id · POST /tickets/:id/{assign,status,accept,start,escalate,reassign,convert-to-tasks,resolve,reopen} · GET|POST /tickets/:id/replies · GET /portal/tickets

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
