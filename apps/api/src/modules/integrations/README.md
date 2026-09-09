# integrations

**Owns:** the shared integration framework — tenant-scoped connections, encrypted credentials with
expiry, connection status and validation, inbound webhook intake with idempotency, the retry/backoff
policy and the log/store redaction helper.

**Planned phase:** Phase 3 (order 1)

**Entities:** integration_connections, integration_events

**Endpoints:** GET /integrations · GET /integrations/events · GET /integrations/:provider ·
POST /integrations/:provider/connect · POST /integrations/:provider/validate ·
PATCH /integrations/:provider · DELETE /integrations/:provider

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.

**Provider code never lives here.** A provider contributes an `IntegrationProviderAdapter` through
the `INTEGRATION_PROVIDERS` token; this module never imports a provider SDK and never branches on
the provider name.

**Credentials** exist in exactly three places: the request DTO, the `SecretCipherService.encrypt`
call, and the ciphertext column. `IntegrationsService.credentialFor()` is the only way back out and
is called by provider code inside the API — never by a controller, never by a mapper. The mappers
are explicit allow-lists rather than spreads, so a new model field cannot leak ciphertext into a
response.

**Duplicate webhooks** are stopped by the unique index on `(provider, external_event_id)`, not by a
read-then-write check: the database rejects the second insert, so no race can slip a copy through.
Payloads are never stored — only a SHA-256 digest, which is enough to recognise a replay without
keeping customer data.
