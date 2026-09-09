# Ashniva Desk Interactive Prototype

_Started 2026-09-02 09:19 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Design and develop a simple IT Project, Task, Ticket, Contract and Client Work T"
The project currently has no files except possibly dotfiles — a `list_files` on the project root would return nothing else.
Current date is now September 2, 2026
</system-info>

<default aesthetic_system_instructions>
The user has not attached a design system. If they have ALSO not attached references or art direction, and the project is empty (the auto-managed _ds/ folder doesn't count), ask your opening questions with the ask_user tool. Whenever you ask opening questions in this project, include a design-system question in the form: the user's pick there sets the visual direction, so do NOT also ask about the visual aesthetic (no questions about vibe, colors or palette directions (including color-swatch svg-options questions), typography, mood, or art direction). Spend your other questions on everything else: audience, purpose, content, structure, scope, interactions, tone of copy. Exception: if the request already states the visual direction as a brand or concrete art direction, leave the design-system question out of your own questions (the app may still add one — it's skippable, and a skip doesn't change the stated direction) — but if they name a design system that isn't attached, keep the question: their pick there is what attaches it.

If the design-system question comes back unanswered — skipped without a pick (a "Not sure" / decide-for-me answer counts as a pick: it applies the effective default) — and no references or other art direction arrived either, THEN ask the visual-aesthetic questions before designing: a follow-up round (or one focused question) about vibe, colors, type, and mood is the right move once the design-system ask went unanswered. Do NOT just pick your own. Once you have a direction, use this guidance when creating designs:
- Choose a type pairing from web-safe set or Google Fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are user-authored files in the project already (the auto-managed _ds/ folder is not user-authored).
</default aesthetic_system_instructions>

<pasted_text name="Pasted text (482 lines)">
Design and develop a simple IT Project, Task, Ticket, Contract and Client Work Tracking SaaS.

Around 80% of my developers are MERN developers, so use a TypeScript-based Node.js architecture.

## Mandatory technology stack

* Frontend: React.js with TypeScript
* Build tool: Vite
* Backend: Node.js with NestJS and TypeScript
* Database: PostgreSQL
* ORM: Prisma
* Real-time updates: Socket.IO/WebSockets
* Queue and scheduled jobs: Redis with BullMQ
* Authentication: JWT access and refresh tokens
* File storage: S3-compatible object storage
* API documentation: Swagger/OpenAPI
* Testing: Jest and Supertest
* Deployment: Docker and Docker Compose
* Future mobile app: React Native

Do not use Laravel, PHP or MongoDB for this project.

Although most developers are MERN developers, use PostgreSQL instead of MongoDB because companies, users, projects, contracts, tasks, tickets, permissions and reports have strongly connected relational data.

Use NestJS instead of unstructured Express.js. The backend must have clear modules, controllers, services, DTOs, validation, guards, repositories and tests so multiple developers can work safely.

## Business purpose

My in-house IT team develops:

* Software for our own companies
* Software products that we sell to corporate clients
* Custom CRM, websites, apps and other client projects
* Contract-based development work
* Annual maintenance and software support

The software must track daily tasks, development progress, support tickets, contracts and client-visible work updates.

It must be easy to use and must not create unnecessary reporting work.

## User roles

* Super Admin/Director
* Project Manager
* Team Lead/Senior Developer
* Developer
* Tester/QA
* Support Executive
* Internal Company Employee
* External Corporate Client Admin
* Client Employee

Senior developers currently perform two functions:

1. Assign, review and monitor team tasks.
2. Complete their own development tasks.

The system must track both activities separately. In the future, seniors may only manage their teams.

## Core modules

### 1. Companies and clients

Support multiple organizations:

* Our own group companies
* Corporate software customers
* Contract-development clients
* Support and AMC clients

Each organization can have multiple projects, contracts, software products, users and tickets.

Build proper multi-tenant isolation so no client can access another client’s information.

### 2. Projects

Support:

* Internal product development
* Work for our own company
* Fixed-price client projects
* Monthly development contracts
* AMC and maintenance projects
* Dedicated developer contracts
* Support-only contracts

Project information:

* Name
* Company/client
* Project type
* Description and scope
* Technologies
* Assigned senior
* Team members
* Start and delivery dates
* Milestones
* Priority
* Progress
* Status
* Attachments
* Internal notes
* Client-visible information

### 3. Daily tasks

Use this simple workflow:

Assigned → In Progress → Review/Testing → Completed

Additional statuses:

* Blocked
* Reopened
* Cancelled

Task information:

* Task title and description
* Project and module
* Assigned by and assigned to
* Priority
* Start date and due date
* Estimated and actual time
* Acceptance criteria
* Dependencies
* Attachments
* Internal comments
* Client-visible update
* Reviewer/tester
* Status history

Provide:

* My Tasks
* Tasks Assigned by Me
* Team Tasks
* Today’s Tasks
* Overdue Tasks
* Completed Today
* Kanban view
* List view
* Calendar view

When a developer completes a task, ask only:

* What was completed?
* How much time was spent?
* Add screenshot, file, link or Git reference.
* Should this update be visible to the client?

Automatically create the daily report from task activity. Do not require developers to write the same update again.

### 4. Tickets

Tickets can be raised by:

* Employees of our own companies
* Corporate customers using our software
* Contract clients
* Internal IT team

Ticket types:

* Bug
* Support request
* Change request
* New feature
* Training
* Access issue
* Other

Ticket workflow:

New → Assigned → In Progress → Waiting for Client → Review/Testing → Resolved → Closed

Allow reopened and cancelled statuses.

Ticket information:

* Automatic ticket number
* Company and requester
* Related product or project
* Type and category
* Priority
* Description
* Screenshots, videos and files
* Assigned team and developer
* SLA response and resolution deadline
* Internal comments
* Client-visible replies
* Resolution summary
* Complete activity history

Allow a ticket to be converted into one or multiple development tasks. Keep the ticket and tasks linked.

The client can see progress and public replies but cannot see internal comments or confidential development information.

### 5. Contracts

Support:

* Fixed-price contracts
* Monthly retainers
* AMC
* Support-hour contracts
* Dedicated developer contracts

Track:

* Contract period
* Scope
* Included hours
* Used and remaining hours
* Milestones and deliverables
* Change requests
* Payment milestones
* Renewal date
* Expiry date
* Contract documents

### 6. Client portal

Clients must see only their own:

* Active projects
* Contract information
* Milestones
* Overall progress
* Work currently in progress
* Work completed today
* Work completed this week
* Tickets
* Releases
* Change requests
* Files requiring approval
* Pending decisions
* Included, used and remaining support hours

When the team completes a client-visible task, automatically add it to “Completed Today.”

Allow a senior or project manager to approve the update before publishing it to the client.

Never show clients:

* Internal comments
* Internal estimates
* Employee performance
* Internal costs
* Profit information
* Private attachments
* Information belonging to another client

### 7. Automatic daily reports

Generate reports automatically from task and ticket activity.

Developer report:

* Worked on today
* Completed today
* Pending
* Blocked
* Time spent

Senior report:

* Work assigned
* Team progress
* Tasks completed
* Tasks under review
* Delayed work
* Blockers
* Senior’s own development work

Project report:

* Overall progress
* Milestone progress
* Completed work
* Pending work
* Delayed tasks
* Open tickets
* Upcoming deadlines

### 8. Dashboards

Create separate dashboards for:

* Super Admin/Director
* Senior/Team Lead
* Developer
* Tester
* Support Executive
* Client

The Super Admin dashboard should show:

* Active projects
* Projects at risk
* Work completed today
* Team workload
* Overdue tasks
* Critical tickets
* Pending reviews
* Client approvals
* Contract renewals

### 9. Notifications

Provide in-app notifications and prepare integrations for email and WhatsApp.

Notify users about:

* New task
* Due date
* Overdue task
* Review request
* Rejected review
* New ticket
* Ticket reply
* SLA risk
* Client approval
* Contract expiry

Allow users to control notification preferences and prevent excessive notifications.

## UI requirements

The interface must be:

* Simple and professional
* Easy for developers and non-technical clients
* Responsive
* Fast
* Minimal-click
* Suitable for desktop, tablet and mobile
* Clear about internal and client-visible information

Important quick actions:

* Create Task
* Assign Task
* Start Work
* Send for Review
* Approve
* Reject with Comment
* Mark Completed
* Raise Ticket
* Add Client Update
* Publish Update

Do not copy Jira’s complexity. Avoid unnecessary fields, screens and manual reporting.

## Architecture requirements

Create a modular NestJS backend with modules such as:

* Auth
* Users
* Organizations
* Teams
* Roles and Permissions
* Products
* Projects
* Milestones
* Tasks
* Tickets
* Contracts
* Work Logs
* Client Updates
* Approvals
* Files
* Notifications
* Reports
* Audit Logs

Use a monorepo structure with separate frontend, backend and shared packages.

Suggested structure:

* `apps/web`
* `apps/api`
* `packages/ui`
* `packages/types`
* `packages/config`

Implement:

* Role-based and permission-based access
* Tenant-level data isolation
* Secure API validation
* Rate limiting
* Audit logs
* Soft deletion
* Pagination, search and filtering
* Database transactions
* Background jobs
* Error logging
* API versioning
* Automated tests
* Database migrations and seed data

Create reusable React components, but do not build one oversized component.

Use strict TypeScript and do not use `any` unless technically unavoidable and documented.

## Development phases

### Phase 1—MVP

* Authentication
* Users and roles
* Companies
* Teams
* Projects
* Tasks
* Review/testing workflow
* Tickets
* Automatic daily reports
* Basic dashboards
* Client portal
* Client-visible updates
* Audit history

### Phase 2

* Contracts
* Milestones
* Support-hour tracking
* SLA tracking
* Client approvals
* Notifications
* Advanced reports
* Change requests

### Phase 3

* GitHub/GitLab integration
* Email and WhatsApp integration
* Automatic release notes
* Billing and invoicing
* React Native mobile app
* AI-generated progress summaries

## Required process

Do not start full coding immediately.

First inspect any existing project files. Then provide:

1. Complete user flow
2. Screen list
3. Role and permission matrix
4. Module architecture
5. PostgreSQL database schema
6. API endpoint plan
7. NestJS folder structure
8. React component structure
9. Wireframes for the main screens
10. Phase-wise development plan

Design these screens first:

* Super Admin dashboard
* Senior dashboard
* Developer dashboard
* Client dashboard
* Project detail
* Task board
* Task detail
* Ticket list
* Ticket detail
* Contract detail
* Completed Today page
* Reports page


  The company is new, and we have not finalized its logo, brand colours or visual identity yet. For now, use a temporary text-based logo and a professional neutral colour palette suitable for an IT SaaS company. Keep the branding configurable so we can later upload our logo and change the primary, secondary and accent colours from Admin Settings without redesigning the software. Do not hardcode the temporary logo or colours throughout the project.

Wait for my approval after presenting the architecture and designs. Do not begin full implementation until I approve them.

</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Design Components">
This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.
</attached-skill>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant



## Assistant

_[tool: ask_user]_

Waiting on your answers — product name, fidelity, doc format, and target device mainly. Then I'll deliver the architecture plan and the 12 screen designs for approval before any implementation.

## User

Answered — product_name: Ashniva Desk; fidelity: Both; deliverable_format: One printable doc; primary_device: Desktop + mobile; team_size: 25; client_count: 10; region: India, IST (Asia/Kolkata), INR (₹), DD/MM/YYYY format. English interface initially.; copy_tone: Plain & terse; extra: Clients may be non-technical, so keep the interface extremely simple. Use temporary “Ashniva Desk” text branding and a neutral professional colour palette. Branding must remain configurable from Admi…

## Assistant

_[tool: read_skill_prompt]_

_[tool: read_skill_prompt]_

_[tool: read_skill_prompt]_

_[tool: read_skill_prompt]_

_[tool: copy_starter_component]_

_[tool: update_todos]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_write]_

