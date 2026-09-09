# Security plan

## Principles

1. Every control is enforced by the API and the database layer. UI visibility is a convenience.
2. Tenant isolation is structural (`organization_id` on every tenant table, tenant context in every
   repository, row-level security), not a filter someone remembers to add.
3. Internal information never reaches client responses by construction (separate portal
   controllers and allow-list DTOs), not by stripping fields afterwards.
4. Secrets are never committed, logged or shown; credentials never travel through notifications.
5. Sensitive actions are audited, append-only.

## Implemented in Phase 0

| Area | Implementation |
| --- | --- |
| Password hashing | `PasswordHashingService` — argon2id (19 MiB, t=2, p=1); malformed hashes verify as false |
| Access tokens | JWT (HS256, 15 min default) signed with `JWT_ACCESS_SECRET` (≥ 32 chars enforced); claims: `sub`, `organizationId`, `roleKey` — and nothing role-shaped beyond that: permissions come from the membership on every request |
| Refresh tokens | Opaque 48-byte random values; only a SHA-256 hash is stored; per-family rotation; reuse of a rotated token revokes the whole family; `revokeAllForUser` for remote logout |
| Guards | `JwtAuthGuard` global (deny by default, `@Public()` opt-out); `PermissionsGuard` with `@RequirePermissions`; permissions loaded from the membership on each request |
| Tenant context | `TenantContextService` (AsyncLocalStorage) opened per request, filled by the guard, read by repositories |
| Input validation | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) + class-validator DTOs; env validated with zod at boot |
| Headers / CORS | `helmet()` defaults; CORS restricted to `CORS_ORIGINS` with credentials |
| Rate limiting | `@nestjs/throttler` global per-IP (`RATE_LIMIT_*`); stricter per-route limits added with login |
| Secrets at rest | `SecretCipherService` — AES-256-GCM with `APP_ENCRYPTION_KEY` (32-byte, base64), versioned payload format |
| Logging | pino: the request line carries the matched **route pattern**, never the resolved URL, so an invitation token in a path or a `hub.verify_token` in a query string cannot reach the log; no headers, no query, no bodies; `authorization`/`cookie`/`set-cookie` redaction kept as a second layer; request ids |
| Error handling | Central filter: generic 500 message to clients, full error + request id in logs |
| Audit log | `audit_logs` append-only; `@Audited()` + `AuditLogService.record()` |
| Seed data | Fictional organizations and `@example.com` users only; password from env |
| Database uniqueness | Partial unique indexes for nullable dimensions; single service-provider organization |
| Dependencies | Lockfile committed; CI installs with `--frozen-lockfile`; native builds allow-listed in `pnpm-workspace.yaml` |

## Implemented in Phase 2

| Area | Implementation |
| --- | --- |
| Row-level security | Enabled and forced on every tenant table by the `row_level_security` migration. The API connects as `ashniva_app` (no `BYPASSRLS`); `TenantAwarePool` issues `SET ROLE ashniva_app` and `set_config('app.tenant_id', …)` on each pooled connection before the query, and clears it afterwards. Policies read `app_tenant_id()`: a row is visible when no tenant is set (migrations and jobs), when the tenant is the service provider, or when the row belongs to the tenant. Proven by `apps/api/test/row-level-security.e2e-spec.ts`: raw counts without a `WHERE` clause, inserts for another tenant, relation loads, connection reuse and concurrent load. |
| Provider bookkeeping under a client request | `TenantContextService.runAsSystem()` runs a block with no tenant so provider-side work a client action triggers (SLA clocks, notification recipients, dispatch) can read provider rows. It is used only in those engines, never on a request path that returns data to the caller. |
| Invitations | Single-use tokens, only a SHA-256 hash stored, `INVITATION_TTL_HOURS` (7 days default), consumed on acceptance, audited. New people are invited by link by default instead of being given a password. |
| Password reset | Single-use hashed tokens, `PASSWORD_RESET_TTL_MINUTES` (60 default), always the same response whether or not the address exists, all refresh families revoked on reset. |
| Re-authentication | `POST /auth/reauth` returns a short-lived token (`REAUTH_TTL_SECONDS`, 5 min) sent back in `x-reauth-token`. `@RequireRecentAuth()` guards hour adjustments, role creation, editing and deletion, changing a person's role, **creating a person** and **issuing an invitation link** — the last two because they choose a role and hand back a credential for the new account, which is a role change with an extra step. |
| Custom roles | Created only from a system-role template; system roles cannot be edited or deleted; a role may never hold a permission its author lacks, and may never be *assigned* to a person by someone who lacks one of its permissions (`validatePermissionGrant`, shared by the roles editor and by user creation and role changes); client-audience roles are limited to `CLIENT_SAFE_PERMISSIONS`; every change is audited with before/after. |
| Public readiness | `GET /health` reports each component's status and latency and nothing else. A failing component's own message — driver text naming hosts, buckets and accounts — goes to the log, never into a body an anonymous caller can read. Readiness semantics are unchanged: 503 while any component is down. |
| Client boundary | Portal DTOs are built by allow-list mappers. `apps/api/test/demo-data-privacy.e2e-spec.ts` asserts the shipped demo data itself carries no cost, margin, internal note, internal comment or internal milestone into any portal response, and that the second client sees none of it. |
| Rate limiting | Stricter per-route limits on login, password reset, invitations, re-authentication and role changes on top of the global per-IP limit. |

