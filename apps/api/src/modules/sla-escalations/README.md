# sla-escalations

**Owns:** SLA policies, the first-response and resolution clocks of every ticket, and the monitor
job that raises warnings and breaches.

**Phase:** 2 — implemented. Escalation to on-call and routing rules remain a later phase.

**Entities:** sla_policies, sla_policy_rules, ticket_sla, sla_events

**Endpoints:** `GET|POST /sla/policies` · `GET|PATCH|DELETE /sla/policies/:id` ·
`GET /sla/tickets/:ticketId/events` · `POST /sla/monitor/run`

**Rules:**
- `business-hours.ts` does all date arithmetic in the policy's timezone, over its working days and
  hours; `sla-clock.ts` turns elapsed business minutes into targets and states. The browser never
  computes SLA state — it renders what the API returns.
- `ticket-sla.service.ts` starts the clocks when a ticket is raised, pauses them while it waits for
  the client, resumes on a client reply, records the first public reply and stops on resolution.
  Entry points run inside `TenantContextService.runAsSystem()` so a client's action can read the
  provider's policies.
- Policy precedence is project → client → default, and a scope may hold only one policy.
- `sla-monitor.service.ts` runs every two minutes; a partial unique index on the event kind means a
  warning or breach can be recorded, notified and audited only once per ticket.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.

`sla-ticket-filter.ts` holds the one definition of "at risk" and "breached" as a Prisma
where-clause; the dashboards count with it and `GET /tickets?view=sla-at-risk|sla-breached` lists
with it, so the KPI and its destination cannot drift.
