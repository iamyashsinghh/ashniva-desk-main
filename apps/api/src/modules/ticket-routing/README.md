# ticket-routing

**Owns:** Automatic routing of support tickets to the responsible or on-call developer, the
acknowledgement and escalation timers, manual reassignment, and the decision trail that explains
every one of those.

**Phase:** delivered in package 8b. Reads what package 8a configures and never writes it.

**Entities:** `ticket_routing_state`, `ticket_routing_trail` (+ two policy columns on
`support_ownership`)

## The chain

`module owner → primary developer → on call (and their backup) → backup developer`

That order is the architecture's, not an invention: it is what the Phase 0 stub declared, what
`product-requirements.md` row 5 states, and what the design conversation describes. It is
deliberately **not** "most senior first" — a ticket about billing should reach whoever owns
billing before it reaches anybody's manager.

Senior and support executive are not in the first pass. They are where **escalation** goes:
`backup → senior → support executive`, at most three levels, after which the ticket stops moving
and everybody who manages routing is told instead.

## Where the judgement lives

In `planRouting` in `packages/types/src/workflow/ticket-routing.ts` — pure, and unit-tested
against every branch. This module gathers facts, claims the right to act, applies the outcome and
writes it down; it decides nothing itself. That separation is what makes the decision testable
without a database.

Per candidate the checks run cheapest-and-most-decisive first, so the reason recorded is the
*first* thing that disqualified somebody. Somebody who left the project is reported as having left
it, not as being outside working hours.

## Files

| File | Responsibility |
| --- | --- |
| `routing-candidates.service.ts` | Turns 8a's configuration into the ordered candidate list, in a fixed number of queries |
| `ticket-routing.service.ts` | Route, assign, queue, acknowledge |
| `routing-escalation.service.ts` | The timers' actions, and manual reassignment |
| `routing-monitor.service.ts` · `.processor.ts` | The sweep, and the queued single-ticket job |
| `routing-query.service.ts` | Reading state and trail back, with the permission split |
| `ticket-routing.repository.ts` | The two tables, plus the workload counts |

## Two clocks that are not the same clock

- **Acknowledgement** (`ackMinutes`, default 15) asks *did anybody pick this up*. Missing it
  re-routes to the next candidate.
- **Escalation** (`escalationMinutes`, default 30, measured from the acknowledgement deadline)
  asks *is this going anywhere*. Missing it moves the ticket up a level.
- **SLA response and resolution** are a different thing entirely, owned by `sla-escalations`, and
  measured against what the *client* was promised. Nothing here touches them.

## Workload

Defined once, in `packages/types/src/workflow/support-workload.ts`:

> **Active workload = open tickets assigned to the person + tasks they have actually started.**

Started, not merely planned: DRAFT, ASSIGNED and BLOCKED tasks do not count, because a groomed
backlog is not load and blocked work is not work. Nothing closed ever counts. A null or zero limit
means no ceiling rather than no capacity.

## Concurrency

Every write that could race is a conditional update, and the loser stands down rather than
guessing:

- **Two routers at once** — `claimAttempt` moves the attempt counter from *n* to *n+1*; exactly
  one update matches. Two assignees is worse than none.
- **Acknowledgement against the escalation sweep** — the acknowledge update is conditional on
  `acknowledgedAt IS NULL`.
- **A manual assignment against the router** — `manualOverrideAt` is a stop sign the router reads
  first. Only an explicit forced re-route clears it.

## Who may see what

`support-routing:manage` (Super Admin, Project Manager, Team Lead) reads the **trail** and re-runs
the router. `ticket:reassign` assigns by hand. The assignee needs no permission to acknowledge —
the service checks they are the assignee. A client reaches none of it at any URL: the trail names
colleagues and their availability, and there is no client-facing shape of that data at all.

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
