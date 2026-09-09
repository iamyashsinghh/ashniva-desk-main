# Design implementation map

Every approved screen, and where it lands in the codebase. Sources: Hi-fi Screens (1a–1m),
Hi-fi Screens v2 (2a–2x, 3a–3h) and the clickable prototypes under `docs/design-reference/`.
Priority when sources disagree: Architecture Plan → Hi-fi v2 → latest prototypes → wireframes.

Legend — **Visibility:** I = internal only, C = client-visible (portal), I/C = both with separate
DTOs. **Phase** = work-package number from `development-phases.md`. Components marked `pkg/ui` are
shared. Roles use `packages/types` keys (SA Super Admin, PM, TL Team Lead, DEV, QA, SUP Support,
EMP Internal Employee, CA Client Admin, CE Client Employee).

## Phase 1 status (implemented)

The rows in the tables below keep the full plan. The following screens exist and work today; the
component names are the real files under `apps/web/src/features/`.

| Screen (design) | Route | Components | Roles | API |
| --- | --- | --- | --- | --- |
| Sign in | `/login` | `auth/pages/LoginPage` | all | `POST /auth/login` |
| App shell, sidebar, top bar, phone tab bar | `/`, `/portal` | `app/layout/AppShell`, `Sidebar`, `Topbar`, `MobileTabBar`, `navigation.ts` | all | `GET /auth/me`, `GET /branding` |
| Global search (top bar box + results page) | `/search`, `/portal/search` | `search/components/GlobalSearch`, `search/pages/SearchResultsPage` | all (per module) | `GET /search` |
| Management dashboard (1a) | `/` | `dashboard/components/ManagementDashboard` | SA, PM | `GET /dashboard` |
| Senior dashboard (1b) | `/` | `SeniorDashboard` | TL | `GET /dashboard` |
| Developer "Today" (1c) | `/` | `DeveloperDashboard` | DEV | `GET /dashboard` |
| Tester / QA dashboard (2j, Phase 1 scope) | `/` | `TesterDashboard` | QA | `GET /dashboard` |
| Support dashboard | `/` | `SupportDashboard` | SUP | `GET /dashboard` |
| Employee dashboard | `/` | `EmployeeDashboard` | EMP | `GET /dashboard` |
| Dashboard KPI destinations | — | `dashboard/card-links.ts` | all internal | see below |
| Projects list, project detail (1e, Phase 1 tabs) | `/projects`, `/projects/:id` | `projects/pages/ProjectsPage`, `ProjectDetailPage`, `ProjectFormModal` | internal | `/projects*` |
| Task board / list (1f) | `/tasks?view=&layout=&overdue=&completedToday=` | `tasks/pages/TasksPage`, `TaskBoard`, `TaskTable` | internal | `GET /tasks` |
| Task detail + completion sheet + review (1g) | `/tasks/:id` | `TaskDetailPage`, `TaskSteps`, `TaskActions`, `TaskModals`, `SubmitTaskModal`, `TaskComments`, `TaskHistory`, `files/components/FileList` | internal | `GET /tasks/:id`, `POST /tasks/:id/*` |
| Create task (2a), assign (2b) | `/tasks/new`, modal | `CreateTaskPage`, `PeoplePicker`, `TaskModals` | SA, PM, TL, SUP | `POST /tasks`, `POST /tasks/:id/assign` |
| Completed Today (1k) | `/completed-today` | `client-updates/pages/CompletedTodayPage`, `UpdateRow`, `EditWordingModal` | TL, PM, SA | `/client-updates*` |
| Reports (1l, daily) | `/reports` | `reports/pages/ReportsPage` | internal | `/reports/daily*` |
| Ticket list (1h), ticket detail (1i), raise ticket (2c), convert to tasks | `/tickets`, `/tickets/:id`, `/tickets/new` | `tickets/pages/TicketsPage`, `TicketDetailPage`, `CreateTicketPage`, `TicketThread`, `TicketActions`, `TicketModals` | internal | `/tickets*` |
| Client dashboard (1d) | `/portal` | `portal/pages/PortalHomePage` | CA, CE | `GET /portal/home` |
| Portal projects, project detail | `/portal/projects`, `/portal/projects/:id` | `PortalProjectsPage`, `PortalProjectDetailPage`, `PortalTaskRows` | CA, CE | `/portal/projects*` |
| Portal tickets, ticket detail, raise ticket | `/portal/tickets`, `/portal/tickets/:id`, `/portal/tickets/new` | `PortalTicketsPage`, `PortalTicketDetailPage`, `PortalRaiseTicketPage`, `PortalReopenModal` | CA, CE | `/portal/tickets*` |
| Companies & clients (2f) | `/admin/companies` | `admin/pages/CompaniesPage` | SA | `/organizations*` |
| Users & teams (2h) | `/admin/users` | `UsersPage`, `UserFormModal`, `TeamsPanel` | SA (CA: own users) | `/users*`, `/teams*` |