## Assistant

_[tool: list_files]_

_[tool: grep]_

_[tool: read_file]_

_[tool: dc_write]_

Now screens 1b (Senior) and 1c (Developer).

_[tool: dc_html_str_replace]_

Screens 1d (Client) and 1e (Project detail).

_[tool: dc_html_str_replace]_

Screens 1f (Task board) and 1g (Task detail + completion sheet).

_[tool: dc_html_str_replace]_

Screens 1h (Ticket list) and 1i (Ticket detail).

_[tool: dc_html_str_replace]_

Screens 1j (Contract) and 1k (Completed Today).

_[tool: dc_html_str_replace]_

Screen 1l (Reports) and three mobile screens.

_[tool: dc_html_str_replace]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

Three files are out for your review:

- **Ashniva Desk - Architecture Plan** — printable doc: user flows, screen list, permission matrix, module architecture, Prisma/Postgres schema, API plan, NestJS + React folder structures, phase plan, and 5 open decisions at the end.
- **Ashniva Desk - Wireframes** — 12 low-fi screens (1a–1l).
- **Ashniva Desk - Hi-fi Screens** — same 12 screens at desktop (1a–1l) plus 1m: three mobile screens (task completion, ticket reply, client progress).

Key design calls to confirm: green CLIENT / grey INTERNAL badges everywhere; four-question completion sheet feeding reports and the client's "Completed Today"; senior dashboard split into Management vs Development; slate-blue primary on warm grey as the placeholder brand (Admin → Branding swaps it).

No implementation started. Reply with approval or changes, plus answers to the open decisions in section 10 of the doc.

## User

Found issues — fixing…

## User

Found issues — fixing…

## Assistant

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: show_html]_

_[tool: save_screenshot]_

Renders cleanly. Checking the other two files for issues.

_[tool: show_html]_

_[tool: save_screenshot]_

The doc links use em-dash filenames but files were saved with hyphens — fixing those broken links.

_[tool: run_script]_

_[tool: ready_for_verification]_

Fixed the cross-links in the Architecture Plan doc (they pointed at the wrong filenames). All three files are open for your review; awaiting your approval and answers to the open decisions before implementation.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Code blocks now wrap and tables are fixed-width, so the doc stays inside the page for print. Out for re-check.

## User

<pasted_text name="Pasted text (545 lines)">
The Ashniva Desk designs are good, but do not start development yet. Update the plan and create high-fidelity designs for all missing workflows below.

The final software must remain extremely simple. Use basic fields first and keep optional fields under “More Options.”

# 1. Simple task creation

Design a “Create Task” form that can be completed in under 30 seconds.

Show these fields first:

* Task title
* Company/client
* Project
* Assign to
* Due date
* Priority
* Description

Put these under “More Options”:

* Task category
* Module
* Estimated hours
* Reviewer
* Tester
* Dependencies
* Acceptance criteria
* Attachments
* Client-visible setting
* Milestone
* GitHub repository

Provide:

* Create Task
* Create and Assign
* Save as Draft
* Create Another
* Duplicate Task
* Recurring Task

# 2. Simple ticket creation

Design a “Raise Ticket” form for:

* Employees of our own companies
* External corporate clients
* Client employees
* Support executives
* Internal IT employees

Initially show:

* Related software/project
* Problem title
* Description
* Priority
* Screenshot, video or file

Automatically capture:

* Ticket number
* Requester
* Company
* Date and time
* Source
* Applicable SLA

Place category, affected module, browser/device and technical details under “More Options.”

Provide a “Convert Ticket to Task” action. The ticket and task must remain linked.

Customers must not see:

* Internal comments
* Developer discussions
* Technical investigation
* Time estimates
* Internal costs
* Private files

# 3. Manager and senior daily tasks

Project Managers, Team Leads and Senior Developers must also have assignable daily tasks.

Task categories should include:

* Development
* Management
* Review
* Testing
* Planning
* Client Meeting
* Team Follow-up
* Release Approval
* Documentation
* Administrative

Create “My Tasks Today” for every role, including managers.

For seniors who currently code, show two clearly separated sections:

* My Management Tasks
* My Development Tasks

Management work can include:

* Assign work
* Review completed work
* Prepare project plan
* Speak with client
* Resolve blockers
* Approve release
* Check delayed work
* Prepare weekly plan

Management activity and development activity must appear separately in daily reports.

