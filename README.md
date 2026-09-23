# Ashniva Desk

IT project, task, ticket, contract, client support, IVR and work tracking — a multi-tenant SaaS for
an in-house IT team that builds software for its own group companies and for corporate clients.

**Status: feature-complete, pending operational validation.** Every planned package is merged —
the MVP; operations (contracts and a support-hour ledger, milestones, SLA, change requests, client
approvals, notifications, advanced reports, custom roles, row-level security); integrations
(GitHub and GitLab, release notes, email, WhatsApp, billing and invoices, AI summaries); releases
and QA; the role dashboards including the Manager/TL operational board and the client progress
board; products, smart support routing and support ownership; IVR; internal communication;
recurring issues, problems, RCA and incidents; the mobile app; the embedded support SDK with
outbound callbacks and support-tier behaviour; and the Theme Manager integration.

What remains is not application code: the Tata IVR production adapter is blocked on provider
details ([docs/tata-ivr-handoff.md](docs/tata-ivr-handoff.md)); a restore drill and a load test
need running on production-shaped infrastructure; and the production environment — secrets,
infrastructure and a deployment mechanism — does not exist yet. Releases are manual against
[docs/release-checklist.md](docs/release-checklist.md); there is no CD pipeline.

## Stack

React 19 + TypeScript + Vite · NestJS 11 + TypeScript · PostgreSQL 16 + Prisma 7 · Redis + BullMQ ·
Socket.IO · JWT access/refresh tokens · S3-compatible storage (MinIO locally) · Swagger/OpenAPI ·
Jest + Supertest (API), Vitest + Testing Library (web) · Docker Compose · GitHub Actions ·
pnpm workspaces. React Native (Expo) later.

## Repository layout

```
apps/api          NestJS API (Prisma schema, migrations, seed, modules)
apps/web          React web application
apps/mobile       React Native (Expo) phone app for staff and clients
packages/types    Shared enums, workflow statuses, roles, permissions, API contracts
packages/ui       Design tokens (CSS variables) + reusable React components
packages/config   Shared tsconfig and ESLint presets
docs/             Product, architecture, database, API, security, testing, phases, developer guide
docs/design-reference  Approved Claude Design export (plan, wireframes, hi-fi screens, prototypes)
```

## Quick start

Requirements: Node 22+, pnpm 10+ (`corepack enable`), Docker with Compose.

```bash
pnpm install
cp .env.example .env                      # docker compose settings (optional, defaults work)
cp apps/api/.env.example apps/api/.env    # API settings
docker compose up -d                      # PostgreSQL, Redis, MinIO (+ bucket)
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1 · Swagger: http://localhost:3000/api/docs · Health: `/api/v1/health`
- MinIO console: http://localhost:9001 (user/password from `.env.example`)
- Sign in: http://localhost:5173/login with one of the demo accounts below.

### Demo accounts (fictional, development only)

The seed creates these accounts with the password from `SEED_USER_PASSWORD` (default
`ChangeMe123!`). The seed refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`
is set explicitly, so demo passwords never reach a real deployment by accident.

