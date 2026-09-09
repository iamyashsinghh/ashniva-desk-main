# Phase 3 — integrations, billing, AI and mobile

How Phase 3 is built on top of the Phase 1/2 code that already exists. Written before the code, and
kept honest as the code lands: anything listed here that is not implemented yet is marked
**(not started)** or **(partial)**.

Phase 3 adds seven capabilities: Git provider integration, automatic release notes, email,
WhatsApp, billing and invoicing, AI progress summaries, and the React Native foundation. All of
them except mobile sit behind one shared integration framework, so provider code never lives in a
controller.

## What already exists and is reused

| Existing thing | Where | How Phase 3 uses it |
| --- | --- | --- |
| `SecretCipherService` | `common/crypto` | AES-GCM encryption for every provider token and secret |
| `TenantContextService` + RLS | `common/tenant`, migration `…_row_level_security` | Every new table is tenant-scoped the same way |
| `@RequirePermissions`, `@RequireRecentAuth` | `common/decorators` | Guards on every new route |
| `AuditLogService` / `@Audited()` | `modules/audit-logs` | Every connection, approval, invoice and AI action |
| BullMQ + `QUEUE_NAMES` | `infrastructure/queue` | All background work; new queues registered there |
| `NotificationChannel` interface + no-op adapters | `modules/notifications/channels` | Email and WhatsApp replace the no-ops without touching callers |
| `StorageService` (S3/MinIO) | `infrastructure/storage` | Invoice PDFs, stored as `File` rows like every other attachment |
| `RealtimeService` (Socket.IO) | `infrastructure/realtime` | Live sync/delivery status, scoped by organization room |
| Portal allow-list mappers | `modules/portal`, `portal-*.service.ts` | Client-visible release notes and invoices |

The `github` and `releases` modules currently exist as README + empty module stubs. Phase 3 replaces
them with real implementations rather than adding parallel modules.

## New modules and responsibilities

| Module | Responsibility |
| --- | --- |
| `integrations` | The shared framework: connections, credentials, status, webhook intake, idempotency, retry, provider registry. Owns nothing provider-specific. |
| `git-integration` | GitHub and GitLab adapters, repository links, webhook handling, task reference linking, development activity. |
| `release-notes` | Draft generation from delivered work, review/approval workflow, Markdown and text rendering, portal publication. |
| `email` | Provider-neutral transactional email, templates, queue, delivery status. Registers an `EMAIL` notification channel. |
| `whatsapp` | Meta WhatsApp Cloud adapter behind a provider interface, template messages, inbound and status webhooks. Registers a `WHATSAPP` channel. |
| `billing` | Invoices, line items, Indian tax fields, payments, PDF generation, portal access. |
| `ai-summaries` | AI provider abstraction, grounded summary generation, human review before anything reaches a client. |

Each follows the existing layout: `*.module.ts`, thin `*.controller.ts`, rules in `*.service.ts`,
data access in tenant-scoped `*.repository.ts`, `dto/` with class-validator, `*.mapper.ts` for
allow-listed responses, `README.md`.

## Database additions

All new tables carry `organization_id`, `created_at`, `updated_at`, and `deleted_at` where soft
deletion applies, and get an RLS policy in the same style as Phase 2.

**Foundation**

- `integration_connections` — `(organizationId, provider)` unique. `provider` enum, `status`
  (`DISCONNECTED | CONNECTED | ERROR | EXPIRED`), `displayName`, `encryptedCredentials` (ciphertext
  from `SecretCipherService`, never a plain column), `credentialsExpireAt`, `scopes`,
  `webhookSecretEncrypted`, `externalAccountId`, `settings` (Json, non-secret only),
  `lastSyncAt`, `lastSyncStatus`, `lastErrorAt`, `lastErrorMessage` (redacted), `enabled`,
  `createdById`.
- `integration_events` — every inbound webhook: `provider`, `connectionId`, `externalEventId`,
  `eventType`, `signatureVerified`, `status` (`RECEIVED | PROCESSED | FAILED | DUPLICATE | REJECTED`),
  `attempts`, `lastError`, `payloadDigest` (SHA-256 of the raw body — the body itself is **not**
  stored), `receivedAt`, `processedAt`. Unique on `(provider, externalEventId)` — that constraint
  *is* the duplicate protection.

**Git**