Later, when a senior stops coding, Admin must be able to hide the Development section without creating a new role.

# 4. Simple Admin section

Design simple Admin screens for:

* Companies and clients
* Projects and products
* Teams and departments
* Employees and users
* Roles and permissions
* Task categories
* Task statuses
* Ticket categories
* SLA rules
* Testers and QA assignment
* GitHub connections
* Test environments and test accounts
* Branding
* Notifications
* Audit logs

Avoid a complicated Admin interface.

Allow Admin to preview the system as:

* Developer
* Manager
* Tester
* Internal Employee
* Client Admin
* Client Employee

# 5. Complete development and testing workflow

Replace the simplified workflow with:

Assigned → In Progress → Development Completed → Code Review → Ready for QA → Testing on Staging → QA Passed → Client UAT if required → Ready to Publish → Published Live → Live Verification → Completed

Failure flow:

QA Failed → Returned to Developer → Fix Submitted → Retest

If a live verification fails:

Live Verification Failed → Rollback/Hotfix Required → Developer Fix → Retest → Republish

A developer must not publish directly to production merely by marking a task completed.

# 6. Tester/QA dashboard

Create a dedicated Tester/QA dashboard showing:

* Assigned to Me
* Ready for Testing
* Testing Today
* Failed and Returned
* Waiting for Retest
* Passed Today
* Client UAT Pending
* Live Verification Pending
* Overdue Tests

Each testing assignment must contain:

* Related task and ticket
* Project
* What was developed
* What needs to be tested
* Expected result/acceptance criteria
* Staging URL
* Test account access
* Browser/device requirements
* Developer notes
* GitHub Pull Request
* Automated test/build result
* Testing deadline

# 7. Simple testing form

The tester should be able to record:

* Result: Pass or Fail
* Environment: Staging or Production
* What was tested?
* Actual result
* Failure description
* Browser/device
* Screenshot/video/file
* Comment for developer
* Retest required
* Severity if failed

Provide one-click actions:

* Start Testing
* Pass
* Fail and Return
* Request Clarification
* Retest
* Verify Live

If testing fails, automatically return the task to the developer with the tester’s reason and evidence.

# 8. Staging and test accounts

Create a “Test Environments” section for each project.

Store:

* Development URL
* Staging URL
* Production URL
* Environment status
* Latest deployed version
* Last deployment time

For each project, authorized Admin or Project Manager can create reusable test accounts such as:

* Test Super Admin
* Test Admin
* Test Manager
* Test Employee
* Test Customer
* Test Vendor
* Other custom roles

Recommended process:

1. Admin or Project Manager creates the role-based test accounts once.
2. The system reuses them for future testing.
3. When work is sent to QA, Ashniva Desk automatically selects the required test account.
4. The tester receives secure temporary access.
5. The password may automatically rotate after testing.
6. Test data may be reset automatically.

Allow manual credentials only when a special test account is required.

Do not create a new username and password for every task unless necessary.

Never use real production customer credentials for testing.

Do not display passwords in email, WhatsApp notifications, task comments or GitHub commits. Provide a secure “Reveal Temporary Password” or “Generate Temporary Access” action with expiry, access logging and permission control.

# 9. How the tester receives the assignment

When a developer’s staging deployment succeeds and the work is ready:

1. Developer clicks “Send for Testing.”
2. Ashniva Desk checks that the staging build succeeded.
3. Developer selects or confirms the tester.
4. A testing assignment is created automatically.
5. It appears in the tester’s QA Dashboard.
6. Tester receives an in-app notification.
7. Optional email/WhatsApp notification contains a secure link, but no password.
8. Tester opens the assignment and securely accesses the test environment and credentials.

If GitHub Actions provides the staging URL and deployment information, populate it automatically. Otherwise, allow the developer or manager to enter it manually.

# 10. GitHub integration

Connect Ashniva Desk to GitHub using a GitHub App, official APIs and signed webhooks.

Avoid using one shared personal access token for the whole company.

Allow each project to connect:

* GitHub organization
* Repository
* Default branch
* Development branch
* Staging branch/environment
* Production branch/environment

Automatically link tasks with:

* Branches
* Commits
* Pull Requests
* Code reviews
* Automated checks
* Workflow runs
* Staging deployments
* Production deployments
* Releases

Allow developers to include the Ashniva Desk task ID in a branch, commit or Pull Request, for example:

* `AD-124-login-otp`
* `Fixes AD-124`

The task should display:

* Repository
* Branch
* Latest commits
* Pull Request
* Reviewer
* Merge status
* Automated checks
* Staging deployment
* Production deployment

# 11. GitHub Actions and automated testing

GitHub Actions should automatically run applicable checks such as:

* Build
* Linting
* Unit tests
* API tests
* Integration tests
* Security checks
* Deployment checks

Show the result inside Ashniva Desk:

* Pending
* Running
* Passed
* Failed
* Cancelled

Do not allow “Ready for QA” when mandatory automated checks have failed, unless an authorized manager provides an override reason.

Automated testing does not replace manual QA. The tester must still verify the user workflow on staging.

# 12. Code review

After development:

1. Developer opens a Pull Request.
2. The assigned senior receives a review task.
3. Senior reviews the code.
4. Senior can Approve or Request Changes.
5. Failed review returns the task to the developer.
6. Approved code can deploy to staging.
7. Tester then receives the QA assignment.

Keep code-review comments in GitHub, but show the review status and link inside Ashniva Desk.

# 13. Release and live publishing

Create a Release section containing:

* Release/version number
* Project
* Tasks and tickets included
* Staging URL
* GitHub branch/tag
* Pull Requests included
* Automated check results
* QA results
* Client UAT status
* Planned publishing date and time
* Approved by
* Published by
* Production URL
* Deployment result
* Rollback version
* Release notes

Provide these controlled actions:

* Create Release
* Add Task to Release
* Request Approval
* Schedule Publishing
* Publish to Production
* Verify Live
* Roll Back

Only authorized roles should be able to publish to production.

Use project-level settings to decide who can approve:

* Senior Developer
* Project Manager
* QA Lead
* Client
* Director/Admin

# 14. Client UAT

Client UAT should be optional per project or release.

If enabled, the client receives:

* Simple explanation of the completed work
* Staging preview link
* What they need to check
* Approve
* Request Changes
* Add Comment

Do not provide clients with development credentials, GitHub links, internal comments or technical deployment details.

# 15. Live verification

Publishing successfully does not automatically complete a task or close a ticket.

After production deployment:

1. Create a live-verification assignment.
2. Tester performs a short smoke test.
3. Tester confirms the main feature works.
4. If passed, mark the release verified.
5. Then complete related tasks and resolve/close applicable tickets.
6. If failed, begin rollback or hotfix workflow.

# 16. Customer-visible statuses

Customers should see only simple statuses:

* Received
* Assigned
* In Development
* Under Testing
* Awaiting Your Approval
* Scheduled for Release
* Published Live
* Completed

Do not show customers internal statuses such as code-review failure, automated-test failure, rollback details or private developer discussions.

# 17. Daily reports

Generate reports automatically from activities.

Developer report:

* Development tasks worked on
* Tasks submitted for review
* Changes requested
* Fixes submitted
* Time spent

Manager/Senior report:

* Management tasks completed
* Work assigned
* Reviews completed
* Blockers resolved
* Approvals completed
* Personal development work, if any

Tester report:

* Tests assigned
* Tests completed
* Passed
* Failed
* Retested
* Live verifications
* Pending tests

Project report:

* Development progress
* Code-review status
* QA status
* Client UAT status
* Releases
* Production deployments
* Failed and reopened tasks

Do not require users to prepare duplicate manual daily reports.

# 18. Technical and security corrections

Also correct these technical issues before development:

* Remove any duplicate database-table definitions.
* Use strong multi-tenant protection, including tenant-scoped services and automated cross-tenant security tests.
* Use PostgreSQL Row-Level Security where practical.
* Ensure database uniqueness rules work correctly when nullable dimension fields exist.
* Store secrets, GitHub tokens and test credentials encrypted.
* Maintain audit logs for task changes, credential access, QA results, approvals, deployments and overrides.
* Use least-privilege GitHub App permissions.
* Verify signed GitHub webhook payloads.
* Prevent duplicate webhook processing using idempotency controls.
* Never expose production secrets through the frontend.
* Do not allow customers to access other clients, repositories or internal information.