| Audit log (2w) | `/admin/audit` | `audit/pages/AuditPage` | SA | `GET /audit-logs` |
| Profile | `/profile` | `profile/pages/ProfilePage` | all | `GET /auth/me`, `POST /users/me/change-password` |
| Contracts (1j) list, detail, form | `/contracts`, `/contracts/:id` | `contracts/pages/ContractsPage`, `ContractDetailPage`, `ContractFormModal`, `ContractOverview`, `HoursPanel`, `PaymentMilestones` | SA, PM | `/contracts*` |
| Milestone detail | `/milestones/:id` | `milestones/pages/MilestoneDetailPage`, `MilestonePanels`, `ProgressModal`, `MilestoneFormModal`, `MilestoneTable` | SA, PM, TL | `/milestones*` |
| SLA policies | `/admin/sla` | `sla/pages/SlaPoliciesPage`, `SlaPolicyFormModal`, `SlaTargetsTable`, `BusinessDayPicker` | SA, PM, SUP | `/sla/policies*` |
| Ticket SLA panel | `/tickets/:id` | `sla/components/TicketSlaCard` | internal | `GET /sla/tickets/:id/events` |
| Change requests list, detail | `/change-requests`, `/change-requests/:id` | `change-requests/pages/ChangeRequestsPage`, `ChangeRequestDetailPage`, `ChangeRequestPanels`, `ChangeRequestThread`, `EstimateModal`, `ScheduleModal`, `GenerateTasksModal` | SA, PM, TL | `/change-requests*` |
| Approvals inbox, detail | `/approvals`, `/approvals/:id` | `approvals/pages/ApprovalsPage`, `ApprovalDetailPage`, `EditApprovalModal`, `RequestApprovalButton`, `ApprovalHistory` | SA, PM | `/approvals*` |
| Notification centre and preferences | `/notifications` | `notifications/pages/NotificationsPage`, `NotificationBell`, `NotificationPreferencesCard` | all | `/notifications*` |
| Advanced reports | `/reports/advanced` | `reports/pages/AdvancedReportsPage`, `ReportTable` | internal | `/reports/advanced*` |
| Roles & permissions editor (2i) | `/admin/roles` | `admin/pages/RolesPage`, `RoleEditorModal`, `UserRoleModals` | SA | `/roles*`, `POST /users/:id/role` |
| Portal contracts, contract detail | `/portal/contracts`, `/portal/contracts/:id` | `PortalContractsPage`, `PortalContractDetailPage` | CA, CE | `/portal/contracts*` |
| Portal change requests, detail | `/portal/change-requests`, `/portal/change-requests/:id` | `PortalChangeRequestsPage`, `PortalChangeRequestDetailPage` | CA, CE | `/portal/change-requests*` |
| Portal approvals, detail | `/portal/approvals`, `/portal/approvals/:id` | `PortalApprovalsPage`, `PortalApprovalDetailPage` | CA (decide), CE (read) | `/portal/approvals*` |
| Portal reports | `/portal/reports` | `AdvancedReportsPage` (portal mode) | CA, CE | `/portal/reports*` |

