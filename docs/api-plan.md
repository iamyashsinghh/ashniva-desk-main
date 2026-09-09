# API plan

Base URL `/api/v1`. JSON. Swagger UI at `/api/docs`, OpenAPI JSON at `/api/docs/json` —
**served outside production only**, because the document is a complete map of every endpoint and
every DTO shape. A production-mode deployment that genuinely wants it sets `API_DOCS_ENABLED=true`.

One route sits outside `/api/v1`: `GET /api/metrics`, the Prometheus scrape endpoint, which is
version-neutral because a scrape configuration outlives an API version. It requires
`Authorization: Bearer $METRICS_TOKEN`, and answers 404 when no token is configured.

## Conventions

- **Auth:** `Authorization: Bearer <access token>` on every route except those marked `@Public()`.
  Refresh via `POST /auth/refresh` (opaque rotating refresh token, httpOnly cookie for the web).
- **Permissions:** declared per route with `@RequirePermissions('resource:action')` (keys in
  `packages/types`); scope (own / team / public) enforced in services.
- **Errors:** always `ApiErrorResponse` — `{ statusCode, error, message, details?, requestId, timestamp, path }`.
  Validation failures: 400 with `details[{ field, message }]`. Unique violations: 409. Missing: 404.
  Unexpected: 500 with a generic message (details only in server logs, keyed by `requestId`).
- **Pagination:** cursor based — `?cursor=&limit=` (default 25, max 100) → `{ items, nextCursor, total? }`.
- **Search and filters:** `?q=`, `?filter[status]=`, `?sort=`.
- **Versioning:** URI (`/api/v1`); breaking changes get `/api/v2` controllers.
- **Rate limiting:** global per-IP (env configured); stricter `@Throttle()` on login, reset, webhooks.
- **Request ids:** `X-Request-Id` accepted and echoed; logged with every line.
- **Client portal:** `/api/v1/portal/*` served by separate controllers returning client DTOs.
- **Webhooks:** `/github/webhooks`, `/ivr/webhooks/:provider` — signature verified, idempotent by
  delivery id, processed through BullMQ.
- **Real-time:** Socket.IO namespace `/ws` (token in `auth.token`).

## Implemented (Phase 0 + Phase 1 + Phase 2)

Every route below requires a bearer token unless marked public; detail responses of tasks and
tickets carry an `actions[]` array (`{ action, enabled, reason }`) so screens render exactly what
the workflow allows.