# 19. Missing high-fidelity screens

Create high-fidelity responsive designs for:

1. Create Task
2. Assign Task
3. Raise Ticket
4. Manager’s My Tasks Today
5. Admin dashboard
6. Company/client management
7. Project management
8. Team and user management
9. Roles and permissions
10. Tester/QA dashboard
11. Testing assignment detail
12. Pass/Fail testing form
13. Test environments
14. Test-account management
15. GitHub connection
16. Repository and branch mapping
17. Pull Request/code-review status
18. Release list
19. Release detail
20. Publish-live confirmation
21. Live verification
22. Client UAT approval
23. Audit-log detail

Create desktop designs for all screens and mobile designs for the most frequently used actions:

* Create/assign a task
* Raise a ticket
* Complete a task
* Review a task
* Pass/fail testing
* Reply to a ticket
* Client UAT approval
* Live verification

Keep the existing good Ashniva Desk visual direction. Do not redesign the entire approved interface unnecessarily.

First update the planning specification and show these missing designs. Wait for my approval. Do not begin coding yet.

</pasted_text>

## Assistant

Updating the plan spec first, then building the 23 new screens in a v2 file.

_[tool: str_replace_edit]_

Now the v2 screens file — forms first (2a–2d).

_[tool: dc_write]_

Admin screens 2e–2i.

_[tool: dc_html_str_replace]_

QA screens 2j–2n.

_[tool: dc_html_str_replace]_

GitHub screens 2o–2q.

_[tool: dc_html_str_replace]_

Release screens 2r–2w.

_[tool: dc_html_str_replace]_

Finally the 8 mobile screens (2x).

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Out for review — no code written.

**Ashniva Desk - Hi-fi Screens v2** — all 23 screens (2a–2w) plus 2x: eight mobile actions. Grouped: Tasks & Tickets · Admin · QA & Test Environments · GitHub · Releases/UAT/Audit · Mobile.

**Architecture Plan v0.2** — updated in place: new §11 workflow state machine with gates, §12 task categories/manager tasks, §13 QA + secure test accounts, §14 GitHub App, §15 Releases, §16 customer status mapping, §17 Admin, §18 security corrections (duplicate table removed, RLS, partial unique indexes, encrypted secrets, idempotent webhooks); schema, API and screen list extended; phases revised; 4 new open decisions added.

Key calls to confirm:
- Ready for QA is locked by the state machine until review approved + required checks green (manager override, audited).
- Publishing requires all policy approvals + typed version confirmation; tasks complete only after live verification passes.
- Test credentials: one reusable account per role, timed reveal, every access logged; notifications carry links, never passwords.
- Development section hidden per user via Admin toggle, not a new role.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Fixed the four clipped screens (2r release table columns, 2n test-account panel and username column, 2v UAT footer/button, 2w audit table) plus the 2h panel. Out for re-check; still awaiting your approval and answers to the open decisions before any coding.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Side panels in 2f/2h/2n now hold their width (tables shrink instead), and the two mobile footers fit. Out for re-check.

## User

Found issues — fixing…

## User

Found issues — fixing…

## User

Found issues — fixing…

## Assistant

Root cause: too many columns for the ~430px table beside a panel. Decisive fix: cut the tables to three columns each (2f: Company · Type · Portal; 2n: Role · Username · State).

_[tool: run_script]_

_[tool: ready_for_verification]_

Reduced the 2f and 2n tables to three columns each so the primary column (company / username) has room beside the open panel. Out for re-check.

## User

The current output contains static screenshots, so I cannot properly inspect the complete workflow.

Convert the approved Ashniva Desk designs into a fully clickable high-fidelity prototype.

Every visible interactive element must work, including:

* Sidebar menus
* Dashboard cards
* Tabs
* Filters
* Search
* Dropdowns
* Create Task
* Assign Task
* Raise Ticket
* Convert Ticket to Task
* Start Work
* Block Task
* Send for Review
* Approve or Reject
* Send for Testing
* Pass or Fail Testing
* Retest
* Client UAT
* Create Release
* Publish Live
* Live Verification
* Complete Task
* Close or Reopen Ticket
* Notifications
* Admin Settings
* GitHub connection
* Test-account access
* Reports and exports
* Back, Cancel, Save and Submit buttons

When a button is clicked, it must open the correct page, form, modal, drawer, dropdown or confirmation screen. Do not leave any button as a non-working visual element.

Add realistic sample data so I can test the complete flow:

Create Task → Assign Developer → Developer Completes → Code Review → Staging Deployment → Tester Receives Assignment → Pass/Fail → Client Approval if required → Publish Live → Live Verification → Complete Task and Close Ticket.

Also provide a role switcher so I can preview and click through the system as:

* Super Admin
* Project Manager
* Senior Developer
* Developer
* Tester/QA
* Internal Employee
* Client Admin
* Client Employee

Clearly show disabled buttons and explain why they are unavailable for that role or status.

Provide one main prototype link or starting screen from which I can navigate through every screen. Do not provide only separate screenshots.

This is a design prototype only. Do not begin production backend development yet.

## Assistant

_[tool: read_skill_prompt]_

Building a single clickable prototype with a role switcher and a live workflow engine. Starting with the sample data module.

_[tool: write_file]_

Now the prototype shell and generic renderer.

_[tool: dc_write]_

_[tool: dc_write]_

Now the application logic module (workflow engine, pages, modals).

_[tool: write_file]_

_[tool: snip]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

## Assistant

Wiring the logic class to the pages module, then verifying.

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: show_html]_

Stuck on loading with no logs — the dynamic import likely hasn't resolved (or componentDidMount hasn't fired). Checking after a wait.

_[tool: sleep]_

_[tool: get_webview_logs]_

No import error logged, so the promise probably never resolved or the state update didn't re-render. Let me check via the user view's state.

_[tool: eval_js_user_view]_

Modules load fine, so `componentDidMount` probably isn't being invoked, or `import()` inside the class is being rewritten. I'll load via the helmet instead and poll from renderVals.

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

It's live. Quick pass through the key flow to catch runtime errors before handing off.

_[tool: multi_screenshot]_

_[tool: run_script]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

**Ashniva Desk - Prototype** is the single starting screen — out for review.

How to use it:
- **Role switcher** in the black bar (8 roles, each a named sample user). **Test-flow guide** button lists the step-by-step path through Create Task → Assign → Dev complete → PR/Code review → Staging → QA pass/fail → Client UAT → Release → Publish (type the version) → Live verification → task completes, ticket resolves. **Reset sample data** restores the seed.
- Every button either navigates, opens a modal/drawer, or is shown disabled with the reason beside it (and an "Actions for your role" panel on task, release and QA pages explains each one).
- Workflow gates are enforced in the engine, not the UI: no direct completion of dev tasks, Ready-for-QA locked by checks, publish only by project publishers after approvals, completion only after live verification.
- Admin includes companies, projects (settings/release policy), users (Show Development section toggle), roles matrix, work settings, QA/environments, GitHub connection + repo mapping, live branding (changes colour/name across the app), notifications, audit log with detail, and "Preview as" (banner + audit entry).

Caveats: data is in-memory (resets on reload); email/WhatsApp, file uploads and exports are simulated with toasts. No backend code has been written.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

(That "MISSING" was the intentional no-op probe on the JS file; the template edit itself applied.)

_[tool: snip]_

_[tool: ready_for_verification]_

Fixed all five: release tables use flexible columns (Included work now full-width), all tables scroll horizontally instead of clipping, KPI tiles shrink text for non-numeric values, and the duplicate portal row is gone. Out for re-check.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

Empty-state text now only shows when a table or list is actually empty. Out for re-check.

## User

<pasted_text name="Pasted text (593 lines)">
Now design a complete mobile application for the updated Ashniva Desk IT Project, Task, Ticket, Testing and Release Management Software.

The mobile app must use the same backend, database, users, permissions, projects, tasks, tickets and workflows as the web application. Do not create a separate system or duplicate database.

## Technology

The production mobile app will later be developed using:

* React Native with TypeScript
* Prefer Expo unless a required native integration needs bare React Native
* Existing Node.js/NestJS APIs
* PostgreSQL central database
* Socket.IO for live updates
* Secure token storage
* Push notifications
* Android and iOS support

For now, create only the complete high-fidelity clickable mobile-app design. Do not begin production coding.

## Purpose

The mobile app should focus on frequent daily actions. Complex configuration and large reports can remain primarily on the web application.

The app must be simple, fast and suitable for:

* Super Admin/Director
* Project Manager
* Senior Developer/Team Lead
* Developer
* Tester/QA
* Support Executive
* Internal Company Employee
* Client Admin
* Client Employee

Show different navigation, dashboards and permissions according to the logged-in role.

## Main navigation

Use a simple bottom navigation with a maximum of five primary items:

* Home
* Tasks
* Tickets
* Notifications
* More

Change relevant content according to the role. Do not overcrowd the bottom navigation.

## 1. Login and account

Design:

* Login
* Forgot password
* OTP/MFA verification
* Organization selection if the user belongs to multiple companies
* Secure biometric login
* Profile
* Notification preferences
* Logout
* Session/device management

## 2. Role-based Home screens

### Super Admin/Director

Show a concise overview:

* Active projects
* Projects at risk
* Overdue tasks
* Critical tickets
* Pending reviews
* QA pending
* Releases awaiting approval
* Work completed today

Allow drilling into details, but keep advanced settings on the web.

### Project Manager/Senior

Show:

* My Tasks Today
* My Management Tasks
* My Development Tasks, if enabled
* Tasks Assigned by Me
* Pending code reviews
* Blocked team members
* QA failures
* Client approvals
* Releases awaiting approval
* Team progress today

### Developer

Show:

* My Tasks Today
* In Progress
* Returned for Changes
* Ready for Review
* QA Failed
* Tickets Assigned to Me
* Due Today
* Overdue
* Completed Today

### Tester/QA

Show:

* Ready for Testing
* Testing Today
* Failed and Returned
* Waiting for Retest
* Passed Today
* Client UAT Pending
* Live Verification Pending
* Overdue Tests

### Support Executive

Show:

* New Tickets
* Unassigned
* Assigned to Me
* SLA at Risk
* Waiting for Customer
* Resolved Today

### Client/Internal Employee

Show:

* My Tickets
* Raise Ticket
* Active Projects
* Work Completed Today
* Updates Awaiting Approval
* Releases

## 3. Create and assign tasks

Design a mobile task form that can be completed in under 30 seconds.

Show initially:

* Task title
* Company/client
* Project
* Assign to
* Due date
* Priority
* Description

Place optional fields under “More Options”:

* Task category
* Module
* Estimate
* Reviewer
* Tester
* Dependencies
* Acceptance criteria
* Attachments
* Client visibility
* Milestone
* GitHub repository

Actions:

* Save Draft
* Create Task
* Create and Assign
* Create Another

Support voice-to-text for the description where available.

## 4. Developer task workflow

Task detail should show:

* Title and description
* Project
* Priority and due date
* Acceptance criteria
* Attachments
* GitHub branch, commits and Pull Request
* Reviewer and tester
* Complete activity timeline

Actions:

* Start Work
* Pause Work
* Add Update
* Add Comment
* Attach Screenshot/File
* Mark Blocked
* Send for Review
* Request Clarification

When sending for review, ask:

* What was completed?
* Time spent
* Proof: screenshot, file, link or Git reference
* Should this update be visible to the client?

Automatically generate the daily work record.

## 5. Manager’s work

Managers must be able to receive and complete their own daily tasks.

Separate:

* My Management Tasks
* My Development Tasks

Management task types:

* Assignment
* Review
* Planning
* Client Meeting
* Team Follow-up
* Release Approval
* Documentation
* Administrative

Provide fast manager actions:

* Assign Task
* Reassign
* Change Due Date
* Approve
* Reject with Reason
* Resolve Blocker
* Select Reviewer
* Select Tester
* Approve Release

## 6. Tickets

Design an extremely simple Raise Ticket form for customers and internal employees.

Initially show:

* Related software/project
* Problem title
* Description
* Priority
* Screenshot/video/file

Automatically capture requester, company, date, source and ticket number.

Ticket detail should include:

* Status
* SLA
* Public conversation
* Attachments
* Updates
* Resolution

Internal staff can also see separate tabs:

* Public Reply
* Internal Note
* Linked Tasks

Actions:

* Assign
* Reply
* Add Internal Note
* Convert to Task
* Change Status
* Resolve
* Close
* Reopen

Customers must never see internal notes, development discussions, estimates or private attachments.

## 7. Code review and GitHub

Show GitHub information inside each linked task:

* Repository
* Branch
* Commits
* Pull Request
* Automated checks
* Reviewer
* Merge status
* Staging deployment
* Production deployment

Senior actions:

* Open Pull Request in GitHub
* Approve
* Request Changes
* Send to Staging

Do not display GitHub secrets or production credentials.

## 8. Tester/QA workflow

When staging deployment succeeds, create and send a testing assignment to the selected tester.

The testing assignment must show:

* Related task/ticket
* What was developed
* What must be tested
* Expected result
* Staging URL
* Secure test-account access
* Browser/device requirements
* Developer notes
* GitHub build status
* Deadline

Tester actions:

* Start Testing
* Open Staging
* Reveal Temporary Access
* Pass
* Fail and Return
* Add Screenshot/Video
* Request Clarification
* Retest
* Verify Live

Test form:

* Pass or Fail
* Staging or Production
* What was tested
* Actual result
* Failure description
* Browser/device
* Severity
* Attachment
* Comment for developer

A failed test must return the task to the developer automatically.

## 9. Test credentials

Provide secure test-account access:

* Admin or Project Manager creates reusable test accounts.
* System selects the appropriate account for the tester.
* Tester taps “Reveal Temporary Access.”
* Require biometric, OTP or password confirmation.
* Log who accessed the credential and when.
* Allow copying username/password.
* Automatically hide it again.
* Support expiry and automatic password rotation.

Never send passwords through push notification, email, WhatsApp, comments or GitHub.

## 10. Releases and publishing

Design:

* Release list
* Release detail
* Tasks and tickets included
* Automated checks
* QA results
* Client UAT
* Scheduled release time
* Approvers
* Deployment status
* Production URL
* Rollback version
* Release notes

Authorized actions:

* Approve Release
* Reject
* Schedule
* Publish Live
* Confirm with OTP/biometric
* Verify Live
* Roll Back

Publishing must require clear confirmation. Do not allow accidental one-tap production deployment.

## 11. Client UAT

If client approval is required, show the client:

* Plain-language change description
* Preview/staging link
* What needs to be checked
* Approve
* Request Changes
* Add Comment

Do not show GitHub, credentials, technical failures or internal comments.

## 12. Completed Today

Client view:

* Features completed today
* Issues fixed
* Releases published
* Updates awaiting approval

Internal view:

* Employee
* Task
* Project
* Time spent
* Review status
* QA status
* Client visibility
* Release status

## 13. Notifications

Provide push and in-app notifications for:

* Task assigned
* Due date approaching
* Task overdue
* Review requested
* Changes requested
* Staging ready
* Testing assigned
* QA passed or failed
* Client approval required
* Release approval required
* Deployment completed or failed
* Live verification required
* New ticket
* Ticket reply
* SLA risk

Notifications must deep-link directly to the relevant task, ticket, test or release.

Avoid excessive notifications and allow preferences.

## 14. Mobile files and evidence

Allow:

* Camera photo
* Video
* Screenshot
* Document upload
* Gallery
* Link
* Git reference
* Voice note where enabled

Compress large images/videos and display upload progress.

## 15. Offline and network handling

Provide limited offline support:

* View recently opened tasks
* Draft comments
* Draft test results
* Draft ticket replies
* Upload automatically when internet returns

Clearly show:

* Offline
* Syncing
* Synced
* Failed to Sync

Never allow production publishing while offline.

## 16. Security

Include:

* Role-based permissions
* Tenant-level isolation
* Biometric lock
* Secure token storage
* Automatic session expiry
* Screenshot protection for credentials where supported
* Audit logs
* Remote logout
* Device/session management
* Confirmation for sensitive actions