## Authentication and shell

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sign in | `/login` | `LoginPage` (done: layout), `FormField`, `Input`, `Button` | all | `POST /auth/login`, `GET /branding` | users, refresh_tokens | I/C | 0 (UI) / 1 |
| Forgot / reset password | `/forgot-password`, `/reset-password/:token` | `ForgotPasswordPage`, `ResetPasswordPage` (done) | all | `POST /auth/forgot-password`, `/auth/reset-password` | users, password_reset_tokens | I/C | 2 |
| Invite accept | `/invite/:token` | `AcceptInvitationPage` (done) | all | `GET/POST /auth/invitations/:token` | users, user_invitations | I/C | 2 |
| Organization picker (multi-org users) | `/select-organization` | `OrganizationPickerPage` | all | `GET /auth/me` | organization_memberships | I/C | 1 |
| App shell | `/` layout | `AppShell`, `Sidebar`, `Topbar`, `navigation.ts` (done) | internal | `GET /branding`, `GET /auth/me` | — | I | 0 |
| Portal shell | `/portal` layout | `PortalShell` | CA, CE | `GET /branding`, `GET /auth/me` | — | C | 10 |
| System status | `/system/status` | `SystemStatusPage` (done) | SA | `GET /health` | — | I | 0 |

## Dashboards (1a–1d, 2j, 3e)

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Super Admin dashboard (1a) | `/dashboard` | `AdminDashboard`, `StatTile`, `RiskList`, `WorkloadBars`, `RenewalsList` | SA, PM | `GET /dashboards/admin` | projects, tasks, tickets, contracts, releases | I | 4 |
| Senior dashboard (1b) | `/dashboard` | `SeniorDashboard`, `ReviewQueue`, `MyTasksTodayPanel` | TL | `GET /dashboards/senior` | tasks, tickets, releases | I | 4 |
| Developer dashboard (1c) | `/dashboard` | `DeveloperDashboard`, `TaskList`, `TicketList` | DEV | `GET /dashboards/developer` | tasks, tickets | I | 4 |
| Tester/QA dashboard (2j) | `/qa` | `TesterDashboard`, `QaViewTabs`, `AssignmentRow` | QA | `GET /dashboards/tester`, `GET /qa/assignments?view=` | testing_assignments | I | 6 |
| Support dashboard | `/dashboard` | `SupportDashboard`, `TicketQueue` | SUP | `GET /dashboards/support`, `GET /tickets/queue` | tickets | I | 5 |
| Senior SLA & escalation dashboard (3e) | `/support/escalations` | `EscalationDashboard`, `SlaCountdown`, `TeamAvailability` | SA, PM, TL | `GET /tickets/queue?view=sla`, `GET /projects/:id/on-call` | tickets, ticket_assignments, user_availability | I | 5 |
| Client dashboard (1d) | `/portal` | `PortalDashboard`, `ProgressRing`, `CompletedTodayList`, `HoursMeter` | CA, CE | `GET /portal/dashboard` | projects, client_updates, tickets, contracts | C | 10 |
| My Tasks Today — manager (2d) | `/tasks/today` | `MyTasksTodayPage` (Management + Development sections) | all internal | `GET /tasks?view=today` | tasks, task_categories, user settings | I | 4 |

