# support-callbacks

**Owns:** Telling a registered product what happened to its tickets, without being asked.

**Entities:** `product_callback_endpoints`, `support_callback_deliveries`

**Queue:** `QUEUE_NAMES.SUPPORT_CALLBACKS`

## Why it exists

The ingress is one-way. A product raises a ticket and then has to poll `GET /support/tickets/:id`
to learn anything — which means either a slow customer experience or a customer hammering the API.
This is the other direction.

## The one rule

**A payload is built from the external allow-list, never from a filtered ticket.**
`ExternalTicketStatusReader` is the single builder for anything an external system may see, and the
ingress status endpoint delegates to it too — so the poll and the push cannot come to disagree, and
there is exactly one place where widening what leaves the building is even possible.

`SupportCallbackPayload` has no field for an assignee, an internal note, a routing trail, a call
recording or a root-cause analysis. That is the protection, and it is structural rather than
procedural: no future change to a query can start including one.

## Delivery semantics

Copied field for field from `messaging`, because the failure modes are identical — both are "we
handed something to somebody else's system and may never learn what happened to it".

| Rule | Why |
| --- | --- |
| `claim` inserts first and reads P2002 as "somebody else got there" | Check-then-insert leaves a window in which two workers both see nothing |
| `claimForSending` matches **QUEUED only**, scoped by organization | A worker killed after the endpoint accepted the request leaves SENDING; re-entering there sends twice. The organization is in the `where` because the id and the tenant arrive as two independent job fields, and the signing secret is loaded from the tenant |
| `markFailed(retrying)` puts a retry back to QUEUED | So the next attempt goes through the same guard |
| `failStalledClaims` moves SENDING → FAILED, never back to QUEUED | Whether the endpoint received it is genuinely unknown; re-queueing would gamble and send twice |

## Signing

```
X-Ashniva-Delivery:  <delivery id>
X-Ashniva-Event:     ticket.resolved
X-Ashniva-Timestamp: <unix seconds>
X-Ashniva-Signature: sha256=<hex of HMAC-SHA256(secret, "<timestamp>.<raw body>")>
```

The body is serialized **once** and the same string is signed and sent — the mirror of the rule
`common/crypto/webhook-signature.ts` states for inbound deliveries. The timestamp is inside the
signature, so a receiver that refuses anything older than five minutes is genuinely protected
against replay of a captured delivery. The HMAC itself is the shared helper, so there is one
implementation of `sha256=…` in the product rather than one per direction.

The signing secret is **encrypted, not hashed** — the opposite of a machine credential — because
it has to be read back on every delivery in order to sign with it. A hash could only verify
something somebody else computed, which is not the direction this runs in.

## Redelivery, and why it differs from `message-resend.service.ts`

That file explains at length why resending an email creates a *new* row: a FAILED email may in fact
have been delivered, nobody can tell, and re-queueing would gamble on the wrong half of that.
Every word of it is right — about email.

A callback is a different contract. The integration documentation tells receivers, in the same
breath as the signature recipe, to treat `X-Ashniva-Delivery` as an idempotency key and ignore one
they have already processed. So a redelivery of the same id is *defined* to be harmless, and a new
row would break exactly that guarantee by carrying a new id. The divergence rests entirely on the
receiver contract; anything sent to somebody who was not told to deduplicate keeps the messaging
rule instead.

## Events

`ticket.created` · `ticket.assigned` · `ticket.waiting_client` · `ticket.in_progress` ·
`ticket.resolved` · `ticket.closed` · `support.update`

An empty subscription list means **every** event, following `ProductIvrPolicy.allowedTiers`: an
operator who configured an endpoint and left the list alone meant to be told things.

## Endpoints

`GET|PUT /products/:id/callbacks` and `POST /products/:id/callbacks/secret` need `product:manage` —
a callback URL is a standing instruction to post ticket data to somebody else's server.
`GET /products/:id/callbacks/deliveries` needs only `product:read`, because "did the customer get
told" is ordinary support context. Redelivery is `product:manage` and audited.

## Transport

`SafeHttpService`, never `fetch`: the URL is one an operator typed in, so every delivery is a
request to an address somebody else chose. It is checked by the same guard at save time as well, so
an operator who types a loopback address is told while they are looking at the form.
`SUPPORT_CALLBACK_TRANSPORT=mock` swaps in a transport that opens no socket, for tests and the
local preview — the same switch, and the same reasoning, as `messaging.module.ts`.