All permissions must be enforced by the backend, not only hidden in the app.

## 17. Required clickable mobile flows

Create fully clickable prototypes for:

### Developer

Login → My Tasks → Start Work → Add Update → Link GitHub Work → Send for Review

### Manager

Login → Management Tasks → Create and Assign Task → Review Developer Work → Approve → Send to Staging

### Tester

Login → QA Dashboard → Open Testing Assignment → Open Staging → Access Test Account → Fail with Evidence → Developer Fixes → Retest → Pass

### Release

QA Passed → Client UAT if required → Approve Release → Publish Confirmation → Published Live → Live Verification → Complete

### Customer

Login → Raise Ticket → Track Status → Reply → View Published Fix → Confirm Resolution

### Support

Open New Ticket → Assign → Convert to Development Task → Reply to Customer → Track QA and Release → Close Ticket

## 18. Required mobile screens

Design:

1. Splash screen
2. Login
3. OTP/MFA
4. Role-based Home
5. My Tasks
6. Team Tasks
7. Create Task
8. Task Detail
9. Send for Review
10. Review Task
11. Tickets
12. Raise Ticket
13. Ticket Detail
14. QA Dashboard
15. Testing Assignment
16. Test Result
17. Test Credentials
18. GitHub Activity
19. Releases
20. Release Detail
21. Publish Confirmation
22. Live Verification
23. Client UAT
24. Completed Today
25. Notifications
26. Search
27. Profile
28. Settings
29. Offline/Sync Status

## 19. Prototype requirement

Every visible button must work in the prototype.

When clicked, it must open the relevant screen, modal, bottom sheet, dropdown, confirmation or state.

Provide a role switcher so I can preview the prototype as every role.

Include:

* Loading states
* Empty states
* Error states
* Success states
* Permission-denied states
* Offline states
* Failed-upload states
* Confirmation screens

Provide a final checklist listing every button and its connected action.

Keep the same approved Ashniva Desk branding, terminology and design system as the web application. Do not create a visually unrelated mobile app.

Show me the complete clickable mobile prototype before starting React Native development.

</pasted_text>

## Assistant

Building the mobile prototype on the same data, workflow engine and modals as the web prototype (shared `proto-data.js` / `proto-core.js` / `proto-modals.js`), so both stay one system.

_[tool: write_file]_

Now the mobile DC template (phone frame + side panel + sheets).

_[tool: dc_write]_

_[tool: show_html]_

Boots. Quick check of the key flow screens for runtime errors.

_[tool: multi_screenshot]_

Flows render cleanly (the side-panel select appearing as "Super Admin" is the known screenshot artifact). Handing off.

_[tool: snip]_

_[tool: ready_for_verification]_

**Ashniva Desk - Mobile Prototype** — out for review.

What it is:
- One phone (390×844) running the same data, workflow engine, permissions and sheets as the web prototype — shared `proto-data/core/modals` files, so nothing is duplicated. Side panel: role switcher (9 roles incl. Support), **Simulate offline**, **Show login flow**, test-flow guide, reset, and the full **button checklist**.
- Auth: splash → login (password or Face ID) → OTP (any 6 digits; `000000` shows the error state) → organization picker for multi-org users.
- Role-based Home + 5-tab bottom nav (labels change per role: QA / Approvals / Raise). All 29 requested screens are reachable: tasks (list/board, chips, search), create task sheet with More options + dictation, task detail with pause/attach/blocked/send-for-review, GitHub Activity, review actions, tickets with Public/Internal/Linked tabs, QA dashboard, testing assignment with biometric-gated 60-second credential reveal, test result sheet (fail auto-returns), releases, release detail, publish confirmation (typed version + Face ID, blocked offline), success screen, live verification, client UAT, completed today (client/internal), notifications with deep links, search, profile, settings (sessions/remote logout), offline & sync queue.
- States covered: loading, empty, error (OTP), success, permission-denied (disabled + reason list per screen), offline banner, failed uploads with retry, confirmations.

Caveat: in-memory data resets on reload; camera/voice/push are simulated.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: snip]_

_[tool: ready_for_verification]_

Role switch now resets task/ticket view chips, layout and search so each role lands on its default view. Out for re-check.

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Product design requirements checklist"
What `list_files` on the project root returns right now (dotfiles, if any, are not shown here):
📁 scraps
📁 screenshots
📄 Ashniva Desk - Architecture Plan.dc.html
📄 Ashniva Desk - Hi-fi Screens v2.dc.html
📄 Ashniva Desk - Hi-fi Screens.dc.html
📄 Ashniva Desk - Mobile Prototype.dc.html
📄 Ashniva Desk - Prototype.dc.html
📄 Ashniva Desk - Wireframes.dc.html
📄 doc-page.js
📄 proto-core.js
📄 proto-data.js
📄 proto-mobile.js
📄 proto-modals.js
📄 proto-pages.js
📄 support.js
User is viewing file: Ashniva Desk - Mobile Prototype.dc.html
Current date is now September 5, 2026
</system-info>

<pasted_text name="Pasted text (266 lines)">
Update the existing Ashniva Desk planning documents, web prototype and mobile prototype. Do not create a separate product or redesign unrelated screens.

Add a complete but simple **Smart Support Routing, Recurring Issue Detection, Root-Cause Analysis and IVR Support module**.

## 1. Product and project support ownership

Whenever we create a client project or sell a software product such as HR, CRM, hospital billing or another SaaS product, allow the administrator to configure:

* Primary support developer
* Backup developer
* Responsible senior/team lead
* Assigned tester/QA
* Support executive
* Module-wise developers
* Working hours
* On-call schedule
* Developer workload limit
* Response and resolution SLA
* Escalation timing

Keep this setup simple. Show essential settings first and place advanced routing rules under “More settings.”

## 2. Direct ticket assignment

Tickets may arrive through:

* Client portal
* Mobile app
* Internal employee portal
* API from another CRM
* IVR phone call
* Email or WhatsApp integration in the future

When a technical ticket is raised, automatically identify:

* Client
* Product or project
* Module
* Ticket type
* Priority
* Current product version
* Responsible developer
* Developer availability
* Developer workload
* Contract and SLA

Technical bugs, outages and performance problems should be assigned directly to the responsible or on-call developer.

Training, billing, general enquiries and basic access requests may go to the support team. Allow the administrator to configure which ticket types go directly to developers.

Clients must never select individual developers or see their personal phone numbers.

## 3. Acknowledgement and escalation

After automatic assignment:

* Notify the assigned developer immediately.
* Notify the responsible senior/manager.
* Start the acknowledgement and SLA timers.
* Provide Accept Ticket and Start Work buttons.
* If the developer does not acknowledge within the configured time, escalate to the backup developer.
* If the backup also does not respond, escalate to the senior or project manager.
* Allow reassignment only with a compulsory reason.
* Record every assignment, acknowledgement, escalation and reassignment in the audit history.

## 4. Recurring and duplicate issue detection

Detect whether a similar problem has been reported by other clients using:

* Product and module
* Error message
* Product version
* Browser, device or operating system
* Description and keywords
* Logs and error codes
* AI-assisted similarity matching

The system must suggest possible duplicates, but an authorised user must confirm before tickets are merged or linked.

Show warnings such as:

“This issue has been reported by 4 clients using version 2.3.”

Never reveal one client’s identity or information to another client.

Allow related tickets to be linked under a single **Problem or Incident record** while each client retains their own ticket and private communication.

## 5. Root-cause analysis

When the same issue crosses a configurable threshold, automatically create a Problem/Incident and notify the senior/manager.

Provide actions:

* View Related Tickets
* Link as Duplicate
* Create Problem
* Request RCA
* Ask Developer for Explanation
* Assign Permanent Fix
* Add Preventive Test
* Close Problem

The developer’s RCA form should contain:

* What happened?
* Why did it happen?
* Which clients and versions were affected?
* Which release, pull request or change introduced it?
* Temporary workaround
* Permanent solution
* How will recurrence be prevented?
* Tests added
* Responsible owner
* Target completion date

Provide a Recurring Issues dashboard showing issues by product, module, version, severity and frequency.