- `repository_links` — `projectId`, `connectionId`, `provider`, `externalRepoId`, `owner`
  (owner/group), `name`, `defaultBranch`, `webhookId`, `linkedById`. Unique
  `(connectionId, externalRepoId)`.
- `code_activities` — one row per commit / branch push / PR-MR / review / merge / release-tag.
  `repositoryLinkId`, `kind`, `externalId`, `title`, `authorName`, `authorExternalId`, `url`,
  `branch`, `state`, `occurredAt`, `taskId?` (resolved from a `TSK-###` reference), `raw` omitted.
  Unique `(repositoryLinkId, kind, externalId)`.

**Release notes**

- `release_notes` — `projectId`, `repositoryLinkId?`, `version`, `releaseDate`, `status`
  (`DRAFT | IN_REVIEW | APPROVED | PUBLISHED`), `internalNotes`, `clientSummary`, `bodyMarkdown`,
  `generatedAt`, `generatedBy` (`SYSTEM | AI | HUMAN`), `approvedById`, `approvedAt`,
  `publishedById`, `publishedAt`.
- `release_note_items` — `releaseNoteId`, `kind` (`TASK | TICKET | CODE_ACTIVITY | CLIENT_UPDATE`),
  `refId`, `label`, `clientVisible`.
- `release_note_history` — state transitions with actor, note, timestamp.

**Messaging**

- `message_templates` — `channel` (`EMAIL | WHATSAPP`), `key`, `locale`, `subject?`, `body`,
  `providerTemplateName?` (WhatsApp approved template), `variables` (Json), `enabled`.
- `outbound_messages` — the shared spine for both channels: `channel`, `templateKey`,
  `recipientUserId?`, `recipientAddressDigest` (hash, never the raw address),
  `status` (`QUEUED | SENT | DELIVERED | READ | FAILED | SKIPPED`), `providerMessageId`,
  `attempts`, `lastError` (redacted), `queuedAt`, `sentAt`, `deliveredAt`, `readAt`.
  Unique `(channel, idempotencyKey)`.
- `inbound_messages` — WhatsApp replies where permitted: `fromDigest`, `providerMessageId`,
  `receivedAt`, `handled`. Message bodies are stored only when
  `WHATSAPP_STORE_INBOUND_BODY=true`; the default is off.

**Billing**

- `invoices` — `clientOrganizationId`, `projectId?`, `contractId?`, `number` +
  `numberLabel` (`INV-<year>-<n>`, sequential per organization via the existing
  `organization_counters`), `status` (`DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE |
  CANCELLED | VOID`), `issueDate`, `dueDate`, `currency`, billing snapshot (`billToName`,
  `billToAddress`, `billToGstin`, `placeOfSupply`, `supplierGstin`), `subtotal`, `discountTotal`,
  `taxableValue`, `cgst`, `sgst`, `igst`, `grandTotal`, `amountPaid`, `notes`, `terms`, `pdfFileId?`.
- `invoice_line_items` — `description`, `hsnSac?`, `quantity`, `unitRate`, `discountPercent`,
  `taxRatePercent`, `lineSubtotal`, `lineTax`, `lineTotal`, `sortOrder`.
- `invoice_payments` — `amount`, `paidOn`, `method`, `reference`, `notes`, `recordedById`.

**Money is `Decimal(14,2)` in the database and `Prisma.Decimal` in code.** Totals are computed with
`Prisma.Decimal` arithmetic in `invoice-totals.ts` and unit-tested; no JavaScript `number` ever
touches a monetary value. Tax rates are `Decimal(5,2)`, quantities `Decimal(12,3)`.

**AI**

- `ai_summaries` — `kind` (`DEVELOPER_DAILY | TEAM | PROJECT | CLIENT_WEEKLY | RELEASE_NOTES`),
  `subjectType`/`subjectId`, `periodStart`, `periodEnd`, `status`
  (`DRAFT | IN_REVIEW | APPROVED | PUBLISHED | FAILED`), `content`, `clientVisible`,
  `model`, `provider`, `promptTokens`, `completionTokens`, `generatedAt`, `approvedById`,
  `approvedAt`, `error`.
- `ai_summary_sources` — `summaryId`, `sourceType` (`TASK | TICKET | WORK_LOG | CLIENT_UPDATE |
  CODE_ACTIVITY`), `sourceId`, `label`. Every summary must cite its sources; a summary with no
  sources is refused rather than generated from nothing.

### Migrations

