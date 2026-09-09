# Operational flow — gap analysis and revised package order

This document maps the required end-to-end operational flow (internal projects, client projects,
central support, IVR) against what Ashniva Desk actually implements today, and reorganises the
remaining implementation packages accordingly.

It exists because the requirement is not a new module. It is the demand that Ticket, Task, QA,
Client Project and Support stop behaving as five separate systems — which is a statement about
*connections*, and most of the connections are already specified somewhere in this repository and
simply not built.

## 1. What the specification already anticipated

Three findings shaped the whole plan.

**The smart-support routing engine is already specified and already stubbed.** Architecture Plan
§19.1 defines the routing chain — identify client → product/project → module → type → priority →
version → contract/SLA, then module developer → primary support developer → on-call developer →
backup, *skipping anyone on leave, outside working hours or at their workload limit*, with other
ticket types going to a support queue. `apps/api/src/modules/ticket-routing/` and
`apps/api/src/modules/on-call/` exist as stub modules whose READMEs name the entities
(`support_ownership`, `on_call_schedule`, `user_availability`) and endpoints. `ticket-routing.types.ts`
already declares `RoutingDecision.trail` with the skip reasons `ON_LEAVE | OUT_OF_HOURS |
AT_WORKLOAD_LIMIT`. None of it is implemented.

**The three dead ticket statuses belong to exactly this work.** `AUTO_ASSIGNED`, `ACKNOWLEDGED` and
`ESCALATED` have empty transition arrays and a comment saying they are "reserved for the
smart-support routing of Phase 2b". §19.1 gives them their transitions and their escalation ladder
(ack timer, L1 → backup, L2 → senior/PM). They should be activated by the routing package and by
nothing else.

**The support entry point already has its enum value.** `TICKET_SOURCE` includes `API` and `IVR`
alongside `PORTAL`, `MOBILE`, `INTERNAL`, `EMAIL` and `WHATSAPP`. A widget or SDK raising a ticket
from another Ashniva product is `source: API`; an IVR-raised one is `source: IVR`. No new vocabulary
is required, only the authenticated entry point.

The conclusion is that very little of the requirement is genuinely new scope. Most of it is
**package 5 ("Tickets and automatic developer assignment") delivered only in part**, plus package 8
(IVR) and package 10 (client portal), plus a small number of genuinely new fields.

## 2. Requirement → status map

`Complete` · `Partial` · `Missing` · `Planned (package n)`

### A. Internal software development projects

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| A.1 | Project created by manager/super admin | **Complete** | `POST /projects`, `project:manage` |
| A.1 | Assign TL / developers / testers / manager to a project | **Complete** | `PUT /projects/:id/members`, `ProjectMember.role`, `PROJECT_MEMBER_ROLE` (MANAGER, LEAD, DEVELOPER, TESTER, SUPPORT, CLIENT_CONTACT), editor on `/projects/:id` |
| A.1 | Per-developer responsibility (frontend, backend, mobile, API, database, DevOps, full stack), multiple per person, not hard-coded | **Missing** | `ProjectMember` has `role` only |
| A.2 | Create today's / future task | **Partial** | Tasks exist with `dueDate` (a *date*, no time); no scheduled start |
| A.2 | Scheduled task | **Missing** | no `scheduledStartAt` |
| A.2 | Recurring task | **Missing** | no recurrence model |
| A.2 | Assign to one developer | **Complete** | `Task.assignedToId` |
| A.2 | Assign to multiple developers | **Missing** | single-valued column |
| A.2 | Task carries project, priority, description, attachments, estimate | **Complete** | `projectId`, `priority`, `description`, `File`, `estimateMinutes` |
| A.2 | Task carries work area / responsibility | **Missing** | — |
| A.2 | Expected start and completion date **and time** | **Partial** | `dueDate` is date-only |
| A.2 | Dependencies | **Missing** | — |
| A.3 | Scheduled task stays upcoming, then becomes actionable automatically | **Missing** | — |
| A.4 | Track assigned time, actual start, completion, work logs, comments, evidence, status history | **Complete** | `createdAt`, `startedAt`, `submittedAt`, `completedAt`, `WorkLog`, `Comment`, `File`, `TaskStatusHistory` |
| A.4 | Blockers / pauses | **Partial** | `BLOCKED` status exists; no paused-duration accounting |
| A.4 | TL / manager / super admin can see the history | **Complete** | task detail + `/admin/audit` |
| A.5 | On-time / delayed indicator, estimated vs actual duration, delay amount | **Missing** | data exists, computation and display do not |
| A.6 | Developer submits → QA assignment → tester PASS/FAIL/CLARIFICATION | **Partial** | full QA API and tester screens exist (Phase 4); **no UI creates the QA assignment** |
| A.6 | FAIL returns to developer with reason and evidence | **Complete** | `QaFailureEffectsService` |
| A.6 | Rework → resubmit → retest | **Partial** | task side works; a retest needs a new assignment, which has no UI |
| A.6 | PASS moves forward in the release workflow | **Partial** | feeds the release `qa` gate; does not move the task |

