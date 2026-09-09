# products

**Owns:** The product registry — which applications may raise support tickets without a human
login — their machine credentials, the external support ingress those credentials open, and the
browser-safe session the embedded widget runs on.

**Phase:** delivered in package 8c; the widget session model added with the support platform work.

**Entities:** `products`, `product_credentials`, `external_requesters`,
`support_ingress_requests` (+ three nullable columns on `tickets`)

## The one rule

**Nothing about where a ticket goes comes from the request.** Organization, project, client
organization, source policy and routing policy are all read from the product record the credential
resolved to. A caller supplies content — a title, a description, who was affected — and nothing
else. A caller that could name its own project could route its tickets to any team in the product,
so the ingress does not let it name one.

A product is not a project. The project owns the team, the ownership chain and the rotas; a
product points at one. Duplicating any of that here would give the router two places to look and
two chances to disagree.

## Machine credentials

`Authorization: Bearer ask_<keyId>.<secret>`

The key id is public and identifies which hash to verify against — one lookup rather than a scan
across every credential, which would be slow and a timing oracle. The secret is stored as an
**argon2id hash**, not ciphertext, and that difference from `test_accounts` is deliberate: a test
password has to be read back by a tester, whereas nothing in Desk ever needs to read a machine
secret. Where the only operation is verification, storing anything reversible is a liability with
no matching benefit. The only recovery from a lost secret is rotation.

Rotation changes the key id too. Keeping it would leave an old secret and a new one both matching
the same public half for as long as anybody had the old string written down, and "which of the two
is live" is not a question an audit trail should have to answer.

Every refusal — wrong secret, revoked key, inactive product — returns the same 401 with the same
message. Inside, each is audited separately.

## Widget sessions — the browser half

`Authorization: Bearer askp_<claims>.<signature>`

**The `ask_` credential must never reach page JavaScript.** It is argon2id-verified, it is the
customer's whole product, and anything in a page is readable by everyone who loads it. So the
customer's *backend* presents it once at `POST /support/widget-sessions` and is handed a token for
one identified end user, on one origin, for one product, expiring in minutes. That token is what
the page holds.

Signed, not stored. A session is created once per page load, is never read back by anything, and
would otherwise be a write on the hot path and a table that only grows. The usual argument for a
row is revocation, and it does not apply: every widget request re-reads the product, so revoking
the credential, switching support off or removing the origin takes effect on the very next call.
The signing key is derived from `APP_ENCRYPTION_KEY` with HKDF, so a widget signature can never be
confused with anything else that key protects.

The prefix differs from `ask_` on purpose. A secret that leaks into a log is only actionable if
somebody can recognise it, and one grep has to distinguish a session that has probably already
expired from a standing key into ticket creation.

### Origins

`Product.allowedOrigins` holds literal origins — `https://app.example.com`, never a pattern. They
are checked three times, and each is independent: when a session is minted, when a token is
verified (the origin is *inside* the signature), and by CORS, which reflects a registered origin
and never a wildcard and never with credentials. See `src/widget-cors.ts` for why the widget routes
get their own ruleset rather than the first-party list being widened.

## Files

| File | Responsibility |
| --- | --- |
| `machine-credential.guard.ts` | Authenticates a product rather than a person |
| `product-credentials.service.ts` | Issue, verify, rotate, revoke |
| `products.service.ts` | The registry, from the admin side |
| `support-ingress.service.ts` | Request → ordinary Desk ticket → package 8b router |
| `widget-session.service.ts` | Minting and verifying the browser token |
| `widget-session.guard.ts` | Authenticates a browser: signature, expiry, origin, live product |
| `widget-origin.registry.ts` | Which origins CORS may answer, cached |
| `support-widget.service.ts` | The credential-for-token exchange, and what the widget may render |
| `ingress-attachments.service.ts` | Staging a reporter's files before the ticket transaction |
| `products.repository.ts` | The four tables; one deliberate un-scoped lookup, by unique key |

## Endpoints

**Admin** (employee token): `GET|POST /products` · `GET|PATCH /products/:id` ·
`POST /products/:id/credentials` · `POST /products/:id/credentials/:credentialId/rotate` ·
`DELETE /products/:id/credentials/:credentialId`

**Ingress** (machine credential): `POST /support/tickets` · `GET /support/tickets/:id` ·
`POST /support/widget-sessions`

**Widget** (session token, cross-origin): `GET /support/widget/config` ·
`POST /support/widget/tickets` · `GET /support/widget/tickets/:id`

`product:read` sees the registry; `product:manage` changes it and issues credentials, and does not
leave Super Admin and Project Manager — a machine credential is a standing key into ticket
creation, closer to adding a user than to editing a setting.

## Idempotency

Send `Idempotency-Key`. The claim row and the ticket are created in **one transaction**, so a
concurrent duplicate either sees the committed claim and returns that ticket, or loses the unique
constraint on `(product_id, idempotency_key)`, rolls back, re-reads and returns the same one.
There is no ordering in which two tickets exist for one request. Keys are scoped per product,
because two products may sensibly use the same one.

On the **widget** path the key is additionally namespaced by the session's `externalUserId`, which
the controller prefixes before the ingress ever sees it. The key there is chosen entirely by a
browser, and integrators pick meaningful ones (`carelix-support-<userId>-<n>`); product-wide
scoping would make guessing one of those a way to be handed somebody else's ticket id back as a
duplicate. The server ingress keeps product-wide keys: a machine credential speaks for the product.

## Requester identity

An external reporter has no Desk account, and `Ticket.requesterId` is how every screen, report and
permission check finds the person who asked. So a product names a **support requester** — a Desk
identity in the client organization — and the real reporter is carried alongside on the ticket as
an `ExternalRequester`. Enough identity to answer them and to recognise them next time, and no
more. Creating a `User` per reporter would fill the directory with accounts nobody can sign into
and that every permission check has to skip.

## What an external caller may read back

`GET /support/tickets/:id` returns status, priority, the caller's own reference and **public
replies only** — filtered in the query, not after it. Internal notes, the routing trail, the
assignee and their availability are not in the shape and cannot start appearing by somebody
widening a query.

The **widget's** `GET /support/widget/tickets/:id` is scoped further, to the `externalUserId` the
session token was minted for. Product scope alone is what every end user of a product shares, so
without this any of them could read every other one's ticket by guessing a uuid. The server
ingress deliberately keeps the product-wide view.

## Support tiers

A product's `supportTier` now selects behaviour through `SupportTierPolicy` (see
`modules/support-tiers`): admission, the SLA policy, a minimum priority, calls, and the router's
acknowledgement and escalation minutes. Absence is neutral everywhere — a tier with no row behaves
exactly as it did before that table existed. The ingress's tier refusal joins the two switches
behind one message, keeping the uniform-refusal rule; the sentence goes to the screens instead.

## Seams left for later packages

- **Package 9 (IVR)** reads `ivrEnabled`, the project link and the ticket's assignee. This package
  configures IVR and builds no telephony.
- **Package 9b (chat)** can link a conversation to a product's project or ticket; nothing here
  forecloses it.

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