| Email | Name | Role | Organization | What to try |
| --- | --- | --- | --- | --- |
| `director@example.com` | Rahul K | Super Admin / Director | Ashniva Technologies | Management dashboard, contracts and support hours, SLA policies, roles editor, reports, audit history |
| `pm@example.com` | Anita R | Project Manager | Ashniva Technologies | Contracts, milestones, change requests, approvals to publish, client updates, reports |
| `lead@example.com` | Sneha N | Senior / Team Lead | Ashniva Technologies | Review queue, approve/return work, Completed Today, convert tickets |
| `developer@example.com` | Priya S | Developer | Ashniva Technologies | Today view, start/submit tasks, log time, daily report |
| `developer2@example.com` | Arjun M | Developer | Ashniva Technologies | Same as above (second developer for workload) |
| `tester@example.com` | Kavya T | Tester / QA | Ashniva Technologies | QA dashboard, tasks in Review / testing, pass or return |
| `support@example.com` | Vikram J | Support Executive | Ashniva Technologies | Support dashboard with SLA at risk and breached, ticket queue and timers, waiting-for-client |
| `intern@example.com` | Neha P | Intern | Ashniva Technologies | Intern work: open assigned learning tasks, reply in comments, upload attachments with a caption |
| `employee@example.com` | Deepak B | Internal employee | Ashniva Technologies | Raise and follow own tickets only |
| `client-admin@example.com` | Sunita M | Client Admin | Acme Retail Pvt Ltd | Client portal: contracts and remaining hours, approvals to decide, change requests, reports, tickets |
| `client-employee@example.com` | Ramesh P | Client Employee | Acme Retail Pvt Ltd | Client portal: raise and follow tickets and change requests; cannot decide approvals |
| `zenith-admin@example.com` | Farah A | Client Admin | Zenith Logistics Ltd | Second client tenant — sees only Zenith data |
| `zenith-employee@example.com` | Manoj D | Client Employee | Zenith Logistics Ltd | Second client tenant |

### What Phase 2 adds

- **Contracts** — five types with scope, dates, renewal, value and internal cost, archive, search,
  filters and paging. Clients see their own contracts and only client-visible fields.
- **Support hours** — an append-only ledger of included, purchased, carried-forward, reserved and
  consumed minutes. Approved work consumes hours exactly once; manual movements need a reason and a
  fresh password check, and are audited.
- **Milestones and deliverables** — progress from the linked work or set manually with a reason,
  dependencies, and client sign-off through an approval.
- **SLA** — first-response and resolution targets per priority in business hours and timezone, a
  policy per project, per client or as the default, pausing while waiting for the client, warning
  and breach detection by a background job, and the timers on tickets and dashboards.
- **Change requests** — numbered, with the full workflow from draft to completed, the client's
  decision in the portal, and approved changes turned into tasks under a milestone.
- **Client approvals** — updates, milestones, documents, change requests and files prepared
  internally, published, then approved or sent back by the client. The same person can never
  approve for both sides.
- **Notifications** — fifteen event types in-app with read state, per-event and per-channel
  preferences, grouping, de-duplication, quiet hours, rate limiting and live delivery. Email and
  WhatsApp have provider interfaces only; nothing is sent yet.
- **Advanced reports** — ten reports, authorized and scoped on the server, with CSV export. Clients
  get the client-safe subset for their own organization.
- **Custom roles** — created from a system-role template with a permission matrix, protected system
  roles, no escalation above your own permissions, audited, behind a password check.
- **Security** — PostgreSQL row-level security per tenant, invitation links instead of shared
  passwords, forgot/reset password, and rate limits on the sensitive routes.

### What works in Phase 1

- **Sign-in and sessions** — email + password, short-lived access token in memory, rotating
  refresh token in an httpOnly cookie, logout, organization switching for multi-organization users.
- **Users, companies, teams, roles** — admin screens; permissions are enforced by the API.
- **Projects** with progress, health, members, tasks, tickets and client updates.
- **Tasks** — board and list, create/assign, `Assigned → In progress → Review / testing → Completed`
  (plus Blocked, Reopened, Cancelled) enforced by the API; completion asks only what was done, time
  spent, proof and whether the client may see it; reviewers approve or return with a reason.
- **Work logs and automatic daily reports** — generated from work logs and completions, per person,
  per team and per day; nothing to fill in.
- **Tickets** — `New → Assigned → In progress → Waiting for client → Review / testing → Resolved →
  Closed` (plus Reopened, Cancelled), public thread vs internal notes, one ticket → many tasks.
- **Client-visible updates** — drafted when client-visible work is approved, published by seniors
  and managers from Completed Today, visible in the client portal.
- **Client portal** — overview, projects, work items, updates, tickets (raise, reply, confirm and
  close, reopen) and shared files — client-visible data of the client's own organization only.
