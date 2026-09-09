# Development phases

Phases 0, 1 and 2 are implemented. Later phases are **documented here, not implemented**.
Each phase is its own set of pull requests; do not start the next phase without sign-off.

## Phase 0 — Production foundation (done, PR #1)

Monorepo, tooling, Docker Compose, API skeleton (config, logging, errors, guards, audit, health,
branding, auth foundations), Prisma foundation tables + seed, shared types, UI tokens and base
components, web app shell, CI, documentation.

## Phase 1 — MVP (done, branch `feature/phase-1-mvp`)

Delivered from the approved designs, desktop and mobile layouts:

- **Auth and sessions** — `POST /auth/login|refresh|logout|switch-organization`, `GET /auth/me`;
  rotating refresh token in an httpOnly cookie with family revocation; access token in memory;
  login throttling; audit of sign-in, sign-out and failures.
- **Users, organizations, teams, roles** — CRUD with role placement rules (client roles only in
  client organizations, internal roles only in the service provider), deactivate/activate,
  password change, directory for pickers, read-only roles matrix.
- **Projects** — list/detail with progress, health, task counts, members.
- **Tasks** — `task-workflow.ts` state machine (`Assigned → In progress → Review / testing →
  Completed`, plus Blocked, Reopened, Cancelled) with per-action availability and reasons;
  categories; comments with internal/client visibility; work logs; completion sheet (what, time,
  proof, client-visible); review approve/return; task history.
- **Client updates** — drafted on approval of client-visible work, edited/published/withdrawn by
  seniors and managers (Completed Today screen), shown in the portal.
- **Automatic daily reports** — snapshot per person per day from work logs and completions;
  live until the 18:30 IST scheduler stores it; team and history views.
- **Tickets** — `ticket-workflow.ts` (`New → Assigned → In progress → Waiting for client → Review /
  testing → Resolved → Closed`, plus Reopened, Cancelled); public thread vs internal notes;
  convert one ticket into many tasks; raised by clients, employees or support.
- **Client portal** — home, projects, work items, published updates, files, tickets (raise, reply,
  confirm-and-close, reopen), built from allow-list mappers.
- **Files** — multipart upload through the API, streamed download after access checks, soft delete.
- **Dashboards** per role, **audit history** screen, **real-time** invalidation over Socket.IO.
- Tests: unit (workflows, access scope, services), API e2e (auth flow, identity, work, the 20-step
  business flow, cross-tenant denials), Docker Compose smoke test in CI with a real sign-in.

Deliberately **not** in Phase 1 (shown as unavailable, never faked): contracts, SLA timers and
escalations, billing, releases/UAT, GitHub, IVR, notifications by email/WhatsApp, forgot-password
and invitations by email, PostgreSQL row-level security (repositories enforce tenant scope; RLS is
the Phase 2 second layer — see `docs/database-plan.md`).

## Phase 2 — Operations (done, branch `feature/phase-2-operations`)

- **Contracts and support hours** — five contract types with scope, dates, renewal and value,
  archive, search and filters; an append-only hour ledger (included, purchased, carried forward,
  reserved, consumed, expired) with balances after every movement; approved work consumes hours
  exactly once; manual movements need a reason and a fresh password check; payment milestones.
- **Milestones and deliverables** — progress from linked work or set manually with a reason,
  dependencies without cycles, client sign-off through an approval, visible in the project,
  contract, dashboards and portal.
- **SLA** — policies per project, per client or default, with business hours, timezone, working
  days, pause statuses, a warning threshold and per-priority targets; the ticket clock engine and a
  monitor job that records each warning and breach once; timers on tickets, lists and dashboards.
- **Change requests** — numbered, draft → submitted → internal review → client review → approved →
  scheduled → completed (plus rejected, changes requested, cancelled); the client decides in the
  portal; approved changes generate tasks under a milestone with traceability back to the request.
- **Client approvals** — for updates, milestones, contract documents, change requests and files;
  prepared internally, published, then approved or returned by the client; the same person can
  never approve for both sides.
- **Notifications** — fifteen types in-app with read state, per-event and per-channel preferences,
  grouping, de-duplication, quiet hours, rate limiting, live delivery over Socket.IO and scheduled
  reminders; email and WhatsApp exist as provider interfaces only.
- **Advanced reports** — ten reports authorized and scoped on the server, CSV export (audited), and
  the client-safe subset in the portal.
- **Custom roles and security** — roles from a template with a permission matrix and no escalation,
  protected system roles, PostgreSQL row-level security, invitation links, forgot/reset password,
  re-authentication for sensitive changes and stricter rate limits.

Deliberately **not** in Phase 2: releases and UAT, the GitHub integration, IVR and calls, billing
and invoices, recurring-issue matching and RCA, and the mobile app. Email and WhatsApp delivery are
interfaces without providers.

## Phase 3 — Integrations, billing, AI and mobile (done, merged as `739f259`)

