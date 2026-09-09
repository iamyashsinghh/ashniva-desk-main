# ivr

**Owns:** the IVR boundary — which adapter is in use, and what each product's calls are allowed to
do. Provider adapters (Tata, and a mock that rings nothing) sit behind `IvrProvider`; product IVR
policy — recording, playback scope, allowed tiers, whether a requester may ask for a call, the
fallback destination and the attempt ceiling — is read and written here.

**Deliberately a leaf.** It knows nothing about call records, tickets or routing, so `call-logs`
can import it without a cycle. Swapping telephony vendors is a new file in `providers/` and a
changed `IVR_PROVIDER`; nothing outside this folder mentions a vendor.

**Entities:** `product_ivr_policies`. The provider *connection* — credentials, webhook secret and
the account id that attributes an inbound delivery to a tenant — is an `IntegrationConnection`
with `provider = IVR`, and inbound deliveries are `IntegrationEvent` rows. That machinery already
exists, is already encrypted, and already carries the idempotency index; a parallel
`ivr_providers` / `webhook_events` pair would be a second copy of it to keep right.

**Endpoints:** `GET|PUT /products/:id/ivr-policy` (`ivr:manage`) · `GET /ivr/health`
(`ivr:manage`). Placing and reading calls belongs to `call-logs`, and so does
`POST /webhooks/ivr/:provider`, because applying an event means writing a call record.

**Configuration:** `IVR_PROVIDER=tata|mock` selects the adapter;
`IVR_RECORDING_URL_TTL_SECONDS` bounds a minted playback URL. Per-tenant credentials are never in
the environment — they are in the tenant's IVR integration connection, encrypted at rest.

## The webhook payload

Adapters translate their provider's callback into this shape, which is what `ivr-payload.ts`
reads. Only `callId` carries authority, and only as a lookup key against a row Desk created
itself — an organization, project or ticket id in a callback is ignored, because a caller that
can name its own tenant can reach any tenant.

```json
{
  "accountId": "the provider account, matched against the connection's external account id",
  "type": "call.started | call.answered | call.no_answer | call.ended | recording.ready",
  "callId": "the provider's own call id",
  "occurredAt": "2026-09-12T09:00:00.000Z",
  "durationSeconds": 42,
  "disposition": "the provider's own word for how it ended",
  "recordingRef": "opaque reference, only on recording.ready"
}
```

Signed with `X-IVR-Signature: sha256=<hex>` over the raw body, using the webhook secret stored on
the tenant's IVR connection. `X-IVR-Delivery` is the idempotency key when the provider sends one;
without it the body's own digest is used, since a genuine redelivery is byte-identical.

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
