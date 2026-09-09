# IVR provider contract — what Ashniva Desk needs from Tata (or any vendor)

Ashniva Desk's IVR engine is built and tested. What it cannot do is place a real telephone call,
because no vendor API contract exists in this repository to write against.

This document is the shopping list. It exists so that whoever obtains the vendor's documentation
knows exactly what to bring back, and so that nobody is tempted to guess. **A guessed endpoint
would be worse than the current refusal**: it would look like a working integration and fail in
production, against a real client, on the call that mattered.

The same list is served by `GET /ivr/health` as `IvrReadiness.missing`, so an administrator sees it
next to the switch it governs rather than only here.

`tata-ivr-handoff.md` is this list as a **checklist to send**, with what Desk already assumes cited
to `file:line` beside each item, so an answer can be checked against the code. Use that one for the
handover; use this one for the reasoning behind it.

## 1. What is already done, and is not waiting on anybody

Everything on Desk's side of the boundary:

- **Routing.** Who to ring, in what order, and why each candidate was skipped — the module owner,
  the primary support developer, on-call, backup, then escalation. Reused by both support calls and
  internal calls.
- **The fallback ladder.** Every attempt is recorded in `call_attempts`; the ladder is bounded three
  ways and ends in the support queue with a stated reason and a notification.
- **The lost-callback sweep.** `CallMonitorProcessor` settles calls the provider never reported on,
  so a dropped webhook ends the same way a genuine `no_answer` does.
- **Webhook verification.** `sha256=<hex>` HMAC over the raw request body, timing-safe.
- **Delivery de-duplication.** An `X-IVR-Delivery` header when one is sent, and the body's own
  SHA-256 digest when it is not — a genuine redelivery is byte-identical, so it collides exactly as
  a repeated id would.
- **Account attribution.** The payload *claims* an account; whichever tenant's secret verifies the
  signature *proves* it. Two tenants may legitimately enter the same account id, so every candidate
  is tried rather than the first.
- **Event parsing** that refuses an unknown event rather than guessing at it, and that never
  persists the raw provider payload, because it may contain a telephone number.
- **Recording permissions.** `call:play-recording` is separate from `call:read-internal`, the
  product's playback scope is honoured, and every access *and every refusal* is audited.
- **Per-tenant credentials**, AES-256-GCM encrypted at rest in the tenant's IVR
  `IntegrationConnection`.

Swapping vendors is a new file in `apps/api/src/modules/ivr/providers/` and a changed environment
variable. Nothing above the adapter boundary knows a vendor's name.

## 2. What is missing — the vendor's half

### 2.1 Outbound call (click-to-call)

Desk calls `startOutboundCall({ organizationId, ticketId, agentUserId, clientPhoneRef,
recordingConsent, account })` and needs back a `providerCallId` and a start time.

Required:

- the URL path and HTTP method;
- how a **two-leg bridged** call is expressed — the agent's leg is rung first, and only when they
  answer is the client rung, so neither party ever sees the other's number;
- the field names for the destination, the caller ID or DID to present, and the ring timeout;
- how recording consent is expressed: a request flag, a different endpoint, or an IVR prompt id;
- whether the status-callback URL is set per request or configured once on the account;
- the success response, and specifically which field carries the provider's call id;
- the error responses, and which of them are worth retrying.

### 2.2 Authentication

`IvrProviderAccount` currently models **one** opaque `credential` plus an `externalAccountId` and a
`baseUrl`. That is enough for a static API key and not enough for anything else.

Required:

- the scheme: static API key header, HTTP Basic, or OAuth2 client credentials;
- the exact header name and value format;
- if OAuth2: the token endpoint, the scopes, and the refresh and expiry behaviour. **The account
  shape would then need client id, client secret and an expiry**, and the connection would need to
  refresh before `credentialsExpireAt` the way other integrations already do;