| Area | Routes |
| --- | --- |
| Health, branding (public) | `GET /health/live` (liveness), `GET /health` (readiness: database, Redis, storage, queues, realtime — 503 when any is down), `GET /branding?organization=slug`, `GET /branding/logo?organization=slug` |
| Branding administration | `GET|PATCH /admin/branding`, `GET /admin/branding/theme-source` (`branding:manage`). The theme is a versioned token document; where it comes from is `THEME_PROVIDER=local|remote` — see `docs/theme-manager-integration.md`. |
| Auth | `POST /auth/login` (throttled), `POST /auth/refresh` (cookie), `POST /auth/logout`, `POST /auth/switch-organization`, `GET /auth/me` |
| Users | `GET|POST /users`, `GET /users/directory`, `GET|PATCH /users/:id`, `POST /users/:id/activate|deactivate`, `POST /users/me/change-password` |
| Organizations, teams, roles | `GET|POST /organizations`, `GET|PATCH /organizations/:id`, `GET|POST /teams`, `GET|PATCH /teams/:id`, `PUT /teams/:id/members`, `GET /roles` |
| Projects | `GET|POST /projects`, `GET|PATCH /projects/:id`, `PUT /projects/:id/members` |
| Tasks | `GET /tasks?view=my|by-me|team|today|overdue|review|done|all` (plus the orthogonal `overdue=true` and `completedToday=true` narrowing filters), `POST /tasks`, `GET /tasks/categories`, `GET|PATCH /tasks/:id`, `POST /tasks/:id/assign|start|block|unblock|submit|review|reopen|cancel`, `POST /tasks/:id/comments`, `POST /tasks/:id/work-logs`, `GET /work-logs` |
| Client updates | `GET /client-updates`, `PATCH /client-updates/:id`, `POST /client-updates/:id/publish|withdraw` |
| Files | `POST /files` (multipart), `GET /files`, `GET /files/:id/download`, `DELETE /files/:id` |
| Tickets | `GET /tickets?view=open|new|mine|waiting|critical|sla-at-risk|sla-breached|resolved|all` (plus the orthogonal `resolvedToday=true` filter), `POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/assign|start|wait-client|resume|review|resolve|close|reopen|cancel|convert`, `POST /tickets/:id/comments` |
| Reports, dashboards, audit | `GET /reports/daily`, `GET /reports/daily/team`, `GET /reports/daily/history`, `GET /dashboard` (shape depends on the caller's role), `GET /audit-logs` |
| Client portal | `GET /portal/home`, `GET /portal/projects`, `GET /portal/projects/:id`, `GET /portal/updates`, `GET /portal/files`, `GET|POST /portal/tickets`, `GET /portal/tickets/:id`, `POST /portal/tickets/:id/reply|close|reopen` |
| Auth (Phase 2) | `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET|POST /auth/invitations/:token`, `POST /auth/reauth` (returns a short-lived token sent back in `x-reauth-token`) |
| Contracts and hours | `GET|POST /contracts`, `GET|PATCH /contracts/:id`, `POST /contracts/:id/archive`, `GET /contracts/:id/ledger`, `POST /contracts/:id/hours` (re-auth), `POST /contracts/:id/periods/close`, `GET|POST /contracts/:id/payment-milestones`, `PATCH|DELETE /contracts/:id/payment-milestones/:paymentId` |
| Milestones | `GET|POST /milestones`, `GET|PATCH|DELETE /milestones/:id`, `POST /milestones/:id/status|progress`, `POST /milestones/:id/deliverables`, `PATCH /milestones/:id/deliverables/:deliverableId` |
| SLA | `GET|POST /sla/policies`, `GET|PATCH|DELETE /sla/policies/:id`, `GET /sla/tickets/:ticketId/events`, `POST /sla/monitor/run` |
| Change requests | `GET|POST /change-requests`, `GET|PATCH /change-requests/:id`, `POST /change-requests/:id/comments`, `POST /change-requests/:id/submit|start-internal-review|send-to-client|request-changes|reject|schedule|complete|cancel|reopen-draft|generate-tasks` |
| Approvals | `GET|POST /approvals`, `GET|PATCH /approvals/:id`, `POST /approvals/:id/send-to-internal-review|return-to-draft|publish|withdraw` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/:id/read`, `GET|PUT /notifications/preferences`, `POST /notifications/jobs/deliver|reminders` |
| Advanced reports | `GET /reports/advanced`, `GET /reports/advanced/:type`, `GET /reports/advanced/:type/export` (CSV, audited) |
| Roles and user roles | `GET|POST /roles` (re-auth), `GET /roles/permissions`, `GET|PATCH|DELETE /roles/:id` (re-auth), `GET /roles/:id/history`, `POST /users/:id/invitations`, `POST /users/:id/role` (re-auth) |
| Client portal (Phase 2) | `GET /portal/contracts`, `GET /portal/contracts/:id`, `GET /portal/milestones`, `GET|POST /portal/change-requests`, `GET|PATCH /portal/change-requests/:id`, `POST /portal/change-requests/:id/comments|submit|cancel|approve|request-changes|reject`, `GET /portal/approvals`, `GET /portal/approvals/:id`, `POST /portal/approvals/:id/approve|request-changes|reject`, `GET /portal/reports`, `GET /portal/reports/:type`, `GET /portal/reports/:type/export` |

## Planned endpoints (from Architecture Plan §6 and §19.4), by implementation order

Items already delivered in Phases 1 and 2 are listed above; the entries below keep the full plan.

1. **Authentication and tenant isolation** — `POST /auth/login`, `/auth/refresh`, `/auth/logout`,
   `/auth/forgot`, `/auth/reset`, `/auth/invite/accept`; organization selection for multi-org users.
2. **Users, teams, roles** — `GET|POST /users`, `PATCH /users/:id`, `POST /users/:id/roles`,
   `PATCH /admin/users/:id/settings`, `GET|POST /teams`, `POST /teams/:id/members`, `GET /roles`,
   `POST /roles`, `PATCH /roles/:id/permissions`, `GET /permissions`, `POST /admin/preview-as`.
3. **Companies, products, projects** — `GET|POST /organizations`, `GET|PATCH|DELETE /organizations/:id`,
   `PATCH /admin/branding`, `GET|POST /products`, `GET|POST /products/:id/releases`,
   `GET|POST /projects`, `GET|PATCH /projects/:id`, `POST /projects/:id/members`,
   `GET /projects/:id/summary`, `GET|POST /projects/:id/milestones`, `PATCH /milestones/:id`,
   `GET|POST /projects/:id/environments`, `PATCH /environments/:id`.
4. **Tasks, work logs, reports** — `GET /tasks?view=my|assigned_by_me|team|today|overdue|completed_today&layout=list|board|calendar`,
   `POST /tasks`, `GET|PATCH /tasks/:id`, `POST /tasks/:id/{assign,start,block,dev-complete,request-review,approve,reject,ready-for-qa,send-for-testing,override-checks,reopen,cancel,duplicate,recurrence}`,
   `GET /tasks/:id/history`, `GET|POST /tasks/:id/comments`, `POST /tasks/:id/dependencies`,
   `GET|POST /work-logs`, `PATCH|DELETE /work-logs/:id`, `GET /client-updates`,
   `PATCH /client-updates/:id`, `POST /client-updates/:id/{publish,reject}`,
   `GET /reports/{developer,senior,tester}`, `GET /reports/project/:id`, `GET /reports/:id/export.pdf`,
   `GET /dashboards/{admin,senior,developer,tester,support}`, `POST /files/presign`,
   `POST /files/:id/complete`, `GET /files/:id/url`, `GET /notifications`, `POST /notifications/read-all`,
   `PATCH /notifications/:id/read`, `GET|PUT /notification-prefs`.
5. **Tickets and automatic assignment** — `GET|POST /tickets`, `GET|PATCH /tickets/:id`,
   `POST /tickets/:id/{assign,status,accept,start,escalate,reassign,convert-to-tasks,resolve,reopen,route}`,
   `GET|POST /tickets/:id/replies`, `GET /tickets/:id/activity`, `GET /tickets/queue?view=incoming|mine|sla`,
   `GET|PUT /projects/:id/support-ownership`, `GET|PUT /admin/routing-rules`, `GET|PUT /projects/:id/on-call`,
   `PATCH /users/:id/availability`, `/admin/sla-policies`, `/admin/ticket-categories`.
6. **Testing, staging and release** — `GET /qa/assignments?view=…`, `GET /qa/assignments/:id`,
   `POST /qa/assignments/:id/{start,result,clarify,verify-live}`, `GET|POST /projects/:id/test-accounts`,
   `PATCH /test-accounts/:id`, `POST /test-accounts/:id/{grant,rotate,reset-data}`, `POST /grants/:id/reveal`,
   `GET /credential-access-log`, `GET|POST /releases`, `GET|PATCH /releases/:id`,
   `POST /releases/:id/{items,request-approval,approve,schedule,publish,verify-live,rollback}`,
   `GET /releases/:id/notes.pdf`.
7. **GitHub** — `GET /github/install-url`, `POST /github/webhooks`, `GET /github/installations`,
   `GET /github/installations/:id/repos`, `POST /projects/:id/github-link`, `DELETE /github-links/:id`,
   `POST /github-links/:id/resync`, `GET /tasks/:id/github`.
8. **IVR, calls, callbacks** — `POST /ivr/webhooks/:provider`, `POST /ivr/calls/outbound`,
   `POST /ivr/calls/:id/{accept,transfer,no-answer,callback,disposition}`, `GET /ivr/health`,
   `GET /calls?ticket|client|agent`, `GET /portal/tickets/:id/calls`.
9. **Recurring issues, incidents, RCA** — `GET /tickets/:id/similar`,
   `POST /tickets/:id/similar/:candidateId/decide`, `GET|POST /problems`, `GET|PATCH /problems/:id`,
   `POST /problems/:id/{tickets,request-rca,rca,ask-developer,assign-fix,preventive-test,close}`,
   `GET /reports/recurring?by=product|module|version|severity`, `POST /incidents`,
   `POST /incidents/:id/approve-emergency-fix`.
10. **Client portal** — `GET /portal/dashboard`, `GET /portal/projects`, `GET /portal/projects/:id`,
    `GET /portal/projects/:id/updates?range=today|week`, `GET|POST /portal/tickets`,
    `GET /portal/tickets/:id`, `POST /portal/tickets/:id/replies`, `GET /portal/contracts`,
    `GET /portal/approvals`, `POST /portal/approvals/:id/decide`, `GET /portal/releases`,
    `GET /portal/uat`, `GET /portal/uat/:id`, `POST /portal/uat/:id/{decide,comments}`.
11. **Contracts and SLA reporting** — `GET|POST /contracts`, `GET|PATCH /contracts/:id`,
    `GET /contracts/:id/hours`, `POST /contracts/:id/hours/adjust`,
    `GET|POST /contracts/:id/{payment-milestones,change-requests,documents}`, `GET|POST /approvals`,
    `POST /approvals/:id/decide`, `GET /audit-logs`.
12. **Notifications** — email/WhatsApp channels, digests (same endpoints as 4 plus channel settings).
13. **Mobile** — no new endpoints; push-token registration `POST /devices`, `DELETE /devices/:id`.

## Socket events

`task.updated`, `ticket.updated`, `notification.new`, `update.published` on rooms `org:{id}`,
`project:{id}`, `user:{id}`.