## Projects, tasks and work (1e–1g, 2a, 2b, 1k, 1l)

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Projects list | `/projects` | `ProjectsPage`, `ProjectRow`, `FilterBar` | internal | `GET /projects` | projects | I | 3 |
| Project detail (1e) | `/projects/:id` (tabs overview/plan/tasks/tickets/updates/members) | `ProjectDetailPage`, `ProjectOverviewPanel`, `ProjectPlanPanel`, `ProjectTimeline`, `ProjectUpdatesPanel` | internal (CA/CE restricted portal view) | `GET /projects/:id`, `/plan`, `/summary`, `/milestones`, `/files`, `/updates`, `/environments`, `/support-ownership` | projects, milestones, milestone_deliverables, tasks, files, client_updates, test_environments, support_ownership | I/C | 3 |
| Task board (1f) | `/tasks` (`?view=&layout=`) | `TaskBoardPage`, `KanbanBoard`, `TaskList`, `TaskCalendar`, `TaskCard`, `StatusPill` (pkg/ui) | internal | `GET /tasks?view=…&layout=…` | tasks | I | 4 |
| Task detail + completion sheet (1g) | `/tasks/:id` | `TaskDetailPage`, `TaskActions` (with disabled reasons), `CompletionSheet`, `ReviewDecision`, `StatusHistory`, `DependencyList`, `GithubPanel`, `VisibilityBadge` (pkg/ui) | internal | `GET|PATCH /tasks/:id`, `POST /tasks/:id/*`, `GET /tasks/:id/history`, `/comments`, `/github` | tasks, task_status_history, comments, work_logs, github_refs | I | 4 (GitHub panel 7) |
| Create Task (2a) | `/tasks/new` (also dialog) | `TaskForm` (basic fields + *More Options*), `Select`, `Textarea` (pkg/ui) | SA, PM, TL, DEV, QA, SUP | `POST /tasks` (+ `/duplicate`, `/recurrence`) | tasks, task_categories, milestones | I | 4 |
| Assign Task (2b) | dialog from task detail/board | `AssignTaskDialog`, `UserPicker` | SA, PM, TL, SUP | `POST /tasks/:id/assign` | tasks | I | 4 |
| Completed Today (1k) | `/completed-today` | `CompletedTodayPage`, `UpdateReviewRow`, `PublishBar` | TL, PM, SA (client view in portal) | `GET /client-updates?status&date`, `POST /client-updates/:id/publish` | client_updates, work_logs | I/C | 4 |
| Reports (1l) | `/reports` | `ReportsPage`, `DeveloperReport`, `SeniorReport`, `TesterReport`, `ProjectReport`, `DateRangePicker`, `ExportMenu` | internal by scope | `GET /reports/*` | report_snapshots, tasks, work_logs, testing_assignments | I | 4 |

