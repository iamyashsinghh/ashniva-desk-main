# Product requirements

Consolidated from the approved design phase (`docs/design-reference/chats/chat1.md` and the
Architecture Plan v0.3). This is the product contract the implementation phases work against.

## 1. Purpose

Ashniva Technologies' in-house IT team builds software for its own group companies, sells software
products to corporate clients, delivers custom projects and contract work, and provides annual
maintenance and support. Ashniva Desk tracks daily tasks, development progress, support tickets,
contracts and client-visible work updates — **without creating reporting work**: task activity *is*
the report.

Launch scale: ~25 internal users, ~10 client organizations. Region: India (IST, INR, DD/MM/YYYY).
Interface: English, plain and terse copy, simple enough for non-technical clients.

## 2. Roles

Super Admin/Director · Project Manager · Team Lead/Senior Developer · Developer · Tester/QA ·
Support Executive · Internal Company Employee · External Client Admin · Client Employee.

Seniors both manage and develop; the system tracks the two separately and Admin can hide a senior's
Development section later without creating a new role.

## 3. Core modules

| # | Module | Essentials |
| --- | --- | --- |
| 1 | Companies & clients | Own group companies, corporate customers, contract clients, AMC clients. Strict multi-tenant isolation. |
| 2 | Projects | Internal product, own-company work, fixed price, monthly contract, AMC, dedicated developer, support-only. Members, senior, milestones, priority, progress, attachments, internal notes vs client-visible summary, test environments, release policy, support ownership. |
| 3 | Tasks | Categories (Development, Management, Review, Testing, Planning, Client Meeting, Team Follow-up, Release Approval, Documentation, Administrative). Full development workflow (§4). Create Task in < 30 s: 7 basic fields, everything else under *More Options*. Views: My Tasks, Assigned by Me, Team, Today, Overdue, Completed Today; Kanban, list, calendar. Completion asks only: what was completed, time spent, proof (file/link/git ref), client-visible? |
| 4 | Tickets | Raised by own employees, clients, client employees, support, internal IT; sources portal, mobile, internal, API, IVR, later email/WhatsApp. Types: bug, outage, performance, support, change request, feature, training, access, billing, other. Auto-captured: number, requester, company, date/time, source, SLA. Convert to one or many tasks (linked). Clients see public replies and simple statuses only. |
| 5 | Smart routing | Technical tickets go directly to the responsible/on-call developer (module owner → primary → on-call → backup, respecting leave, hours, workload); others to the support queue; ack timer (15 min) → L1 backup → L2 senior; reassignment needs a reason; everything audited. |
| 6 | Recurring issues, problems, RCA | Similar-issue detection (module, version, keywords, error code; AI later). "Reported by N clients on version X" warning. Threshold auto-creates a Problem; RCA form with 10 questions; recurring-issues dashboard. Never expose one client to another. |
| 7 | IVR | Provider adapter (Tata first). Identify caller → open/create ticket → on-call developer → screen pop → bridged call, numbers hidden → backup/callback queue → call log with disposition, public summary, internal note. |
| 8 | QA & test environments | Tester dashboard views; assignments with staging URL, test account grant, criteria, evidence; Pass/Fail form; fail auto-returns to developer; reusable role-based test accounts, encrypted, timed reveal, access log; live verification after production. |
| 9 | Releases | Version, items, checks, QA/UAT status, approvals per project policy, typed-version publish confirmation, deployment result, rollback, notes. Only publishers can publish. |
| 10 | Client UAT | Optional per project/release; plain-language summary, preview link, approve / request changes / comment. No credentials, GitHub or internal details. |
| 11 | GitHub | GitHub App per org, repo ↔ project mapping, `AD-###` linking of branches/commits/PRs/checks/deployments/releases; Ready for QA gated on required checks (manager override with reason). |
| 12 | Contracts | Fixed price, retainer, AMC, support hours, dedicated developer; included/used/remaining hours, payment milestones, change requests, renewal/expiry alerts, documents. |
| 13 | Client portal | Own projects, contracts, milestones, progress, work in progress / completed today / this week, tickets, releases, change requests, approvals, decisions, support hours. Updates approved by a senior/PM before publishing. |
| 14 | Reports | Automatic daily developer, senior/manager, tester and project reports from activity; snapshot 18:30 IST; exports. |
| 15 | Dashboards | Super Admin, Senior, Developer, Tester, Support, Client. |
| 16 | Notifications | In-app now; email/WhatsApp adapters later; preferences and digests; deep links; never credentials. |
| 17 | Admin | Companies, projects/products, teams, users (show-Development toggle), roles matrix, task categories/status labels, ticket categories, SLA rules, testers, GitHub, test environments/accounts, branding, notifications, audit logs, support routing, ownership/on-call, IVR; *Preview as* role (read-only, audited). |

## 4. Workflows

**Development task:** Assigned → In Progress → Development Completed → Code Review → Ready for QA →
Testing on Staging → QA Passed → Client UAT (if required) → Ready to Publish → Published Live →
Live Verification → Completed. Failure: QA Failed → Returned to Developer → Fix Submitted → Retest.
Live failure: Live Verification Failed → Rollback/Hotfix Required → fix → retest → republish.
Side states: Blocked, Cancelled, Draft. Management tasks: Assigned → In Progress → Completed.

**Ticket:** New → Auto-assigned → Acknowledged → In Progress → (linked task chain) → Review →
Resolved → Closed; side states Waiting for Client, Escalated (L1/L2), Reopened, Cancelled.

**Customer-visible statuses only:** Received, Assigned, In Development, Under Testing, Awaiting Your
Approval, Scheduled for Release, Published Live, Waiting for You, Completed
(`packages/types/src/workflow/client-visible-status.ts`).

## 5. Never shown to clients

Internal comments, developer discussions, RCA discussions, technical investigation, estimates,
internal costs, profit, employee performance, private attachments/logs, personal phone numbers,
GitHub links/secrets, credentials, deployment details, failures/rollbacks, other clients' data.

## 6. UI requirements

Simple, professional, responsive (desktop/tablet/mobile), fast, minimal-click; internal vs
client-visible unmistakable (green CLIENT-VISIBLE / grey INTERNAL badges); disabled actions explain
why; quick actions on detail views; temporary text logo and neutral palette configurable from
Admin → Branding; 44 px touch targets and accessible labels on mobile; "Device biometrics" wording.

## 7. Mobile app (later phase)

React Native (Expo) on the same API. Bottom navigation (Home, Tasks, Tickets, Notifications, More),
role-based home, incoming ticket alerts, IVR call sheets, QA queue, releases, client UAT, offline
drafts with sync status, biometric lock, Keychain/Keystore tokens. Full flow and screen list:
Architecture Plan §20.

## 8. Open decisions (need a product answer before the related phase)

1. Ticket numbering per client org (`ACME-0042`) or global (`ASH-1042`)? *Assumed per client org.*
2. Auto-close resolved tickets after 5 days? *Assumed yes.*
3. Client employees see contract hours, or only Client Admins? *Assumed Client Admins only.*
4. Daily report snapshot at 18:30 IST? *Assumed yes.*
5. Team board swimlanes by assignee or project? *Assumed assignee, switchable.*
6. Credential grant TTL 8 h; rotate after every test or daily? *Assumed 8 h, after every test.*
7. QA mandatory for every development task, or PM may mark "no QA"? *Assumed mandatory; `requires_qa` flag kept for later.*
8. Publishers: PM + Director only, or also Team Lead? *Assumed configurable per project, default PM + Director.*