- **Files** — uploads and downloads go through the API with access checks (10 MB, type allow-list).
- **Audit history**, **role dashboards** and **real-time refresh** (Socket.IO).
- **Not yet** (Phase 3 and later): releases and UAT, billing and invoices, the GitHub integration,
  IVR and the mobile app. Nothing unfinished is shown as working.

## Preview on macOS for non-technical users

You do not need Node.js, pnpm or any developer tools — only Docker Desktop and the Terminal app.

1. **Install Docker Desktop** (once): download it from
   <https://www.docker.com/products/docker-desktop/>, drag it to Applications and open it.
   Wait until the whale icon in the menu bar stops animating.
2. **Get the project folder**: on the GitHub page click the green **Code** button →
   **Download ZIP**, then double-click the ZIP in Downloads to unzip it. (A downloaded ZIP is all
   you need — no Git, Node.js or pnpm.)
3. **Open Terminal** (Applications → Utilities → Terminal) and go to the project folder:
   type `cd ` (with a space after it), drag the unzipped folder onto the Terminal window, press
   **Return**.
4. **Start the preview** — copy this line into Terminal and press **Return**:

   ```bash
   bash scripts/mac-preview.sh
   ```

   The first run downloads and builds everything and takes about 5–10 minutes. You will see each
   step in green as it completes. When it finishes you will see **"✔ Ashniva Desk preview is
   running"**, the list of local addresses below, and the web app opens in your browser.
5. **Open these addresses** (the script opens the first one for you):
   - Web app: <http://localhost:5173>
   - API health: <http://localhost:3000/api/v1/health>
   - API documentation (Swagger): <http://localhost:3000/api/docs>
6. **What to try first** (sign in with any account from the table above, password `ChangeMe123!`):
   - As `director@example.com`: **Contracts** → open the annual maintenance contract → the
     **Support hours** tab shows the ledger; **SLA policies**, **Approvals**, **Change requests**
     and **Reports** (pick a report, then **Download CSV**).
   - As `support@example.com`: the dashboard shows SLA at risk and breached, and a ticket's page
     carries its response and resolution timers.
   - As `client-admin@example.com`: the portal shows your contracts and remaining hours, the
     change request waiting for your decision, and the milestone waiting for sign-off.
7. **Stop the preview** when you are done:

   ```bash
   bash scripts/mac-stop.sh
   ```

   Your local data is kept, so the next start is faster and shows the same data.

What the start script does for you: checks Docker Desktop (and starts it if needed), creates the
local settings files from the `.env.example` templates **only if they do not exist yet** (it never
overwrites your files), builds the app images (all software dependencies are installed inside the
images, nothing is installed on your Mac), starts PostgreSQL, Redis and MinIO and waits until each
is healthy, applies database migrations, loads fictional demo data, starts the API and the web app
and waits until both are healthy, prints the addresses and opens the browser. Everything runs on
your Mac only — no real customer data or production secrets are involved.

If something goes wrong the script prints a red **✖** message with the reason and the container
status. Common fixes: make sure Docker Desktop is running, make sure ports 5173, 3000, 5432, 6379,
9000 and 9001 are not used by another program, then run the start script again. To see details, run
`docker compose --profile app logs --tail=100`.

## Updating an installation you already have (Docker, macOS)

`scripts/mac-preview.sh` loads demo data, so it is the script for a first install and the wrong
script for a database you care about. To move an existing installation to a newer version, use:

```bash
bash scripts/mac-update.sh
```

That is the whole procedure. It builds the new images, applies the pending database migrations,
restarts the API and the web app, and prints the addresses. It does not seed, does not reset, and
does not touch a Docker volume. Sign in with the accounts you already have.

**Migrations run by themselves.** The API container applies pending migrations every time it
starts — its entry point runs `prisma migrate deploy` before `node dist/main.js`
(`apps/api/docker/entrypoint.sh`). The update script runs the same command first only so that a
migration problem appears in your Terminal with its own error message, instead of showing up as an
API container that never becomes healthy. Either way, starting the new version is what applies
them.