### B. External client projects

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| B.0 | Same engine as internal projects | **Complete** | one `Project` model; `clientOrganizationId` is the only difference |
| B.1 | Same team assignment | **Complete** | as A.1 |
| B.2 | Client sees only their own project | **Complete** | portal controllers, allow-list mappers, RLS |
| B.2 | Client cannot see internal notes, staff performance, other clients, credentials | **Complete** | `Visibility`, portal DTOs, `test_accounts` has no client RLS branch |
| B.3 | Daily client progress from real task/work-log data | **Partial** | `ClientUpdate` is generated on task approval; there is **no portal "Today" screen** |
| B.4 | Client project dashboard: progress, completed, in progress, QA/release, UAT | **Partial** | portal project detail + `/portal/uat` exist; no consolidated progress view |

### C. Central support system

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| C.1 | Other products raise tickets through a clean API/SDK/widget | **Missing** | `TICKET_SOURCE.API` exists; no authenticated machine entry point |
| C.1 | Ticket identifies organization, product, module, user, category, priority, description, files | **Partial** | organization, module, category, priority, description, files exist; **no `Product` model** |
| C.2 | Smart developer assignment by project → responsibility → availability | **Missing** | **Planned (package 5)**, stubbed, specified in §19.1 |
| C.2 | Queue / escalation / fallback when nobody is eligible, with traceability | **Missing** | `RoutingDecision.trail` is declared and unused |
| C.3 | Developer working hours (days, shift, timezone) | **Missing** | **Planned (package 5)**, `support_ownership.working_hours jsonb` in §19.3 |
| C.4 | Receive login/logout/availability from Ashniva HR without coupling | **Missing** | `user_availability` specified in §19.3 |
| C.5 | Ticket visible to developer, TL, manager, super admin; client sees client-safe view | **Complete** | ticket workflow + portal ticket DTOs |
| C.6 | Lifecycle including AUTO_ASSIGNED / ACKNOWLEDGED / ESCALATED | **Missing** | statuses exist with **no transitions**; §19.1 defines them |
| C.7 | Ticket → Task, ticket stays linked, detail shows developer/tasks/QA/progress/resolution | **Partial** | `POST /tickets/:id/convert` creates linked tasks and the detail lists them; QA and progress are not surfaced there |

### D. IVR support integration

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| D.1 | Per-product IVR toggle | **Complete** | `Product.ivrEnabled` (8c) plus `product_ivr_policies` — tiers, recording, playback scope, fallback, attempt ceiling |
| D.2 | Call from a support ticket | **Complete** | `POST /tickets/:id/calls`; `GET …/calls/availability` says why not, when not |
| D.3 | Routing reuse | **Complete** | `CallRoutingService` calls package 8b's own `build`, `escalationCandidates`, `planRouting` and `availabilityOf`; the one rule added — ring the ticket's owner first — is `planCallTarget` in `packages/types` |
| D.4 | Recording reference | **Complete** | `call_logs.recording_ref` + `recording_ready_at`; no audio is stored, and playback mints a short-lived URL from the adapter |
| D.5 | Recording permissions | **Complete** | `call:play-recording`, separate from `call:read-internal` and from `ticket:read`, plus the product's `recordingPlaybackScope`; decided by `canPlayRecording` in `packages/types`, enforced server-side, and audited on every access **and every refusal** |
| D.6 | Fallback when nobody answers | **Complete** | every attempt kept in `call_attempts`; the ladder is bounded three ways and ends in the support queue with a stated reason and a notification |

A support call is never dropped in silence: `CallMonitorProcessor` sweeps calls the provider never
reported on, so a lost callback ends the same way a real `no_answer` does.

### E–G. Roles, SLA separation, audit

| # | Requirement | Status |
| --- | --- | --- |
| E | Developer / tester / TL / manager / super admin / client visibility | **Complete** — 76 permissions, custom roles, RLS, portal allow-lists |
| F | SLA (tickets) kept separate from task timing | **Complete for SLA**; task timing is the missing half (A.5) |
| G | Audit of who/what/when/from/to | **Complete** for existing actions; new actions need their own entries |

## 3. What this changes about the package order

The original order put IVR at 8 and the client portal at 10, with routing inside 5. The requirement
makes the support chain the centre of the product, so the remaining work is re-cut into packages
that each close one loop end to end rather than one layer across many loops.