Generated as SQL under `apps/api/prisma/migrations/` and reviewed statically. **No migration is
applied to any persistent database in this branch**, and no seed runs. The RLS policies for the new
tables ship in the same migration as the tables.

## Permissions

Added to `packages/types/src/permissions/permission-keys.ts` and mapped to modules in
`PERMISSION_MODULE_LABELS`:

| Key | Meaning |
| --- | --- |
| `integration:read` / `integration:manage` | See / connect, configure, disconnect integrations |
| `repository:read` / `repository:manage` | See / link and unlink repositories on a project |
| `release-note:read` / `release-note:write` | See / create and edit drafts |
| `release-note:approve` / `release-note:publish` | Approve a draft / publish it to the client portal |
| `communication:manage` | Email and WhatsApp settings, test sends |
| `invoice:read` / `invoice:write` | See / create and edit draft invoices |
| `invoice:issue` / `invoice:void` | Issue an invoice / cancel or void one |
| `payment:read` / `payment:record` | See / record a payment against an invoice |
| `ai-summary:read` / `ai-summary:generate` / `ai-summary:approve` | See / generate / approve for client publication |

Default role grants follow the existing shape: Super Admin and Project Manager get the management
keys, Team Lead gets `release-note:approve` and `ai-summary:approve`, Developer and Tester get read
only, client roles get none of them (the portal uses its own allow-listed routes).

Sensitive operations — connecting or disconnecting an integration, voiding an invoice, publishing a
release note — additionally require `@RequireRecentAuth()`, matching how Phase 2 protects role and
hour-ledger changes.

## API routes

```
GET    /integrations                          list connections for the tenant
GET    /integrations/:provider                one connection
POST   /integrations/:provider/connect        start or complete the connect flow
POST   /integrations/:provider/validate       test the stored credentials
POST   /integrations/:provider/sync           manual synchronisation
PATCH  /integrations/:provider                enable/disable, settings
DELETE /integrations/:provider                disconnect (credentials wiped, rows kept)
GET    /integrations/:provider/events         recent webhook events (redacted)

GET    /git/repositories                      repositories available on the connection
GET    /projects/:id/repositories             linked repositories
POST   /projects/:id/repositories             link one
DELETE /repositories/:id                      unlink
POST   /repositories/:id/sync                 manual sync
GET    /tasks/:id/activity                    development activity for a task
GET    /projects/:id/activity                 development activity for a project

GET    /release-notes                         list (filter by project, status)
POST   /release-notes                         create a draft
POST   /release-notes/generate                generate a draft from delivered work
GET    /release-notes/:id                     detail
PATCH  /release-notes/:id                     edit a draft
POST   /release-notes/:id/submit               draft → in review
POST   /release-notes/:id/approve              in review → approved
POST   /release-notes/:id/publish              approved → published
GET    /release-notes/:id/render?format=md|txt rendered output

GET    /email/settings  ·  PUT /email/settings  ·  POST /email/test
GET    /whatsapp/settings · PUT /whatsapp/settings · POST /whatsapp/test
GET    /messages                              outbound delivery log (redacted)

GET    /invoices  ·  POST /invoices  ·  GET /invoices/:id  ·  PATCH /invoices/:id
POST   /invoices/:id/issue · /cancel · /void
POST   /invoices/:id/payments  ·  GET /invoices/:id/payments
POST   /invoices/:id/pdf                      render and attach the PDF

GET    /ai-summaries  ·  POST /ai-summaries/generate  ·  GET /ai-summaries/:id
POST   /ai-summaries/:id/regenerate · /approve

GET    /portal/release-notes  ·  /portal/release-notes/:id
GET    /portal/invoices  ·  /portal/invoices/:id  ·  /portal/invoices/:id/pdf
```

## Webhook routes

Public (`@Public()`), never behind the JWT guard, always signature-verified before any work:

```
POST /webhooks/github        X-Hub-Signature-256, HMAC-SHA256 over the raw body
POST /webhooks/gitlab        X-Gitlab-Token, constant-time compare
GET  /webhooks/whatsapp      Meta's hub.challenge verification handshake
POST /webhooks/whatsapp      X-Hub-Signature-256 over the raw body
```

Every handler: verify signature → record an `integration_events` row → return `202` immediately →
process on a queue. An unverified request is recorded as `REJECTED` and answered `401` without
revealing why. The raw body is needed for HMAC, so these routes are registered with a raw-body
parser and are excluded from the global JSON body parser.