Shared integration foundation, GitHub and GitLab, automatic release notes, email (SMTP) and
WhatsApp (Meta Cloud API) delivery behind the Phase 2 provider interfaces, billing and invoicing
with Indian GST, AI progress summaries, and the React Native mobile foundation. Work packages 7,
12 (the adapters) and 13, plus the "Later (Phase 3+)" list above.

## Phase 4 — Testing, staging and release workflow (in progress, branch `feature/phase-4`)

**Scope is work package 6 of the implementation order below** — the next unimplemented package in
the documented sequence. Packages 8 (IVR, calls and callbacks) and 9 (recurring issues, incidents
and RCA) remain after it and are *not* in Phase 4.

The vocabulary for this package was laid down long before the tables were: `TESTING_ASSIGNMENT_*`,
`TEST_RESULT`, `TEST_ENVIRONMENT`, `CHECK_STATUS`, `RELEASE_STATUS`, `RELEASE_APPROVER_ROLE`, the
nine `qa:*` / `release:*` / `uat:decide` permissions with their default role grants, and
`projects.requires_client_uat`. Phase 4 gives those contracts tables and behaviour; it invents no
new scope. The permissions already ship in `20260906200000_phase3_permissions`, so no new
permission migration is required.

- **Testing** — one `testing_assignments` table for QA, retest, live verification and client UAT,
  because the lifecycle is identical and only the audience and environment differ. Append-only
  `test_results` (a retest is a new assignment, never an edited result), with the pass/fail form
  the Architecture Plan specifies: environment, what was tested, actual result, failure
  description, severity, browser/device, evidence, comment for the developer, retest required.
- **Test environments and accounts** — `test_environments` records where a tester can actually go
  and what is deployed there. `test_accounts` holds reusable logins whose passwords are encrypted
  with `SecretCipherService` and never appear in a list or detail response. Seeing one takes a
  timed `credential_grant`; every generate, reveal, rotate and revoke lands in the append-only
  `credential_access_log`.
- **Releases** — `releases`, `release_items`, `release_approvals` and `release_history`, gated by
  a per-project `project_release_policy`. The readiness checklist is computed on the server and
  returned whole, so a Publish button is never more confident than the reasons behind it;
  publishing asks the operator to type the version back.
- **Client UAT** — `uat_requests`, deliberately its own table rather than a flavour of
  `ApprovalRequest`, so the shape itself guarantees a client sign-off can never surface a staging
  credential, a pull request or another client's ticket.

### What is *not* Phase 4, and why

- **Packages 8 (IVR, calls) and 9 (recurring issues, problems, RCA, incidents).** Separate rows in
  the implementation order below.
- **Mobile.** The mobile screens are work package **13**, and the design map heads its mobile
  section "Mobile (1m, 2x, Architecture Plan §20 — later phase)". Package 13 shipped as a
  foundation in Phase 3; its QA and UAT screens belong to that package, not to package 6.
- **The full 22-status task chain** (`READY_FOR_QA → TESTING_STAGING → QA_PASSED → …`). Those
  statuses exist in `packages/types`, but the Phase 1 task state machine deliberately implements a
  simpler set and nothing writes them. Adopting the full chain is a change to `task-workflow.ts`,
  which is package 4, and it would change Phase 1 behaviour. What package 6 *does* owe, and
  implements, is the side effect its own specification names: a failed test returns the linked
  task to `RETURNED_TO_DEV` — a status the Phase 1 machine already has — with the reason and
  evidence, and notifies the developer. The hi-fi fail sheet states the whole of it in one line
  ("Task AD-124 → **Returned to developer**. Priya is notified with this reason and the video"),
  and `product-requirements.md` line 51 gives the chain it belongs to.
- **`GET /releases/:id/notes.pdf`.** Listed in `docs/api-plan.md` under item 6. Not built: there is
  no PDF rendering outside the billing module, so this is a new document layout rather than an
  endpoint, and it gates nothing. Tracked as an issue.
- **The client UAT portal screens** are phased `6 (API) / 10 (portal UI)` by the design map. The
  API is package 6 and is built; the screens were built alongside it rather than waiting for
  Phase 10, because a gate the client cannot answer is not a working gate.

## The order was revised after package 6

The operational-flow requirement — that Ticket, Task, QA, Client Project and Support behave as one
system rather than five — was taken up after package 6 shipped. Most of it turned out to be
package 5 delivered only in part, plus packages 8 and 10, so the remaining work was re-cut into
packages that each close one loop end to end.

**`docs/operational-flow-plan.md` holds the requirement-by-requirement map and the revised order,
and supersedes the table below for everything after package 6.** The table stays because packages
1–6 were built from it and the record of what was planned is worth keeping.

## Implementation order (Phases 1 → 3, superseded after package 6)