| New package | Contents | Was |
| --- | --- | --- |
| **6** | Testing, staging and release workflow | unchanged (delivered, PR #18) |
| **7a** | **Project responsibilities and task scheduling/timing** — `ProjectMember.responsibilities`, task work areas, scheduled start, expected completion time, on-time/delayed computation, upcoming queue | new; the data layer every later package reads |
| **7b** | **Operational dashboards** — developer queue with timing, TL/manager views | part of 4 and 5 |
| **7c** | **Client daily progress** — portal Today, project progress view | part of 10 |
| **8a** | **Support ownership, working hours and availability** — `support_ownership`, `on_call_schedule`, `user_availability`, HR availability intake | part of 5 |
| **8b** | **Routing engine and support lifecycle** — the §19.1 chain, `AUTO_ASSIGNED`/`ACKNOWLEDGED`/`ESCALATED`, ack timers, escalation, reassignment reasons | part of 5 |
| **8c** | **Product registry and support ingress** — `Product`, machine credentials, `POST /support/tickets` (delivered; the embedded widget itself remains for a later package) | part of 3 and 5 |
| **9** | **IVR** — per-product enablement, call from ticket, routing reuse, recording reference and permissions (delivered) | was 8 |
| **9b** | **Project-scoped internal communication** — project/task/ticket/direct chat, calling through Ashniva IVR, recording references and their visibility, super-admin oversight (delivered) — see `internal-communication-plan.md` | new |
| **10** | GitHub integration | was 7 |
| **11** | Recurring issues, incidents, RCA | was 9 |
| **12** | Mobile | was 13 |

Packages 11 (contracts/SLA reporting) and 12 (notifications) of the original list are already
delivered and are dropped from the remaining order.

**Why 7a comes first.** Routing cannot pick "the developer responsible for this area" until a
responsibility exists to match on, and no dashboard can show a delay until scheduled and actual
times are both recorded. 7a is the smallest change that unblocks 7b, 7c and 8b, so it is built
first even though the requirement lists routing as more important.

## 4. Design decisions taken in 7a

**Responsibilities are free-form tags with a suggested vocabulary, not an enum.** The requirement
says not to hard-code the list if the architecture allows configuration. A Postgres `text[]` on
`project_members` lets a manager record `["Frontend", "API"]` for one person without an admin CRUD
screen or a migration per new area, and `WORK_AREAS` in `packages/types` supplies the suggestions
the UI offers. Statuses and permissions stay enums because the API branches on them; a
responsibility is data the routing engine matches on, not a branch.

**A scheduled task is a predicate, not a status.** `TASK_STATUS` gains nothing. A task whose
`scheduledStartAt` is in the future is filtered out of the developer's working queue and into an
`upcoming` view, and the workflow refuses `start` before that time. Making it a status would have
required a background job to flip every task at its appointed minute — a job that can lag, fail, or
double-fire, and that would rewrite Phase 1 task history. A predicate is evaluated at read time, so
it is never stale and there is nothing to reconcile. The notification when a task becomes due is a
separate, best-effort concern; if it does not fire, the task is still in the queue.

**Timing is computed, never stored.** On-time/delayed is derived from `dueAt` and `completedAt` on
read. Storing a verdict would let it disagree with the timestamps it came from.

## 5. Design decisions taken in 8a

**Three records, not one.** `UserWorkSchedule`, `UserAvailability` and `OnCallSchedule` are separate
tables because they change on completely different clocks: a rota when somebody's contract changes,
an availability state many times a day and mostly from outside Desk, on-call cover per date. One
table would have made every attendance ping rewrite the project's support configuration, and it
would have lost the distinction the router has to explain. Somebody can be inside their hours and on
leave; outside their hours and on call; available and at their limit.

**The effective answer is computed, never stored.** `resolveAvailability` in `packages/types` folds
the stored state, the rota and today's cover into one verdict plus a reason drawn from the router's
own vocabulary — `ON_LEAVE`, `OUT_OF_HOURS`, `AT_WORKLOAD_LIMIT`. A stored `AVAILABLE` from this
morning does not survive a shift that ended at 18:30. Storing the verdict would let it disagree with
the facts it came from, and it would need a job to refresh it every minute of every rota boundary.

**Clock times in a named zone, not instants.** A shift is "09:30 in Asia/Kolkata", evaluated with
`Intl` at read time. An offset would be wrong twice a year wherever daylight saving applies, and a
UTC instant would drift against the working day it is supposed to describe. A shift whose end is
before its start is an overnight one, and its small hours belong to the day it started.

**HR pushes; Desk never pulls.** `PATCH /users/:id/availability` is the entire contract between
Ashniva HR and Desk. HR decides what attendance means and pushes the fact with `source: HR`; Desk
stores it and resolves it against the rota. Neither system reads the other's database, so HR can
change how it decides attendance without Desk knowing, and Desk keeps working when HR goes quiet.

**No new permission.** `support-routing:manage` already ships in
`20260906200000_phase3_permissions` with grants to Super Admin, Project Manager and Team Lead, so
8a adds no permission migration and has no seed dependency. A developer holds none of it and reads
their own rota through `GET /me/work-schedule`, which returns the schedule alone — no team, no
ownership, no other person's availability.

**Routing is not in 8a.** The chain of §19.1 belongs to 8b. What 8a delivers is everything 8b needs
to read, and the resolver it will call to explain each skip.

## 6. Design decisions taken in 8b

**The chain is the architecture's, not the obvious one.** Module owner → primary → on-call →
backup, with senior and support executive reached only by escalation. A "most senior first" order
would be easier to explain and wrong: a ticket about billing should reach whoever owns billing
before it reaches anybody's manager.

**Only the module owner is tested against the work area.** The rest of the chain is the fallback
*for* the case where nobody owns the area, so applying the same test there would empty the chain
exactly when it is most needed.

**The decision is pure; the plumbing is not.** `planRouting` in `packages/types` takes a prepared
candidate list and returns the outcome plus a full trail. The API gathers facts, claims the right
to act, applies the result and writes it down. Keeping the judgement out of the service is what
makes every branch testable without a database.

**Every candidate produces a trail row, including the ones nobody configured.** A role with no
owner records `NOT_CONFIGURED` rather than being passed over silently, so a gap in the
configuration is visible instead of invisible.

**Routing is a queued job, not part of raising a ticket.** It reads five tables and dispatches
notifications; none of that belongs in the latency a client sees when reporting a problem, and a
router that failed would otherwise fail the raise. The ticket exists whether or not anybody can be
found to take it — which is the entire point of the support queue.

**Three timers, and they are not the same timer.** Acknowledgement (`ackMinutes`) asks whether
anybody picked the ticket up. Escalation (`escalationMinutes`, measured from the acknowledgement
deadline) asks whether it is going anywhere. SLA response and resolution are a different thing
altogether, owned by `sla-escalations` and measured against what the client was promised. 8b does
not touch them.

**A person's decision outranks the router's.** A manual assignment sets `manualOverrideAt`, which
the router reads as a stop sign before doing anything. Only an explicit forced re-route clears it,
and only somebody who could have assigned in the first place can ask for that.

**The reserved statuses are now live.** `AUTO_ASSIGNED`, `ACKNOWLEDGED` and `ESCALATED` had empty
transition arrays since Phase 1. They now carry the automatic path, which rejoins the manual one
at `IN_PROGRESS`. A ticket a person assigned is still `ASSIGNED` — that distinction is what tells
a manager whether the router chose the assignee or somebody did.

## 7. Design decisions taken in 8c

**A product points at a project; it does not restate one.** The team, the ownership chain and the
rotas live on the project, and the registry holds only what the *ingress* has to decide: whether
support is open, which sources and work areas are allowed, and what a ticket defaults to. A second
copy of the team would give the router two places to look.

**Nothing about where a ticket goes comes from the request.** Organization, project, client
organization and both policies are read from the product the credential resolved to. The DTO has
no field for any of them, and `forbidNonWhitelisted` turns an attempt to send one into a 400 —
so escaping the registered scope fails at the door rather than deeper in.

**Machine secrets are hashed, not encrypted.** `test_accounts` stores ciphertext because a tester
has to read a password back; nothing in Desk ever needs to read a machine secret, so there is
nothing reversible to steal. The consequence is accepted deliberately: a lost secret is rotated,
never recovered.

**One transaction is the idempotency mechanism.** The claim row and the ticket commit together, so
a concurrent duplicate either returns the committed ticket or loses the unique constraint and
rolls back. No locks, no polling, and no window in which one request produced two tickets.

**There is no second routing path for API tickets.** An ingress ticket posts the same queued job an
ordinary raise posts. A parallel router would drift, and the drift would only ever be discovered by
whoever was on call at the time.

**The external status read is an allow-list, not a filtered ticket.** `ExternalTicketStatus` has no
field for an assignee, an internal note or a routing trail, so none of them can start appearing
because a query was widened somewhere. Public replies are filtered in the query rather than after
it, for the same reason.

**An external reporter is not a Desk user.** A product names a support identity that stands as
requester, and the real person is carried as an `ExternalRequester`. Creating an account per
reporter would fill the directory with logins nobody can use and that every permission check has
to skip.