## 6. IVR direct-to-developer integration

Create an IVR integration architecture using a provider adapter so Tata IVR can be connected first and other IVR providers can be added later.

When a customer calls:

1. Identify them using their registered phone number, customer ID, product, project or ticket number.
2. Open an existing ticket or automatically create a new ticket.
3. Determine the assigned or on-call developer.
4. Show the developer a screen pop containing the client, product, ticket and previous history.
5. Connect the call through the company IVR without exposing either party’s personal number.
6. If the developer does not answer, route to the backup developer, senior or callback queue.
7. Attach call time, duration, outcome, recording reference and notes to the ticket.
8. Obtain appropriate consent before recording.
9. After the call, require only a quick disposition, public summary, internal note and next action.

Provide:

* Call Client Through IVR
* Accept Incoming Support Call
* Request Callback
* Mark No Answer
* Transfer to Backup
* Add Call Notes
* Link Call to Ticket
* Create Ticket from Call

Do not allow unrestricted calls to individual developers. Respect working hours, on-call schedules, leave status and workload.

## 7. Development and testing workflow

A developer must not close a technical ticket immediately after coding.

Use this workflow:

New → Auto-assigned → Acknowledged → In Progress → Code Review → Staging Deployment → Ready for QA → QA Passed/Failed → Optional Client UAT → Approved for Release → Production Deployment → Live Smoke Test → Resolved → Closed

If QA fails, return the linked task to the developer with test evidence.

If the live smoke test fails, reopen the issue and start an urgent incident workflow.

Allow emergency production fixes only with senior approval and complete audit history.

## 8. Ticket and task connection

Allow one ticket to create one or multiple development tasks.

Keep tickets, tasks, pull requests, deployments, test results, calls and client updates linked together.

Clients should see:

* Ticket status
* Public replies
* Expected next update
* Work in progress
* Resolution summary
* Their call history

Clients must not see:

* Internal comments
* RCA discussions
* Developer performance
* Other clients
* Internal costs
* Private logs
* Personal phone numbers
* GitHub secrets or confidential code

## 9. Required screens

Design and add:

* Support Routing Settings
* Product/Project Support Ownership
* On-Call Schedule
* Developer Incoming Ticket Queue
* Senior SLA and Escalation Dashboard
* Ticket Detail with IVR Panel
* Recurring Issues Dashboard
* Problem/Incident List
* Problem and RCA Detail
* Call History
* IVR Configuration and Health
* Client Support History
* Tester/QA Queue
* Release and Live Verification screen

Update both desktop and mobile prototypes.

## 10. Mobile app

The mobile app should allow authorised users to:

* Receive new-ticket push notifications
* Accept a ticket
* Start work
* Call the customer through IVR
* Add public or internal notes
* Upload screenshots, video or logs
* View related duplicate issues
* Send work for review
* View staging information
* Pass or fail testing
* Escalate urgent incidents
* View today’s assigned support work

Use “Device biometrics” instead of only “Face ID” so Android and iOS are supported.

## 11. Security and architecture

Add modular NestJS components for:

* Ticket Routing
* Support Ownership
* On-Call Scheduling
* SLA and Escalations
* IVR Integrations
* Call Logs
* Problem Management
* RCA
* Incident Management

Use signed and idempotent webhooks, background queues, retry handling, rate limiting, encryption, audit logs and tenant-level isolation.

Permissions must be enforced by the backend, not merely by hiding buttons.

## Required prototype scenarios

Make the clickable prototype demonstrate:

1. A client raises a technical ticket and it goes directly to the correct developer.
2. The developer does not respond and the ticket escalates.
3. The same bug is reported by several clients and becomes a Problem/Incident.
4. A senior requests an RCA from the developer.
5. An IVR call automatically creates a ticket and connects to the on-call developer.
6. A missed call creates a callback task.
7. The developer completes the fix and sends it through review, staging and QA.
8. QA fails and returns it to the developer.
9. QA passes, production is deployed and a live smoke test completes the ticket.

Every visible button, filter, tab, dropdown and action must be clickable and must produce the correct state change. Include loading, empty, error, offline, unavailable-developer, SLA-breach and permission-denied states.

First present the revised workflow, permission matrix, database changes, API changes and updated screen list. Then update the wireframes, hi-fi screens and clickable web/mobile prototypes.

Do not begin full backend coding until I approve the updated designs.

When exporting, include every required project file, including `support.js`, shared data files, page modules, mobile modules and assets. Do not provide incomplete HTML files with missing dependencies.

</pasted_text>

## Assistant

_[tool: snip]_

_[tool: update_todos]_

_[tool: str_replace_edit]_

Now the support module (engine + web pages + mobile screens in one file).

_[tool: update_todos]_

_[tool: write_file]_

Now wiring: seed augment, raise-ticket hook, page registration in web + mobile.

_[tool: run_script]_

_[tool: show_html]_

Script aborted atomically (nothing written). The web-pages support dashboard anchor differs; I'll locate it and rerun.

_[tool: grep]_

Web has no support-role dashboard (support falls back to developer). I'll drop that edit and add a small support dashboard instead.

_[tool: run_script]_

_[tool: show_html]_

Stuck on loading — likely a module error. Checking logs.

_[tool: get_webview_logs]_

_[tool: read_file]_

_[tool: grep]_

The syntax error is at line 105 col 0 — i.e. line 104's end. Let me check the tail of line 104.

_[tool: run_script]_

_[tool: eval_js_user_view]_

_[tool: eval_js_user_view]_

Per-line parsing is noisy for multi-line blocks. Let me bisect by cumulative prefix instead.

_[tool: eval_js_user_view]_

_[tool: eval_js_user_view]_

_[tool: eval_js_user_view]_

My bisect is unreliable with string closers. Simplest robust fix: rewrite `ownership()` in a clearer multi-statement form.

_[tool: run_script]_

_[tool: eval_js_user_view]_

Parses now. Quick smoke of the key flows (routing, escalation, IVR, problems) before handing off.

_[tool: show_html]_

_[tool: multi_screenshot]_

_[tool: get_webview_logs]_

_[tool: show_html]_

Working — clock advanced, ticket escalated (L1 badge). My test step just failed on nav text with a badge. Continuing checks on problems + IVR.

_[tool: multi_screenshot]_

_[tool: multi_screenshot]_

IVR call → screen pop → missed call → callback task + ticket detail with routing panel all work. Now the hi-fi turn 3 and wireframe turn 2 (compact), then export.

_[tool: snip]_

_[tool: update_todos]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

_[tool: present_fs_item_for_download]_

_[tool: update_todos]_

Out for review. What changed (v0.3):

**Plan** — new §19 in the Architecture Plan: revised ticket workflow with routing/ack/escalation, permission additions, schema (ownership, on-call, assignments, similarity, problems, RCA, incidents, IVR, call logs, callbacks), API and module list, screen list, Phase 2b.

**Prototypes** (one shared engine, `proto-support.js`, used by web and mobile):
- Raise a Bug/Performance/Outage/Access ticket → routed to module owner → primary → on-call → backup (Arjun on leave is skipped and recorded); other types go to the support queue. Ticket routing rules editable in Admin → Support routing.
- **SLA & escalations** dashboard: "Advance clock +15 min" expires ack timers → L1 backup → L2 senior, all audited; Accept / Start work (creates the linked task, ticket then follows the full QA/release chain) / Escalate (reason + incident flag) / Reassign (reason compulsory).
- Similar-issue detection by module/version/keywords with the "reported by N clients on version X" warning; 3 clients auto-creates a Problem; Problem detail has Request RCA, Ask developer, Submit RCA (10 questions), Assign fix, Preventive test, gated Close. Recurring Issues dashboard by product/module/version/severity.
- IVR: Simulate incoming call → identify caller (unknown → support queue) → match/create ticket → screen pop (Accept / Transfer / No answer → callback task + senior notified) → in-call → 4-field wrap-up; Call client through IVR from any ticket, hours/leave enforced; Call history, IVR config & health, client support history (masked, public summaries only).
- Mobile: Support work today, incoming queue, IVR sheets, problems/RCA, SLA screen; "Device biometrics" wording.