## Background queues

Added to `QUEUE_NAMES`:

| Queue | Jobs |
| --- | --- |
| `integration-sync` | Periodic and manual connection sync, token refresh before expiry |
| `git-webhooks` | Process a recorded webhook event into `code_activities` and task links |
| `release-notes` | Generate a draft from delivered work |
| `outbound-messages` | Send one email or WhatsApp message |
| `ai-summaries` | Generate one summary |

## Provider interfaces

```ts
interface GitProvider {
  readonly key: 'GITHUB' | 'GITLAB';
  validate(c: Credentials): Promise<ValidationResult>;
  listRepositories(c: Credentials): Promise<ProviderRepository[]>;
  verifyWebhook(raw: Buffer, headers: Headers, secret: string): boolean;
  parseEvent(headers: Headers, body: unknown): ParsedCodeEvent[] | null;
}

interface EmailProvider {
  readonly key: string;                       // 'smtp' | 'mock'
  isConfigured(): boolean;
  verify(): Promise<ValidationResult>;
  send(message: OutboundEmail): Promise<ProviderSendResult>;
}

interface WhatsAppProvider {
  readonly key: string;                       // 'meta-cloud' | 'mock'
  isConfigured(): boolean;
  verify(): Promise<ValidationResult>;
  sendTemplate(message: OutboundTemplateMessage): Promise<ProviderSendResult>;
  verifyWebhook(raw: Buffer, headers: Headers, secret: string): boolean;
}

interface AiProvider {
  readonly key: string;                       // 'mock' | vendor key
  isConfigured(): boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
```

Each is registered through a Nest injection token with a mock implementation selected whenever the
matching environment variables are absent. **Tests always run against the mocks; no automated test
contacts a real provider.**

## Required environment variables

All optional — absent means "that provider is not configured", and the feature reports itself as
disconnected rather than failing. Added to `env.schema.ts`, `AppConfigService` and `.env.example`.

