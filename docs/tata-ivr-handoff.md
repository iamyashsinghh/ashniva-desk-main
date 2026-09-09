# Tata IVR handoff checklist

> # EXTERNAL BLOCKER
>
> **Ashniva Desk cannot place a telephone call, and no amount of work inside this repository will
> change that.** The blocker is entirely outside it: no Tata (or any vendor) API specification,
> sandbox, or credential exists here, and Desk's telephony adapter therefore has nothing to call.
>
> **There is no authentic Tata material anywhere in this repository or its environment.** Every
> occurrence of the word "Tata" is either Desk's own adapter class and its `NotImplementedException`
> refusals, a configuration value (`IVR_PROVIDER=tata`), planning prose, or a screen mock-up in
> `docs/design-reference/`. The mock-up's support number, its `POST /api/v1/ivr/webhooks/tata` path
> and its "Healthy" provider badge are illustrative demo data invented for a design export — they
> are **not** a vendor specification and must not be treated as one. (The real inbound route is
> `POST /api/v1/webhooks/ivr/:provider`, `apps/api/src/modules/call-logs/ivr-webhooks.controller.ts:29,33`.)
>
> This page is the single list to hand to Tata, or to whoever owns the Tata account. Nothing below
> is a guess at what the vendor's API looks like. Each item says what must be supplied and, next to
> it, **what Desk already assumes**, so an answer can be checked against the code rather than
> against a memory of it.
>
> Until every **A** item below is answered, set `IVR_PROVIDER=mock`.

`docs/ivr-provider-contract.md` is the same material with the engineering reasoning. This page is
the checklist to send.

---

## 0. What is not blocked

So the request is proportionate. Everything on Desk's side of the boundary is built and tested:
routing and the fallback ladder, the lost-callback sweep, webhook signature verification, delivery
de-duplication, tenant attribution, event parsing, recording permissions and auditing, and
per-tenant credential storage encrypted at rest.

What is missing is the vendor's half only. When the answers arrive, the change is one file —
`apps/api/src/modules/ivr/providers/tata-ivr.provider.ts` — plus, depending on the answers to A2,
A3 and A5, a widened `IvrProviderAccount`. Nothing above the adapter boundary moves.

**What happens today, with `IVR_PROVIDER=tata`:** a requested call is accepted, every destination
on the fallback ladder is attempted and refused
(`tata-ivr.provider.ts:37,44,48,78` all throw `NotImplementedException`), and the call ends in the
support queue with the reason recorded and the on-call person notified. Nothing is lost and nobody
waits on a phone that never rings — but no telephone rings, and `GET /ivr/health` says so.

---

## A. Blocking — nothing can be built without these

### A1. Outbound call (click-to-call) endpoint

- [ ] The URL path and HTTP method that places an outbound call.
- [ ] How a **two-leg bridged** call is expressed: the agent's leg is rung first, and only when
      they answer is the client rung, so neither party ever sees the other's number.
- [ ] The field names for: the destination, the caller ID / DID to present, and the ring timeout.
- [ ] How recording consent is expressed — a request flag, a separate endpoint, or an IVR prompt id.
- [ ] Whether the status-callback URL is set **per request** or configured **once on the account**.
- [ ] The success response body, and specifically **which field carries the provider's call id**.
- [ ] The error responses, and which of them are worth retrying.

**What Desk assumes.** It calls `startOutboundCall({ organizationId, ticketId, agentUserId,
clientPhoneRef, recordingConsent, account })` (`ivr-provider.interface.ts:14-30`,
`call-placement.service.ts:181-190`) and needs back exactly
`{ providerCallId: string, startedAt: Date }` (`ivr-provider.interface.ts:69-72`). It sends **no
telephone number and no ring timeout**, and it does not name a caller ID. Anything the vendor
requires beyond those six fields has to come from somewhere Desk does not have today.

### A2. Authentication

- [ ] The scheme: static API key header, HTTP Basic, or OAuth2 client credentials.
- [ ] The **exact header name and value format**.
- [ ] If OAuth2: the token endpoint, the scopes, and the refresh and expiry behaviour.
- [ ] Whether the API host is per-account or per-region.

**What Desk assumes.** `IvrProviderAccount` holds exactly three things — `externalAccountId`, one
opaque `credential`, and a `baseUrl` (`ivr-provider.interface.ts:33-47`). That is enough for a
single static API key and **not enough for anything else**: OAuth2 would need client id, client
secret and an expiry added to the account shape and to the connection's refresh handling. The
per-tenant `baseUrl` already exists because telephony vendors run regional hosts and two
organizations on one installation may legitimately be on different ones.