**Designs** — Hi-fi v2 turn 3 (3a–3h, all 14 screens grouped) and Wireframes turn 2.

Full project zip above includes `support.js` and every module.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: run_script]_

_[tool: snip]_

_[tool: ready_for_verification]_

Header right column is now capped at 45% with wrapping reason text, and the "Complete" reason is shorter, so titles no longer get squeezed. Fixed in the web prototype (the zip above predates this one-line fix; re-export on request).

## User

<system-info comment="Only acknowledge these if relevant">
User is viewing file: Ashniva Desk - Mobile Prototype.dc.html
</system-info>

<pasted_text name="Pasted text (207 lines)">
Also update the existing **Ashniva Desk mobile app and clickable mobile prototype** with the complete Smart Support Routing, IVR, Recurring Issue Detection, RCA, Testing and Release workflow described above.

Do not create a separate mobile system. The web platform and React Native mobile app must use the same NestJS backend, PostgreSQL database, users, roles, permissions, tickets, tasks, calls and audit history.

## Role-based mobile experience

### Client user

Allow clients to:

* Raise a technical or support ticket
* Select their product/project and affected module
* Add description, screenshots, video, voice note and files
* Set urgency and business impact
* Request an immediate call or scheduled callback
* View ticket status and public replies
* View call history
* Reopen a resolved ticket
* Confirm that the issue is resolved

Clients must never select a particular developer or see personal phone numbers, internal notes, RCA discussions, GitHub information or other clients.

### Developer

Create an Incoming Support screen where developers can:

* Receive push notifications for new tickets
* Accept or acknowledge a ticket
* Start work
* View SLA countdown
* Call the client securely through IVR
* Request a callback
* Add a public reply or internal note
* Upload screenshots, logs and evidence
* Convert the ticket into one or more tasks
* Link a commit, branch or pull request
* Identify or confirm a duplicate issue
* Escalate to a senior
* Send the fix for code review
* Send the completed build to staging and QA

Show the developer only tickets assigned to them, their team or their on-call queue.

### Senior/Manager

Allow seniors and managers to:

* Monitor all unacknowledged and SLA-risk tickets
* View available, busy, absent and on-call developers
* Reassign tickets with a compulsory reason
* Contact the client through IVR
* Group similar tickets into a Problem/Incident
* Ask the developer for an explanation
* Request and review an RCA
* Approve emergency fixes
* Approve staging and production release
* Monitor the developer’s support work separately from development tasks
* View recurring issues by product, module and version

### Tester/QA

Provide a mobile QA queue containing:

* Ready for QA tickets and tasks
* Staging URL
* Secure staging test-account access
* Acceptance criteria
* Test checklist
* Related bug and previous failure history
* Build, branch and pull-request references

The tester must be able to:

* Start Testing
* Pass Test
* Fail Test
* Add failure reason
* Upload screenshot or video evidence
* Return to Developer
* Approve for Release
* Complete the post-production smoke test

Never display permanent passwords in plain text. Use secure, temporary staging access or an authorised reusable test-account reference.

### Support Executive

Allow support executives to manage training, account, access, billing and non-technical enquiries. They may transfer a technical issue to the automatic developer-routing system.

### Admin

Provide a simple mobile Admin view for:

* Primary and backup developer mapping
* Product/module ownership
* On-call schedule
* SLA and escalation rules
* Routing status
* IVR integration health

Keep advanced configuration mainly on the desktop system.

## IVR mobile flow

When the client calls the company IVR:

1. Identify the client through their registered number, customer ID or ticket number.
2. Create a new ticket or open the existing ticket.
3. Find the responsible or on-call developer.
4. Send the developer an app notification containing the ticket context.
5. Connect both parties through Tata IVR or another configured provider.
6. Keep both phone numbers hidden.
7. If unanswered, route to the backup developer, senior or callback queue.
8. Save the call time, duration, result, recording reference and notes in the ticket.

Include these mobile actions:

* Accept Support Call
* Call Through IVR
* Schedule Callback
* Transfer to Backup
* Mark No Answer
* Add Call Notes
* Link Call to Ticket
* Create Ticket from Call

The app must not behave as an independent telephone system. All calls must be initiated and bridged securely through the backend and configured IVR provider.

## Recurring issue and RCA flow

When similar tickets are detected, show:

“Possible recurring issue—reported by 4 clients.”

Allow authorised internal users to:

* View anonymised related-ticket count
* Confirm Duplicate
* Link to Existing Problem
* Create New Problem
* Request RCA
* Assign Permanent Fix

Never reveal one client’s details to another client.

Create a simple mobile RCA form containing:

* What happened?
* Why did it happen?
* Affected versions
* Temporary workaround
* Permanent fix
* Prevention plan
* Tests added
* Owner and due date

## Required workflow

Use this complete mobile workflow:

New → Auto-assigned → Acknowledged → In Progress → Code Review → Staging → Ready for QA → QA Passed/Failed → Optional Client UAT → Release Approval → Production → Live Smoke Test → Resolved → Closed

Development completion must not automatically mean production completion.

## Required mobile screens

Design:

1. Role-based Home dashboard
2. My Support Tickets
3. Incoming Ticket alert
4. Raise Ticket
5. Ticket Detail
6. IVR Call and Callback
7. Recurring Issue warning
8. Problem/Incident Detail
9. RCA form
10. Senior Escalation Queue
11. Tester/QA Queue
12. Test Detail
13. Release Approval
14. Live Smoke Test
15. Call History
16. On-Call Schedule
17. Notifications
18. Simple Mobile Admin

## Mobile design requirements

* Design for Android and iOS.
* Use responsive layouts for 360px, 390px and 412px widths.
* Do not use a fixed 390 × 844 canvas as the actual app layout.
* Respect safe areas and device font scaling.
* Use at least 44px touch targets.
* Use proper labels and accessibility support.
* Use “Device biometrics,” not only “Face ID.”
* Store tokens using iOS Keychain or Android Keystore.
* Provide loading, empty, error, offline and permission-denied states.
* Allow offline drafting of notes and tickets, then sync safely.
* Disable IVR calling while offline and explain why.
* Make internal and client-visible information unmistakably different.
* Keep forms short and show advanced fields only when requested.
* Every visible button, tab, filter and menu must be clickable.

Create working prototype scenarios for ticket assignment, developer acknowledgement, escalation, IVR calling, duplicate detection, RCA request, QA failure, QA approval, production release and live verification.

First show the updated mobile user flow and screen list. Then produce responsive hi-fi screens and a complete clickable mobile prototype. Wait for my approval before writing the full React Native application.

</pasted_text>

## Assistant

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: write_file]_

_[tool: run_script]_

_[tool: grep]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Mobile prototype updated — out for review.

**Flow + screen list**: Architecture Plan §20 (mobile flows per role, IVR flow, 20-screen list).

**Prototype additions** (same shared engine as web):
- Side panel: **device width 360 / 390 / 412** (layout is fluid inside the frame) and **Simulate new-ticket push** → incoming alert sheet (Accept / View / Snooze) with inline "Possible recurring issue — reported by N clients" warning.
- Client: raise ticket now asks business impact and "Want us to call you?" (creates a callback for the routed developer); ticket detail has **Request a call / callback** (disabled offline with reason), reopen, confirm resolution, call history with public summaries only.
- Developer: SLA countdown, Accept, Start work, Call through IVR, **Link commit / branch / PR**, duplicate confirm/link/create, escalate, send for review → staging → QA (existing chain).
- Senior/Manager: **Team availability** (available / busy / absent / on-call, mark absent), **Approve emergency fix** (incident tickets, reason, audited), Recurring issues screen, SLA & escalations, RCA request/review.
- Tester: **Approve for release** after Pass; failure history, staging access unchanged.
- Support executive: **Route to developer (auto)** hands a support-queue ticket to automatic routing.
- **Mobile admin**: primary/backup mapping, module ownership, SLA/escalation rules, routing status, IVR health.

Re-export the project zip when you're ready to hand off — say the word.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: snip]_

_[tool: ready_for_verification]_

IVR calling is now disabled while offline (web + mobile, including "Call now" in queues and "Accept call" on the screen pop) with the reason shown: calls are bridged by the backend IVR — reconnect or request a callback.