**Permissions come with the migrations, not with the seed.** New screens (invoices, progress
summaries, release notes, integrations) need new permission rows, and those are inserted by
`20260906200000_phase3_permissions`, which the step above applies. Existing roles keep everything
they had, custom roles are not touched, and a description someone edited stays edited.
`pnpm db:seed` is a development tool and is never needed to make a deployed feature work.

**The encryption key.** Storing an SMTP password or an API token needs `APP_ENCRYPTION_KEY`.
The app containers fall back to a fixed local-preview key published in `docker-compose.yml`, which
is fine for a demo and must not be used for anything real. To set your own, generate one and put
it in `.env`:

```bash
openssl rand -base64 32
```

```
APP_ENCRYPTION_KEY=<the value it printed>
```

Keep it somewhere safe and do not change it later: credentials already saved under the previous
key stop being readable and have to be entered again. A real deployment (`NODE_ENV=production`)
does not use `docker-compose.yml` and has no fallback — without the key the API refuses to start
rather than writing credentials in the clear.

**If something goes wrong**, nothing is deleted: the script stops and prints the reason and the
container status. `docker compose --profile app logs --tail=100` shows the detail, and running the
script again is safe.

### Where the data lives

The Compose project is pinned to `ashniva-desk` in `docker-compose.yml`, so the database, Redis and
MinIO volumes are `ashniva-desk_postgres-data`, `ashniva-desk_redis-data` and
`ashniva-desk_minio-data` no matter what the checkout folder is called. Unpacking a newer ZIP into
a different directory therefore keeps the same data instead of starting an empty database. Set
`COMPOSE_PROJECT_NAME` in `.env` to point a checkout at a different set of volumes.

`bash scripts/mac-stop.sh` stops the containers and keeps the volumes. Only
`docker compose down -v` deletes them.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | API (watch mode) + web dev server |
| `pnpm lint` / `pnpm lint:fix` | ESLint over the whole repo |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` in every workspace |
| `pnpm test` | Unit tests in every workspace |
| `pnpm test:e2e` | API tests with Supertest (needs Postgres, Redis, S3) |
| `pnpm build` | Production builds (types → ui → api → web) |
| `pnpm db:migrate` / `db:migrate:deploy` / `db:seed` / `db:reset` / `db:studio` | Prisma |
| `docker compose --profile app up --build` | Run the API and web production images locally |
| `bash scripts/mac-update.sh` | Update an existing Docker installation: build, migrate, restart (no seed, no reset) |

## Documentation

- [Developer guide](docs/developer-guide.md) — install, run, migrations, adding modules/screens/types/roles, tests, git workflow
- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Database plan](docs/database-plan.md)
- [API plan](docs/api-plan.md)
- [Security plan](docs/security-plan.md)
- [Testing strategy](docs/testing-strategy.md)
- [Development phases](docs/development-phases.md)
- [Design implementation map](docs/design-implementation-map.md)
- [CLAUDE.md](CLAUDE.md) — conventions for coding agents and humans alike

### Running it in production

- [Production runbook](docs/production-runbook.md) — what the pieces are, what each health failure means, what to alert on
- [Staging checklist](docs/staging-checklist.md) — proving a build on a production-shaped environment
- [UAT checklist](docs/uat-checklist.md) — business sign-off, with a signature line
- [Release checklist](docs/release-checklist.md) — deploying, including classifying the migrations first
- [Rollback procedure](docs/rollback-procedure.md) — migrations apply on container start; read this before you need it
- [Backup and restore](docs/backup-and-restore.md) — what to back up, how to restore, and the quarterly drill
- [Incident procedure](docs/incident-procedure.md) — severity, triage by symptom, communication

## License

Proprietary — © Ashniva Technologies. All rights reserved.