| Variable | Purpose |
| --- | --- |
| `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | GitHub App install and webhook verification |
| `GITLAB_BASE_URL`, `GITLAB_APP_ID`, `GITLAB_APP_SECRET`, `GITLAB_WEBHOOK_SECRET` | GitLab (self-managed or gitlab.com) |
| `EMAIL_PROVIDER` (`smtp`\|`mock`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Transactional email |
| `WHATSAPP_PROVIDER` (`meta-cloud`\|`mock`), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_STORE_INBOUND_BODY` | WhatsApp Cloud API |
| `AI_PROVIDER` (`mock`\|vendor), `AI_API_KEY`, `AI_MODEL`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS` | AI summaries |
| `INVOICE_SUPPLIER_GSTIN`, `INVOICE_SUPPLIER_STATE_CODE`, `INVOICE_NUMBER_PREFIX` | Indian invoicing defaults |

Per-tenant values (a tenant's own SMTP host, WhatsApp number, GSTIN) live encrypted in
`integration_connections`; the environment variables are the deployment-wide fallback and the
credentials for the provider *app* itself.

## Failure and retry behaviour

| Situation | Behaviour |
| --- | --- |
| Webhook signature invalid | `401`, event stored `REJECTED`, nothing processed, no detail leaked |
| Duplicate `externalEventId` | Unique constraint hit → stored `DUPLICATE`, `202`, no reprocessing |
| Provider 5xx or timeout | BullMQ retry, 5 attempts, exponential backoff from 5s (5s/10s/20s/40s/80s) |
| Provider 4xx (bad request, revoked token) | No retry — permanent. Connection → `ERROR` or `EXPIRED`, `lastErrorMessage` redacted |
| Token expiring within 10 minutes | `integration-sync` refreshes it before use; failure sets `EXPIRED` |
| Message send fails after all attempts | `outbound_messages.status = FAILED`, in-app notification still delivered — email/WhatsApp are never the only channel |
| AI provider fails or returns nothing | Summary → `FAILED` with the reason; never a partial or invented summary |
| Invoice PDF render fails | Invoice unchanged, error surfaced; issuing does not depend on the PDF |

**Safe logging.** A `redact.ts` helper strips tokens, secrets, signatures, message bodies, email
addresses and phone numbers before anything reaches the logger, and the Pino redaction paths are
extended to cover the new fields. Addresses and phone numbers are persisted only as digests.

## Audit events

New actions on the existing `AuditLogService`: `integration.connected`, `integration.disconnected`,
`integration.validated`, `integration.sync_failed`, `repository.linked`, `repository.unlinked`,
`release_note.created`, `release_note.submitted`, `release_note.approved`, `release_note.published`,
`email.settings_updated`, `email.test_sent`, `whatsapp.settings_updated`, `whatsapp.test_sent`,
`invoice.created`, `invoice.issued`, `invoice.cancelled`, `invoice.voided`, `payment.recorded`,
`ai_summary.generated`, `ai_summary.approved`, `ai_summary.failed`.

New entity types: `integration`, `repository`, `release_note`, `invoice`, `payment`, `ai_summary`,
`message`.

## Client-visible versus internal

| Internal only | Client-visible |
| --- | --- |
| Connection credentials, webhook secrets, provider account ids | — |
| Commit messages, branch names, PR titles, reviewer names, repository names | — (development activity never reaches the portal) |
| Release note `internalNotes`, non-client-visible items | `clientSummary`, items flagged `clientVisible`, version, release date |
| Invoice internal notes, cost basis | Invoice totals, line items, tax breakdown, due date, payments, PDF |
| AI summary drafts, developer and team summaries, token usage | Approved `CLIENT_WEEKLY` summaries only, after human approval |
| `outbound_messages` recipient digests and provider ids | — |

Portal responses are produced by allow-list mappers (`portal-*.mapper.ts`), never by serialising an
internal entity. The `demo-data-privacy.e2e-spec.ts` pattern from Phase 2 is extended to cover
release notes and invoices.

## React web screens

Existing patterns only: `apiRequest`, TanStack Query hooks per feature `api.ts`, `QueryState`,
`useSubmitHandler`, `@ashniva/ui` components, `usePermission`, routes in `app/router.tsx`, nav in
`app/layout/navigation.ts`, colours from design tokens.

| Screen | Route |
| --- | --- |
| Integrations settings | `/admin/integrations` |
| Git provider connection | `/admin/integrations/:provider` |
| Project repository settings | `/projects/:id` → Repositories tab |
| Development activity | task detail + `/projects/:id` → Activity tab |
| Release notes list / editor | `/release-notes`, `/release-notes/:id` |
| Email settings | `/admin/email` |
| WhatsApp settings | `/admin/whatsapp` |
| Invoice list / detail-editor | `/invoices`, `/invoices/:id` |
| AI summary review | `/ai-summaries` |
| Portal release notes / invoices | `/portal/release-notes`, `/portal/invoices` |

## React Native structure

`apps/mobile`, React Native with TypeScript, consuming `@ashniva/types` from the workspace. Expo is
used only if it composes with the pnpm workspace without hoisting workarounds; otherwise the bare
RN template. Design tokens are re-exported from `@ashniva/ui` as a plain TS object (the web package
ships CSS variables, which React Native cannot consume).

```
apps/mobile/src/
  api/            client, auth interceptor, refresh-token rotation
  auth/           secure token storage, session context
  navigation/     role-aware stack + tab navigators
  screens/        Login, Dashboard, MyTasks, TaskDetail, Tickets, TicketDetail,
                  RaiseTicket, Notifications, ClientUpdates
  components/     Loading, Empty, Offline, ErrorState, and shared primitives
  theme/          tokens shared with the web design tokens
```

Deliberately not in the mobile app: admin screens, contracts, invoices, reports, roles, integration
settings. The app covers the field workflows only.

## Testing approach

| Layer | What |
| --- | --- |
| Unit (Jest, API) | Signature verification, task-reference parsing, retry/backoff, redaction, invoice totals in `Prisma.Decimal`, release-note item selection, AI grounding rules |
| e2e (Jest + Supertest) | Every new route: permissions, validation, workflow transitions, webhook accept/reject/duplicate |
| Cross-tenant e2e | A dedicated suite proving tenant A cannot read or modify tenant B's connections, repositories, webhook events, release notes, messages, invoices, payments or AI summaries |
| Privacy e2e | Portal responses carry no internal fields; extends `demo-data-privacy.e2e-spec.ts` |
| Web (Vitest + Testing Library) | New screens render, permissions hide actions, forms validate |
| Mobile | TypeScript compile and bundle validation; no store build |

All provider calls in tests go to the mock adapters. No test contacts GitHub, GitLab, Meta, an SMTP
server or an AI vendor. No test runs against a persistent database beyond the disposable one CI
creates.