### A3. Directory mapping — the largest gap, and the easiest to overlook

- [ ] How an **agent** is registered with the provider, so a Desk user id resolves to an extension
      or DID.
- [ ] How a **client contact** is registered, so Desk's reference resolves to their number.
- [ ] Whether that provisioning is an API, a portal, or a file upload.
- [ ] **Who owns keeping it current** when somebody joins, leaves, or changes number.

**What Desk assumes, and where it is worse than the contract document says.** Desk sends
`agentUserId`, a Desk UUID, and `clientPhoneRef` — and `clientPhoneRef` is **not an opaque
resolvable token**. It is a display mask produced by `maskPhone`
(`calls.service.ts:108`, `messaging/destination-mask.ts:25-32`): everything but the last three
digits is replaced with bullets, and that masked string is what is stored
(`schema.prisma:4168`) and what is handed to the adapter
(`call-placement.service.ts:187`). A provider cannot resolve `+•••••••789` to a number, because the
number is not in it.

Desk *does* hold the real number, on `User.phone` or `ExternalRequester.phone`
(`call-logs.repository.ts:161-182`), and deliberately does not transmit it. So there are exactly
two outcomes, and the vendor's answer decides which:

- **The vendor holds the directory.** Desk needs a provisioning route and a stable identifier it
  can send instead of the mask. This is a change to `clientPhoneRef`'s meaning and to what Desk
  stores.
- **The vendor cannot hold the directory.** Then Desk must transmit real telephone numbers, which
  changes its data-protection position. **That is a product decision, not an engineering one**, and
  it needs an explicit written answer before any code is written.

**Without an agreed provisioning route, real call placement is impossible even with complete API
documentation for everything else.**

### A4. Transfer endpoint

- [ ] The transfer endpoint, its method and its payload.
- [ ] Whether a transfer is **warm** or **blind**.
- [ ] What identifies the destination agent on a transfer.

**What Desk assumes.** `transferCall(providerCallId, toAgentUserId)`
(`ivr-provider.interface.ts:99`, refused at `tata-ivr.provider.ts:44`): it sends the provider's own
call id and a Desk user UUID, and expects no response body. The destination-agent identifier
depends entirely on A3.

### A5. Hangup endpoint

- [ ] The hangup endpoint, its method and its payload.
- [ ] **Which leg it ends** — the agent's, the client's, or the bridge.

**What Desk assumes.** `endCall(providerCallId)` (`ivr-provider.interface.ts:100`, refused at
`tata-ivr.provider.ts:48`): the provider's call id and nothing else, expecting no response body.
Desk has no concept of legs, so an endpoint that requires a leg identifier needs one to be
introduced.

### A6. Call-status webhook

- [ ] **How a callback URL is registered** — per request (see A1), on the account, or through a
      portal — and who can change it.
- [ ] A **sample body for every callback the vendor sends**, not a description of one.
- [ ] The vendor's **event vocabulary**, mapped onto Desk's five events.
- [ ] Which field carries the provider's call id, and whether it is the same id A1 returned.
- [ ] Whether a **delivery id** header is sent, and under what name.
- [ ] The **retry policy** — how many attempts, over what interval — so the idempotency window can
      be sized.
- [ ] Whether the callback carries a duration, a disposition and a recording reference, and under
      what field names.

**What Desk assumes.** Deliveries arrive at
`POST /api/v1/webhooks/ivr/:provider` (`ivr-webhooks.controller.ts:29,33`), unauthenticated by
necessity, answered `200` for anything genuinely delivered including a redelivery
(`:50-52`) and `401` with no reason given for anything refused (`:45-49`). The adapter currently
passes the body straight to Desk's own reader (`tata-ivr.provider.ts:74`), which means it assumes
the vendor sends **Desk's** shape. That will not be true, so a translation layer is owed. The shape
it reads (`providers/ivr-payload.ts:38-82`) is:

| Field | Rule Desk applies | Line |
| --- | --- | --- |
| `accountId` | string, ≤ 200 chars. A **claim** only — the signature is what proves the tenant | `ivr-payload.ts:38-40` |
| `type` | must be exactly one of `call.started`, `call.answered`, `call.no_answer`, `call.ended`, `recording.ready` (`packages/types/src/domain/call.ts:113-119`). An unknown value is **rejected**, never guessed | `ivr-payload.ts:56-59` |
| `callId` | string, ≤ 120 chars, required. The only field with authority, and only as a lookup key against a row Desk created | `ivr-payload.ts:61-64` |
| `occurredAt` | ISO timestamp; absent or unparseable is read as "now" | `ivr-payload.ts:66, 86-93` |
| `durationSeconds` | non-negative finite number, floored, capped at 86 400 | `ivr-payload.ts:67, 95-102` |
| `recordingRef` | string ≤ 500 chars, only on `recording.ready` | `ivr-payload.ts:74-76` |
| `disposition` | string ≤ 60 chars — the vendor's own word for how the call ended | `ivr-payload.ts:77-79` |