## Tickets and smart support (1h, 1i, 2c, 3a–3h)

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ticket list (1h) | `/tickets` | `TicketListPage`, `TicketRow`, `SlaBadge`, `TicketTriageBar` | internal (portal: own) | `GET /tickets` | tickets | I/C | 5 |
| Ticket detail (1i + 3 IVR panel) | `/tickets/:id` | `TicketDetailPage`, `TicketThread` (public/internal tabs), `ReplyComposer`, `LinkedTasks`, `TicketRoutingPanel`, `SimilarIssuesPanel` (delivered: ranked suggestions with their reasons, confirm/dismiss), `TicketCallsCard` (delivered: Call support, attempt ladder, recording gate) | internal (portal: public thread) | `GET /tickets/:id`, `/replies`, `/activity`, `/similar`, `POST /tickets/:id/*`, `GET|POST /tickets/:id/calls`, `GET /tickets/:id/calls/availability`, `GET /calls/:id/recording` | tickets, comments, ticket_assignments, similarity_matches, call_logs, call_attempts | I/C | 5 (similar 11 — delivered, IVR 9 — delivered) |
| Raise Ticket (2c) | `/tickets/new`, `/portal/tickets/new` | `RaiseTicketForm` (auto-captured fields + *More Options*), `FileDropzone` | all | `POST /tickets`, `POST /portal/tickets`, `POST /files/presign` | tickets, files, sla_policies | I/C | 5 |
| Convert Ticket to Task | dialog | `ConvertToTasksDialog` | SA, PM, TL, SUP | `POST /tickets/:id/convert-to-tasks` | tasks, tickets | I | 5 |
| Developer incoming queue (3d) | `/support/incoming` | `IncomingQueuePage`, `SlaCountdown`, `AcceptStartActions` | DEV, TL | `GET /tickets/queue?view=incoming|mine`, `POST /tickets/:id/accept`, `/start`, `/escalate` | tickets, ticket_assignments | I | 5 |
| Support routing settings (3a) | `/admin/support-routing` | `RoutingSettingsPage`, `TicketTypeRoutingTable`, `TimersForm` | SA, PM | `GET|PUT /admin/routing-rules` | organization settings | I | 5 |
| Project support ownership (3b) | `/projects/:id/support` | `SupportOwnershipForm`, `ModuleOwnersTable`, `WorkingHoursForm` | SA, PM, TL | `GET|PUT /projects/:id/support-ownership` | support_ownership | I | 5 |
| On-call schedule (3b) | `/projects/:id/on-call` | `OnCallCalendar`, `AvailabilityToggle` | SA, PM, TL | `GET|PUT /projects/:id/on-call`, `PATCH /users/:id/availability` | on_call_schedule, user_availability | I | 5 |
| Recurring issues dashboard (3f) | `/support/recurring` | `problems/pages/RecurringIssuesPage` (delivered: group-by control, frequency bar, distinct-client counts) | SA, PM, TL, SUP (`problem:manage`) | `GET /reports/recurring?by=` | tickets, problems | I | 11 — delivered |
| Problem list (3g) | `/problems` | `problems/pages/ProblemListPage` | SA, PM, TL, SUP, DEV, QA (`problem:read`) | `GET /problems` | problems | I | 11 — delivered |
| Incident list and detail (3g) | `/incidents`, `/incidents/:id` | `problems/pages/IncidentListPage`, `IncidentDetailPage`, `EmergencyFixPanel`, `ClientSummaryComposer` | `incident:read`; writes need `incident:manage` | `GET|POST /incidents`, `GET|PATCH /incidents/:id`, `POST /incidents/:id/*` | incidents, incident_timeline_entries, incident_links | I | 11 — delivered |
| Problem & RCA detail (3g) | `/problems/:id` | `problems/pages/ProblemDetailPage`, `RelatedTicketsCard` (names the clients — the whole panel is internal, and `problem:read` is not `ticket:read`), `RcaForm` (10 questions), `ResolutionCard`, `ProblemActions` (Close disabled with the server's own blocker sentence beneath it) | SA, PM, TL, SUP; DEV submits RCA; QA adds the preventive test | `GET|PATCH /problems/:id`, `POST /problems/:id/*`, `PATCH /rca/:id/approve` | problems, problem_tickets, problem_questions, rca_reports, incidents | I | 11 — delivered |
| Call history (3h) | `/support/calls` | `CallHistoryPage`, `CallRow` | SA, PM, TL, DEV (own), SUP | `GET /calls` | call_logs, callback_queue | I | 8 |
| IVR policy & health (3h) | `/admin/products/:id` | `IvrPolicyCard` (delivered), `ProviderHealthCard` | SA, PM (`ivr:manage`) | `GET|PUT /products/:id/ivr-policy`, `GET /ivr/health` | product_ivr_policies, integration_connections (`provider = IVR`) | I | 9 — delivered |
| Client support history (3h) | `/portal/support` | `ClientSupportHistoryPage` (masked, public summaries only) | CA, CE | `GET /portal/tickets`, `GET /portal/tickets/:id/calls` (delivered: allow-list of time, status, duration) | tickets, call_logs | C | 10 (call endpoint delivered in 9) |

## QA, environments, releases, GitHub (2k–2v)

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Testing assignment detail (2k) | `/qa/:id` | `AssignmentDetailPage`, `TestContextCard`, `CredentialGrantCard` (timed reveal), `BuildStatus` | QA, TL, PM | `GET /qa/assignments/:id`, `POST /grants/:id/reveal` | testing_assignments, credential_grants, credential_access_log | I | 6 |
| Pass/Fail form (2l) | sheet on `/qa/:id` | `TestResultForm`, `SeveritySelect`, `EvidenceUpload` | QA | `POST /qa/assignments/:id/result`, `/clarify` | test_results | I | 6 |
| Test environments (2m) | `/projects/:id/environments` | `EnvironmentsTable`, `EnvironmentForm` | SA, PM, TL | `GET|POST /projects/:id/environments`, `PATCH /environments/:id` | test_environments | I | 3 (data) / 6 |
| Test accounts (2n) | `/projects/:id/test-accounts` | `TestAccountsTable`, `TestAccountPanel`, `RotateButton` | SA, PM (manage), QA (grant) | `GET|POST /projects/:id/test-accounts`, `POST /test-accounts/:id/*` | test_accounts | I | 6 |
| Release list (2r) | `/releases` | `ReleaseListPage`, `ReleaseRow` | SA, PM, TL, QA | `GET /releases` | releases | I | 6 |
| Release detail (2s) | `/releases/:id` | `ReleaseDetailPage`, `IncludedWorkTable`, `ApprovalsList`, `ChecksSummary`, `ReleaseActions` | SA, PM, TL, QA | `GET|PATCH /releases/:id`, `POST /releases/:id/*` | releases, release_items, release_approvals | I | 6 |
| Publish-live confirmation (2t) | dialog | `PublishConfirmDialog` (typed version) | publishers | `POST /releases/:id/publish` | releases | I | 6 |
| Live verification (2u) | `/qa/:id` (kind LIVE_VERIFICATION) | `LiveVerificationChecklist` | QA, SA | `POST /qa/assignments/:id/verify-live`, `POST /releases/:id/verify-live` | testing_assignments, releases | I | 6 |
| Client UAT approval (2v) | `/portal/approvals/:id` | `UatApprovalPage`, `PlainLanguageSummary`, `Checklist`, approve/request-changes/comment | CA | `GET /portal/uat/:id`, `POST /portal/uat/:id/decide`, `/comments` | uat_requests | C | 6 (API) / 10 (portal UI) |
| GitHub connection (2o) | `/admin/github` | `GithubConnectionPage`, `InstallationCard`, `WebhookStats` | SA, PM | `GET /github/install-url`, `GET /github/installations` | github_installations | I | 7 |
| Repository & branch mapping (2p) | `/projects/:id/github` | `RepoMappingForm`, `RequiredChecksPicker` | SA, PM | `POST /projects/:id/github-link`, `DELETE /github-links/:id` | github_repo_links | I | 7 |
| PR / code-review status (2q) | panel on `/tasks/:id` | `GithubPanel`, `ChecksList`, `DeploymentStatus`, `OverrideChecksDialog` | internal | `GET /tasks/:id/github`, `POST /tasks/:id/override-checks` | github_refs, check_overrides | I | 7 |

## Contracts and portal (1j, 1d)

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Contracts list | `/contracts` | `ContractsPage` | SA, PM | `GET /contracts` | contracts | I | 11 |
| Contract detail (1j) | `/contracts/:id` | `ContractDetailPage`, `HoursMeter`, `HourLedger`, `PaymentMilestones`, `ChangeRequestList`, `DocumentsList` | SA, PM, TL (view), SUP (view) | `GET|PATCH /contracts/:id`, `/hours`, `/payment-milestones`, `/change-requests`, `/documents` | contracts, contract_hour_ledger, payment_milestones, change_requests, contract_documents | I | 11 |
| Portal project | `/portal/projects/:id` | `PortalProjectDetailPage`, `PortalPlanPanel`, `ProjectTimeline`, `PortalMilestoneList`, `PublishedUpdates` | CA, CE (hours: CA) | `GET /portal/projects/:id`, `/plan`, `/progress`, `/updates` | projects, milestones, client_updates, contracts | C | 10 |
| Portal tickets | `/portal/tickets`, `/portal/tickets/:id` | `PortalTicketsPage`, `PortalTicketPage`, `ReplyComposer` | CA, CE | `GET|POST /portal/tickets`, `GET /portal/tickets/:id`, `POST …/replies` | tickets, comments (CLIENT) | C | 10 |
| Portal approvals & decisions | `/portal/approvals` | `ApprovalsPage`, `ApprovalRow` | CA | `GET /portal/approvals`, `POST /portal/approvals/:id/decide` | approval_requests | C | 10 |
| Portal contract | `/portal/contracts/:id` | `PortalContractPage` | CA | `GET /portal/contracts` | contracts | C | 10/11 |
| Portal releases | `/portal/releases` | `PortalReleasesPage` (client notes only) | CA, CE | `GET /portal/releases` | releases | C | 10 |

## Admin (2e–2i, 2w)

| Screen | Route | Main components | Roles | API | Entities | Vis | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin dashboard (2e) | `/admin` | `AdminHomePage`, `AdminNav`, `PreviewAsMenu` | SA | `POST /admin/preview-as` | audit_logs | I | 2 |
| Companies & clients (2f) | `/admin/organizations` | `OrganizationsPage`, `OrganizationPanel` | SA | `GET|POST /organizations`, `PATCH /organizations/:id` | organizations | I | 3 |
| Projects & products (2g) | `/admin/projects` | `AdminProjectsPage`, `ProjectSettingsPanel` (release policy, UAT, publishers) | SA, PM | `GET|POST /projects`, `GET|POST /products`, release policy | projects, products, project_release_policy | I | 3 |
| Teams & users (2h) | `/admin/users`, `/admin/teams` | `UsersPage`, `UserPanel` (role, tester flag, show-Development toggle), `TeamsPage` | SA (CA: own users) | `GET|POST /users`, `PATCH /users/:id`, `PATCH /admin/users/:id/settings`, `GET|POST /teams` | users, organization_memberships, teams | I | 2 |
| Roles & permissions (2i) | `/admin/roles` | `RolesMatrixPage` | SA | `GET /roles`, `PATCH /roles/:id/permissions`, `GET /permissions` | roles, permissions, role_permissions | I | 2 |
| Work settings (categories, status labels, ticket categories, SLA rules, testers) | `/admin/work-settings` | `WorkSettingsPage`, `CategoryTable`, `StatusLabelTable`, `SlaRulesTable`, `TesterAssignment` | SA | `/admin/task-categories`, `/admin/status-labels`, `/admin/ticket-categories`, `/admin/sla-policies`, `/admin/testers` | task_categories, task_status_labels, sla_policies | I | 4/5 |
| Branding | `/admin/branding` | `BrandingPage`, live preview via `applyBrandingToDocument` (pkg/ui) | SA | `PATCH /admin/branding`, `POST /files/presign` | organizations.settings, files | I | 3 |
| Notifications settings | `/admin/notifications` | `NotificationSettingsPage` | SA | `GET|PUT /notification-prefs` (org defaults) | notification_prefs | I | 12 |
| Audit log + detail (2w) | `/admin/audit` | `AuditLogPage`, `AuditDetailPanel` | SA, PM (team) | `GET /audit-logs` | audit_logs | I | 11 |
| Profile & preferences | `/profile` | `ProfilePage`, `NotificationPreferences`, `SessionsList` (remote logout) | all | `GET /auth/me`, `PATCH /users/:id`, `GET|PUT /notification-prefs`, refresh-family revoke | users, notification_prefs, refresh_tokens | I/C | 1/12 |

## Mobile (1m, 2x, Architecture Plan §20 — later phase)

All 20 mobile screens reuse the endpoints above; the only additions are push-device registration
and offline drafts on the device. Mapping is kept in the Architecture Plan §20.2 until the mobile
phase starts.

## Dashboard cards and their destinations

A KPI card is a promise: the number on it and the list it opens must be the same rows, for the
same person, at the same moment. The destinations live in one file,
`apps/web/src/features/dashboard/card-links.ts`, and every one of them is asserted against the
API in `apps/api/test/dashboard-links.e2e-spec.ts` — the KPI from `GET /dashboard` must equal the
`total` the destination reports.

Three rules keep them honest:

1. **Scope belongs to the view, narrowing belongs to a filter.** `overdue=true`,
   `completedToday=true` and `resolvedToday=true` narrow whatever the view selected; they never
   decide who the rows belong to. An organization-wide card links to `view=all&overdue=true`, a
   team card to `view=team&overdue=true`, a personal card to `view=overdue`.
2. **Count, do not measure.** A KPI is a `count`, never the length of a card list that was
   fetched with a `take`, or the two disagree as soon as there are more rows than the cap.
3. **One definition per concept.** "Open work" is `OPEN_TASK_STATUSES`, "my team" is
   `teamMemberIds()`, "SLA at risk" is `slaTicketWhere('at-risk')`, "today" is `todayUtc()` — the
   dashboards and the list endpoints import the same ones rather than restating them.
