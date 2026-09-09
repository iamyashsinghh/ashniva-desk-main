# on-call

**Owns:** Support ownership per project, working hours, developer availability and on-call cover —
the three inputs the routing engine of package 8b reads. Nothing here routes anything.

**Phase:** delivered in package 8a.

**Entities:** `support_ownership`, `user_work_schedules`, `user_availability`, `on_call_schedule`

## Three records, not one

They change on completely different clocks, and collapsing any two of them loses a distinction the
router has to be able to explain:

| Record | Answers | Changes when |
| --- | --- | --- |
| `UserWorkSchedule` | *Should* this person be working now? | Somebody's contract or shift changes |
| `UserAvailability` | *Is* this person available now? | Many times a day, mostly pushed by Ashniva HR |
| `OnCallSchedule` | Who covers this project on this date? | A rota is published |
| `SupportOwnership` | Who is responsible for this project's support? | The team changes |

Somebody can be inside their hours and on leave; outside their hours and on call; available and at
their limit. `resolveAvailability` in `packages/types` folds all of it into one verdict plus a
reason drawn from the router's own vocabulary — `ON_LEAVE`, `OUT_OF_HOURS`, `AT_WORKLOAD_LIMIT`.
The verdict is computed on read, never stored, so it cannot disagree with the facts behind it.

## Files

| File | Responsibility |
| --- | --- |
| `support-ownership.repository.ts` | The four tables, always tenant-scoped |
| `support-ownership.mapper.ts` | Rows → API shapes, including the effective availability |
| `support-ownership.service.ts` | Membership and tenant checks, audit, the HR write seam |
| `support-ownership.controller.ts` | Thin; `support-routing:manage` on everything but `GET /me/work-schedule` |
| `dto/support-ownership.dto.ts` | Validation, including `HH:MM` clock times |

## Endpoints

`GET /projects/:id/support-config` · `PUT /projects/:id/support-ownership` ·
`PUT /projects/:id/on-call` · `DELETE /projects/:id/on-call/:onDate` ·
`PUT /users/:id/work-schedule` · `PATCH /users/:id/availability` · `GET /me/work-schedule`

All but the last need `support-routing:manage` (Super Admin, Project Manager, Team Lead).
`GET /me/work-schedule` returns the caller's own rota and nothing else — a developer is entitled to
know the hours routing holds them to, but reading them must not become the management view.

## The HR seam

`PATCH /users/:id/availability` is the entire contract between Ashniva HR and Desk. HR decides what
attendance means and pushes the fact with `source: HR`; Desk stores it and resolves it against the
rota. Desk never reads HR's database, and it keeps working when HR goes quiet.

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