Any organization, project or ticket id in a callback is **ignored by design**: a caller that can
name its own tenant could reach any tenant. The raw payload is deliberately **not persisted**
(`ivr-payload.ts:82`), because it may contain a telephone number.

### A7. Webhook authentication

- [ ] **Are callbacks signed at all?** If yes: which header, which algorithm, what exactly is
      signed (raw body? body plus timestamp?), and how the digest is encoded.
- [ ] If callbacks are **not** signed: is an IP allow-list offered, and what are the source ranges?
- [ ] How the shared secret is obtained and rotated.

**What Desk assumes — and this assumption is Desk's own convention, not a documented vendor one.**
It expects `X-IVR-Signature: sha256=<hex>`, an HMAC-SHA256 over the **raw request body**, compared
in constant time (`tata-ivr.provider.ts:57-59`, `common/crypto/webhook-signature.ts:35,43`). The
raw body is preserved end to end for exactly this reason (`main.ts:15`,
`ivr-webhooks.controller.ts:42`) — re-serialising a parsed body reorders keys and would fail every
genuine delivery.

The tenant is decided by **which secret verifies**, not by what the payload claims: Desk tries every
connection whose `externalAccountId` matches and accepts the first whose secret produces the
signature (`ivr-webhook.service.ts:59-78`). Two tenants may legitimately enter the same account id,
so it does not stop at the first candidate.

If the vendor signs differently, only `verifyWebhook` changes. **If the vendor does not sign at
all**, there is no authentication on this route and an IP allow-list becomes mandatory rather than
optional — say so explicitly rather than leaving it unanswered.

Idempotency: Desk uses an `X-IVR-Delivery` header when one is sent, and otherwise the SHA-256
digest of the body, since a genuine redelivery is byte-identical
(`tata-ivr.provider.ts:61-67`, `ivr-webhook.service.ts:105`).

### A8. Recording retrieval

- [ ] The endpoint that resolves a recording reference to a playable URL, and its authentication.
- [ ] **Whether the vendor issues time-bounded URLs at all.** Ask this one first.
- [ ] The **retention period** the vendor applies to recordings.
- [ ] Whether the reference in a `recording.ready` callback is the same reference that endpoint
      takes.

**What Desk assumes.** It stores a *reference*, never audio, and mints a short-lived URL each time
somebody is permitted to listen, so there is one copy of a recording in the world and it stays
under the retention policy that already governs it. The adapter is asked for
`recordingUrl(recordingRef, account, ttlSeconds)` and must return `{ url, expiresAt }`
(`ivr-provider.interface.ts:129-133`, refused at `tata-ivr.provider.ts:78`). The TTL comes from
`IVR_RECORDING_URL_TTL_SECONDS`, default 300 seconds, maximum 3600
(`env.schema.ts:346`, used at `call-recording.service.ts:168-174`). Every issue of a URL, and every
refusal, is audited (`call-recording.service.ts:161`).

**This is the answer most likely to force a redesign.** If the only option is a permanent URL or a
direct download, the one-copy design has to change and `IVR_RECORDING_URL_TTL_SECONDS` becomes
unenforceable.

---

## B. Needed before go-live, not before the first line of code

### B1. Rate limits and concurrency

- [ ] Request rate limits, per endpoint if they differ.
- [ ] The **concurrent-call ceiling** on the account.
- [ ] What a rate-limited response looks like, and whether it carries a retry-after.

**What Desk assumes.** Nothing. There is no rate limiter, no concurrency ceiling and no
backpressure on the outbound side of the adapter. Desk's own attempt ceiling is per call, set per
product as `maxAttempts` (`ivr/dto/ivr-policy.dto.ts:81-86`), and bounds one call's fallback ladder
— not the deployment's call rate.

### B2. Timeouts

- [ ] The expected and maximum response time of each endpoint in section A.
- [ ] The **ring timeout** the provider applies, and whether Desk can set it per call.
- [ ] What happens on the provider's side when Desk's HTTP request times out but the call was
      placed — is the call orphaned, or does a callback still arrive?