| # | Work package | Main modules | Screens (design map) |
| --- | --- | --- | --- |
| 1 | **Authentication and tenant isolation** — login/refresh/logout/forgot/reset/invite, organization selection, web session handling, route guard, RLS migration, cross-tenant test suite | auth, organization-memberships | Sign in, Forgot password, Invite accept |
| 2 | **Users, teams, roles and permissions** — user CRUD and invitations, teams, roles matrix, show-Development toggle, preview-as | users, teams, roles-permissions | Admin: Users, Teams, Roles & permissions |
| 3 | **Companies, clients, products and projects** — organizations, products, projects (members, modules, settings, environments), milestones, branding editing | organizations, products, projects, milestones, branding | Admin: Companies, Projects & products; Project list/detail; Branding |
| 4 | **Tasks, work logs and automatic daily reports** — state machine with gates, categories, manager tasks, comments/visibility, completion sheet, client updates draft/publish, files, dashboards, in-app notifications, reports | tasks, work-logs, client-updates, files, notifications (basic), reports, dashboards | Create/Assign Task, Task board, Task detail, My Tasks Today, dashboards (admin/senior/developer), Completed Today, Reports |
| 5 | **Tickets and automatic developer assignment** — numbering, workflow, replies, convert-to-tasks, SLA policies, support ownership, on-call, routing rules, ack/escalation jobs, queues | tickets, ticket-routing, on-call, sla-escalations | Raise Ticket, Ticket list/detail, Developer incoming queue, Senior SLA & escalation dashboard, Support routing settings, Ownership & on-call, Support dashboard |
| 6 | **Testing, staging and release workflow** — QA assignments, test form, test environments and accounts with secure reveal, releases, publish confirmation, live verification, client UAT | qa, releases, approvals (UAT) | Tester dashboard, Testing assignment, Pass/Fail form, Test environments, Test accounts, Release list/detail, Publish confirmation, Live verification, Client UAT |
| 7 | **GitHub integration** — App install, repo mapping, webhooks, `AD-###` linking, checks gating, PR/review status | github | GitHub connection, Repository & branch mapping, PR/code-review status |
| 8 | **IVR, calls and callbacks** — Tata adapter, webhooks, screen pop, outbound calls, dispositions, callback queue, call history, IVR health | ivr, call-logs | Ticket detail IVR panel, Call history, IVR configuration & health |
| 9 | **Recurring issues, incidents and RCA** — similarity matching, duplicate decisions, problems, RCA form, incidents and emergency fixes, recurring dashboard | recurring-issues, problems, rca, incidents | Recurring issues dashboard, Problem list, Problem & RCA detail |
| 10 | **Client portal** — portal shell, dashboard, projects, tickets, completed today/this week, releases, approvals, UAT, support history | portal controllers across modules | Client dashboard, Portal project, Portal tickets, Approvals, Client support history |
| 11 | **Contracts and SLA reporting** — contracts, hour ledger, payment milestones, change requests, renewals, SLA reports, audit-log screen | contracts, approvals, audit-logs | Contract list/detail, Hours meter, Audit log |
| 12 | **Notifications** — email and WhatsApp adapters, preferences, digests | notifications | Notification preferences |
| 13 | **React Native mobile app** — Expo app on the same API (flows in Architecture Plan §20) | apps/mobile | 20 mobile screens |

Work packages 11 and 12 (contracts, SLA reporting and in-app notifications) shipped in Phase 2;
the email and WhatsApp adapters of package 12 remain open.

Later (Phase 3+): AI similarity matching and summaries, release-notes generator, billing/invoicing,
GitLab support.

## Definition of done for every work package

- Backend: module with controller/service/repository/DTOs, permissions declared, tenant scope in
  repositories, audit on sensitive actions, unit tests (state machines and rules), e2e per
  controller including cross-tenant cases, Swagger annotations, migration + seed data.
- Frontend: screens from the design map with loading/empty/error/permission-denied states,
  disabled actions explain why, internal vs client-visible badges, responsive, keyboard accessible,
  component tests for behaviour.
- Docs: module README updated, `docs/design-implementation-map.md` rows marked done, API plan
  updated if endpoints changed.
- CI green; no `any` without a documented reason; no file silently over 300 lines.

## Suggested Phase 1 task breakdown (work packages 1 → 4)

1. Auth endpoints + DTOs + throttling + audit (API) · login/forgot/reset/invite pages + session
   store + route guard (web) · cross-tenant e2e harness.
2. RLS migration + non-owner DB role + `SET LOCAL app.tenant_id` in `PrismaService.$transaction`
   helper · repository base with tenant scope.
3. Users/invitations/teams/roles endpoints + admin screens.
4. Organizations/products/projects/milestones/environments endpoints + screens; branding editing
   + logo upload (files presign).
5. Tasks: schema, state machine (`task-workflow.ts`) with gates and unit tests, endpoints, board
   (list/kanban/calendar), task detail + completion sheet, review decisions.
6. Work logs + client updates (draft → publish) + Completed Today (internal + client view).
7. Dashboards (admin, senior, developer) + reports (developer, senior, project) + snapshot job.
8. In-app notifications + Socket.IO events + notification bell.