## Planned by phase

**Phase 1 (auth, tenant isolation, users)**
- Login with per-account and per-IP throttling, generic failure messages, `last_login_at`, audit of
  success/failure; password policy (min 12 chars, breached-password check optional); invitation
  tokens (single use, 7-day expiry); reset tokens (single use, 1-hour).
- Web: refresh token in an httpOnly, `SameSite=Strict`, `Secure` cookie; access token in memory
  only; CSRF-safe because state changes require the bearer header.
- Cross-tenant e2e suite (every endpoint × foreign ids → 404) — done. PostgreSQL RLS on all
  tenant tables — **done in Phase 2** (see the table above); the repository layer remains the first
  line of defence and RLS the backstop.
- Preview-as: 15-minute read-only impersonation token, banner, audited.
- Files: presigned S3 URLs (5-minute expiry), MIME allow-list, size limits, visibility flag checked
  on download, virus-scan hook.

**Phase 2 / 2b (QA credentials, GitHub, releases, IVR)**
- Test accounts: secrets encrypted, never in list responses; timed credential grants (8 h default);
  reveal endpoint separately permissioned (`test-credential:reveal`) and logged in
  `credential_access_log`; rotation after test; notifications carry links only.
- GitHub App: least-privilege permissions, installation tokens per request, webhook HMAC-SHA256
  verification, idempotency via `X-GitHub-Delivery`, no PATs.
- Releases: publish requires all policy approvals + typed version + `release:publish` permission
  held by a listed publisher; rollbacks audited.
- IVR: provider credentials encrypted; signed idempotent webhooks; calls bridged by the provider so
  numbers stay hidden; phone numbers stored hashed + last-4; recording consent recorded; call
  recordings and internal notes excluded from client DTOs; calling disabled offline in the apps.
- Emergency production fixes: senior approval with reason, full audit trail.

**Mobile**
- Tokens in iOS Keychain / Android Keystore; biometric lock; session expiry; remote logout via
  refresh-family revocation; screenshot protection on credential screens where supported.

## Secrets management strategy

- Local: `.env` files copied from `.env.example`, git-ignored.
- CI: GitHub Actions secrets/variables; test-only values in the workflow are not reused anywhere.
- Staging/production: the deployment platform's secret store (e.g. Docker/Kubernetes secrets, AWS
  Secrets Manager or Parameter Store) injected as environment variables; `APP_ENCRYPTION_KEY` and
  JWT secrets generated with `crypto.randomBytes`, rotated on a schedule (JWT: re-issue; encryption
  key: re-encrypt via a versioned payload — the `v1:` prefix exists for this).
- Nothing in `apps/web` is secret: every `VITE_*` value ships to the browser.
- A secret scanner (gitleaks) in CI is recommended before Phase 1 ships.

## Threats considered and mitigations

| Threat | Mitigation |
| --- | --- |
| Cross-tenant data access | Tenant context in repositories + RLS + cross-tenant tests |
| Client sees internal data | Separate portal controllers, allow-list DTOs, client-visible status mapper |
| Credential theft (refresh token) | Hashed storage, rotation, family revocation on reuse |
| Brute force | Argon2id, throttling, generic errors |
| Privilege escalation via stale token | Permissions re-read from membership each request |
| Secrets in logs | Redaction, no body logging, structured fields only |
| Webhook forgery / replay | HMAC verification, delivery-id idempotency |
| Accidental production publish | Approvals policy + typed version + publisher allow-list + audit |
| Leaked test credentials | Encrypted at rest, timed grants, audited reveal, never in notifications |