**What Desk assumes.** No timeout is configured for IVR HTTP calls today, because there are no
calls to configure one for. Compare `AI_REQUEST_TIMEOUT_MS` (30 s) and `THEME_REQUEST_TIMEOUT_MS`
(5 s) (`env.schema.ts:329,371`) — the IVR adapter will need its own equivalent, and B2's third
question decides whether it can be short.

### B3. Retry and idempotency

- [ ] Whether the outbound-call endpoint is **idempotent**, and if so on what key.
- [ ] Which error responses are safe to retry, and which would place a second call.
- [ ] The vendor's own retry policy for callbacks (also asked in A6).

**What Desk assumes.** On a refusal it does **not** retry the same destination — it records the
attempt as failed and moves to the next destination on the ladder
(`call-placement.service.ts`, class comment). Three things bound the loop: a destination already
rung is never returned again, the product's attempt ceiling stops it, and the attempt counter is
claimed conditionally so two workers cannot both ring somebody. There is currently **no
idempotency key on an outbound placement**, so an endpoint that is not idempotent must be
identified explicitly: a timeout-then-retry would place two calls to the same person.

### B4. Caller ID

- [ ] What caller ID / DID the client sees, and what the agent sees.
- [ ] Whether the DID is fixed on the account or chosen per request.
- [ ] Any regulatory constraint on the presented number (India TRAI or otherwise), and who is
      responsible for it.
- [ ] What is presented when the ladder falls through to a fallback destination.

**What Desk assumes.** Nothing at all. No caller ID, DID or presentation number appears anywhere in
this repository, and `startOutboundCall` has no field for one. If it is per request, `IvrOutboundCallRequest`
has to grow a field and something has to decide its value — most likely per product or per tenant,
which is a product decision.

### B5. Sandbox and test credentials

- [ ] Sandbox or test credentials that **ring nothing**.
- [ ] Whether the sandbox uses the same base URL, the same payloads, and the same webhook contract.
- [ ] A way to trigger each of the five callback events on demand.

**Why it matters.** Without a sandbox the adapter's first real exercise is against a live account
and a real client's telephone. Desk's `mock` adapter tests everything above the boundary and
nothing across it.

---

## C. Environment and configuration — already decided, no vendor input needed

**No vendor secret belongs in the environment.** Credentials are per tenant. Only two variables
exist and they are enough:

| Variable | Meaning | Reference |
| --- | --- | --- |
| `IVR_PROVIDER` | `tata` (default) or `mock`. The real adapter is the default so a deployment cannot land on the mock by forgetting to set it | `env.schema.ts:344` |
| `IVR_RECORDING_URL_TTL_SECONDS` | Lifetime of a minted playback URL. Default 300, maximum 3600 | `env.schema.ts:346` |

Per tenant, on the IVR `IntegrationConnection`:

| Field | Meaning |
| --- | --- |
| `externalAccountId` | The vendor's account identifier. Also what an inbound webhook claims. Not a secret |
| `encryptedCredentials` | The API credential, AES-256-GCM at rest. Never logged, audited or returned |
| `webhookSecretEncrypted` | The shared secret inbound deliveries are verified against |
| `settings.baseUrl` | The vendor's API host for this account's region. Non-secret |

**What the vendor's answers may add.** If A2 is OAuth2, this list grows a client id, a client
secret and an expiry. If B2 needs a configurable timeout, an `IVR_REQUEST_TIMEOUT_MS` joins the
table above. Neither is a reason to add anything now.

---

## D. The deliverable, in one sentence

**Written API documentation** covering sections A and B, **plus a worked sample request and
response body for every endpoint in A**, **plus a sample callback body for each of the five events
in A6**, **plus sandbox credentials**. Descriptions of payloads are not sufficient: the adapter is a
translation layer, and a translation cannot be written against a paraphrase.

---

## E. Sign-off

| Item | Answered by | Date | Where the answer is recorded |
| --- | --- | --- | --- |
| A1 outbound call | | | |
| A2 authentication | | | |
| A3 directory mapping | | | |
| A4 transfer | | | |
| A5 hangup | | | |
| A6 status webhook | | | |
| A7 webhook authentication | | | |
| A8 recording retrieval | | | |
| B1 rate limits | | | |
| B2 timeouts | | | |
| B3 retry and idempotency | | | |
| B4 caller ID | | | |
| B5 sandbox | | | |

When every **A** row is filled, `IVR_PROVIDER=tata` becomes implementable and this document is
replaced by the vendor's specification plus a changed `tata-ivr.provider.ts`. Until then, deploy
with `IVR_PROVIDER=mock`.