- whether the API host is per-account or per-region (Desk already stores a per-tenant `baseUrl` in
  the connection's non-secret `settings`).

### 2.3 The directory mapping — the largest gap, and the easiest to overlook

**Desk deliberately transmits no telephone numbers.** It sends `agentUserId`, a Desk UUID, and
`clientPhoneRef`, an opaque masked reference. The provider is expected to hold the directory that
turns those into real numbers. That is what makes it true that Desk cannot leak a number: it does
not have one to leak.

Nothing in this repository provisions that directory, and no vendor mechanism for it is documented.
**Without an agreed provisioning route, real call placement is impossible even with complete API
documentation for everything else.**

Required:

- how an agent is registered with the provider, so `agentUserId` resolves to an extension or DID;
- how a client contact is registered, so `clientPhoneRef` resolves to their number;
- whether that provisioning is an API, a portal, or a file upload;
- who owns keeping it current when somebody joins, leaves or changes number.

If the vendor cannot hold the directory, this is a **product decision, not an engineering one**:
Desk would have to store client telephone numbers, which changes its data-protection position and
needs an explicit answer before any code is written.

### 2.4 Transfer and hangup

- the transfer endpoint, and whether a transfer is warm or blind;
- what identifies the destination agent on a transfer;
- the hangup endpoint, and which leg it terminates.

### 2.5 Recording retrieval

Desk stores a *reference*, never audio, and mints a short-lived URL each time somebody is permitted
to listen — so there is one copy of a recording in the world and it stays under the retention
policy that already governs it.

Required:

- the endpoint that resolves a recording reference to a playable URL;
- **whether the vendor issues time-bounded URLs at all.** If it does not — if the only option is a
  permanent URL or a direct download — then that design has to change and
  `IVR_RECORDING_URL_TTL_SECONDS` becomes unenforceable. This is the single answer most likely to
  force a redesign, so it is worth asking first;
- the retention period the vendor applies.

### 2.6 Webhook contract

Desk's canonical event is `{ accountId, type, callId, occurredAt, durationSeconds, disposition,
recordingRef }` with `type` one of `call.started`, `call.answered`, `call.no_answer`, `call.ended`,
`recording.ready`. The Tata adapter currently passes payloads to the shared reader unchanged, which
assumes the vendor sends Desk's own shape. That will not be true, so a translation layer is owed.

Required:

- a sample of **every** callback body the vendor sends;
- the vendor's event vocabulary, mapped onto the five above;
- whether callbacks are signed, with which header and which algorithm. Desk currently assumes
  `X-IVR-Signature: sha256=<hex>` over the raw body — **that is Desk's own convention, not a
  documented vendor one**, and if the vendor differs, `verifyWebhook` changes and nothing else does;
- whether a delivery id header is sent, and under what name;
- the vendor's retry policy, so the idempotency window can be sized.

### 2.7 Operational limits

- request rate limits and the concurrent-call ceiling;
- sandbox or test credentials that ring nothing;
- the source IP ranges callbacks arrive from, if an allow-list is offered.

## 3. Environment and configuration

Two variables exist and are enough; **no vendor secret belongs in the environment**, because
credentials are per tenant:

| Variable | Meaning |
| --- | --- |
| `IVR_PROVIDER` | `tata` (default) or `mock`. The real adapter is the default so a deployment cannot land on the mock by forgetting to set it. |
| `IVR_RECORDING_URL_TTL_SECONDS` | How long a minted playback URL lives. Default 300, maximum 3600. |

Per tenant, on the IVR `IntegrationConnection`:

| Field | Meaning |
| --- | --- |
| `externalAccountId` | The vendor's account identifier. Also what an inbound webhook claims. Not a secret. |
| `encryptedCredentials` | The API credential, AES-256-GCM at rest. Never logged, audited or returned. |
| `webhookSecretEncrypted` | The shared secret inbound deliveries are verified against. |
| `settings.baseUrl` | The vendor's API host for this account's region. Non-secret. |

## 4. What happens today, and why it is not a bug

`IVR_PROVIDER` defaults to `tata`, and the Tata adapter refuses every dialling operation. A call
requested right now is therefore accepted, each destination on the fallback ladder is attempted and
refused, and the call ends in the support queue with the reason recorded and the on-call person
notified.

That is the correct failure: it is loud, it is recorded, and it puts a human in the loop. It is not
silent and it does not lose the request. But **no telephone rings**, and `GET /ivr/health` says so
in as many words, so nobody has to discover it from a client complaint.

An installation that does not want telephony at all should set `IVR_PROVIDER=mock`, which makes the
refusals stop and the readiness report say the adapter is ready by construction.

## 5. What lands when the answers arrive

Only `apps/api/src/modules/ivr/providers/tata-ivr.provider.ts`, plus — depending on the answers to
§2.2 and §2.5 — a widened `IvrProviderAccount` and possibly a change to how recordings are reached.
Everything else, including every test above the adapter, is already written and stays as it is.

That is the whole point of the seam.
