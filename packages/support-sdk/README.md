# @ashniva/support-sdk

The embeddable support surface for any product that raises tickets into Ashniva Desk. It is not
tied to any one Ashniva product: it knows about a base URL, a way to obtain a session, and the
shapes in `src/contract.ts`.

- **Interface version:** `SDK_INTERFACE_VERSION` (also `AshnivaSupport.version` in the browser
  build). Bumped when a method is removed, a parameter changes meaning, or a bound the server
  enforces moves — never when something is added.

---

## 1. The authentication model (read this first)

There are two credentials and they are not interchangeable.

| | `ask_<keyId>.<secret>` | `askp_<claims>.<signature>` |
| --- | --- | --- |
| Where it lives | your **backend**, only | the browser |
| How it is stored by Desk | argon2id hash | not stored — it is signed |
| Lifetime | until you rotate it | minutes |
| Scope | your whole product | one product, one end user, one origin |

**The `ask_` credential must never reach page JavaScript.** Anything in a page is readable by
everyone who loads it, and a leaked server credential raises tickets against your product until
somebody notices. The prefixes differ so that one grep over a log archive can tell them apart: an
`askp_` in a log is a session that has probably already expired, an `ask_` is an incident.

### The exchange

Your backend calls Desk once per support session:

```http
POST /api/v1/support/widget-sessions
Authorization: Bearer ask_<keyId>.<secret>
Content-Type: application/json

{
  "externalUserId": "your-own-user-id",
  "origin": "https://app.example.com",
  "name": "Meera P",
  "email": "meera@example.com"
}
```

```json
{
  "token": "askp_…",
  "expiresAt": "2026-09-17T09:15:00.000Z",
  "capabilities": { "canRaiseTicket": true, "…": "…" }
}
```

The token carries the product, the external requester, the origin and an expiry, all inside the
signature. It cannot raise a ticket for another product, as another requester, or from another
site. Register every origin your widget runs on under the product's **Allowed origins** in Desk —
literal origins such as `https://app.example.com`, never patterns. An unregistered origin is
refused twice: the CORS preflight does not answer it, and the token would not verify against it.

### Sessions expire, so hand the SDK a *function*

```ts
const client = new SupportClient({
  baseUrl: 'https://desk.example.com/api/v1',
  session: () => fetch('/our-backend/support-session', { method: 'POST' }).then((r) => r.json()),
});
```

The SDK mints on first use, re-mints shortly before expiry, and re-mints once more if the server
refuses a token anyway (rotated credential, support switched off, origin removed). Accepting a bare
token instead would push every integrator towards embedding a long-lived secret in their page.

---

## 2. Installing

```bash
pnpm add @ashniva/support-sdk
```

or, with no bundler at all:

```html
<script src="https://cdn.example.com/ashniva-support.iife.js"></script>
<script>
  const support = AshnivaSupport.mountSupportWidget({
    container: '#support',
    baseUrl: 'https://desk.example.com/api/v1',
    session: () => fetch('/our-backend/support-session', { method: 'POST' }).then((r) => r.json()),
  });
  support.open();
</script>
```

Builds shipped: ESM (`dist/esm`), CJS (`dist/cjs`), types (`dist/types`), and an IIFE/UMD browser
bundle (`dist/browser`). React is a *peer* dependency and an optional one; a plain-JavaScript host
never loads it.

---

## 3. Using it

### Vanilla JavaScript

```ts
import { mountSupportWidget } from '@ashniva/support-sdk';

const support = mountSupportWidget({
  container: '#support',
  baseUrl: 'https://desk.example.com/api/v1',
  session: mintSession,
});
await support.open();
```

### React

```tsx
import { useSupportWidget } from '@ashniva/support-sdk/react';

function SupportPanel() {
  const { state, open, submit } = useSupportWidget({
    baseUrl: 'https://desk.example.com/api/v1',
    session: mintSession,
    openOnMount: true,
  });

  if (state.kind === 'unavailable' || state.kind === 'offline') {
    return <p>{state.reason}</p>;
  }
  if (state.kind === 'submitted') {
    return <p>Thank you — your reference is {state.ticket.key}.</p>;
  }
  // …render your own form and call submit({ subject, description })
}
```

The hook is a hook and not a component on purpose: your design system has already decided what a
support form looks like. What React hosts actually lack is the plumbing.

### The client on its own

```ts
const client = new SupportClient({ baseUrl, session: mintSession });

const capabilities = await client.capabilities();
const ticket = await client.submitIssue(
  { subject: 'Sync broke', description: 'Templates stopped syncing this morning.' },
  { idempotencyKey: crypto.randomUUID() },
);
const status = await client.ticketStatus(ticket.ticketId);
const call = await client.callAvailability();
```

**Always send an `idempotencyKey` if you retry.** The same key returns the same ticket rather than
making a second one. A key is scoped to the session's own user, so two of your users may pick the
same one without ever seeing each other's ticket.

### Attachments and screenshots

```ts
import { attachmentFromCanvas, attachmentFromFile } from '@ashniva/support-sdk';

const attachments = [
  await attachmentFromFile(fileInput.files[0]),
  attachmentFromCanvas(await html2canvas(document.body)),
];
```

The SDK does not take the screenshot itself. Capturing a page needs either a permission prompt or a
DOM-rasterising library, and both are decisions for the application that owns the page. What the
SDK does is accept the result.

### Limits, checked before anything is uploaded

| Field | Bound |
| --- | --- |
| `subject` | 3–200 characters |
| `description` | 3–10,000 characters |
| `context` | ≤ 300 characters |
| `attachments` | ≤ 5 files, ≤ 10 MB each **decoded** |
| `metadata` | ≤ 20 keys, values ≤ 500 characters |

These mirror the server's own bounds and are re-checked there. Client-side validation is a
courtesy, never a control.

### States

`SupportWidget` exposes `idle`, `loading`, `ready`, `submitting`, `submitted`, `unavailable`,
`offline` and `error`. The two worth handling deliberately:

- **`unavailable`** — support is reachable and said no. `reason` is a sentence written for the
  person reading it ("Raising tickets is not part of the basic tier"). Show it as it is.
- **`offline`** — nothing came back at all: the browser is offline, the origin was refused, or your
  own backend could not mint a session. Not an answer; offer a retry.

---

## 4. Receiving status callbacks

Desk can push ticket changes to an HTTPS endpoint you configure per product (**Products → your
product → Callbacks**). Events: `ticket.created`, `ticket.assigned`, `ticket.waiting_client`,
`ticket.in_progress`, `ticket.resolved`, `ticket.closed`, `support.update`.

A delivery carries:

```
POST https://hooks.example.com/ashniva
X-Ashniva-Delivery:  0199…              the delivery id
X-Ashniva-Event:     ticket.resolved
X-Ashniva-Timestamp: 1789574400          unix seconds
X-Ashniva-Signature: sha256=<hex>
Content-Type: application/json
```

The body is the same client-safe view `GET /support/tickets/:id` returns — status, priority, title,
your own reference, and **public replies only**. There is no field for an assignee, an internal
note, a routing decision, a call recording or a root-cause analysis, and there never will be.

### Verifying a delivery

The signature is `HMAC-SHA256(secret, "<timestamp>.<raw body>")`, hex, prefixed `sha256=`.

Two rules, both load-bearing:

1. **Use the raw request body, byte for byte.** `JSON.parse` followed by `JSON.stringify` reorders
   keys and changes whitespace, so a re-serialised body produces a different HMAC and every genuine
   delivery is rejected.
2. **Reject an old timestamp.** The timestamp is inside the signature, so it cannot be moved — but
   without a window check, anyone who captures one delivery off the wire can replay it forever.
   Five minutes is the recommended window.

```js
// Node, Express. `express.raw({ type: 'application/json' })` keeps the bytes.
import { createHmac, timingSafeEqual } from 'node:crypto';

const REPLAY_WINDOW_SECONDS = 300;

app.post('/ashniva', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = Number(req.get('X-Ashniva-Timestamp'));
  if (!Number.isFinite(timestamp)) return res.sendStatus(400);
  if (Math.abs(Date.now() / 1000 - timestamp) > REPLAY_WINDOW_SECONDS) return res.sendStatus(400);

  const expected = 'sha256=' + createHmac('sha256', SIGNING_SECRET)
    .update(`${timestamp}.${req.body.toString('utf8')}`)
    .digest('hex');
  const presented = req.get('X-Ashniva-Signature') ?? '';
  // Constant time, and hashed to a fixed width first so a length mismatch is not itself a signal.
  const a = createHmac('sha256', 'len').update(expected).digest();
  const b = createHmac('sha256', 'len').update(presented).digest();
  if (!timingSafeEqual(a, b)) return res.sendStatus(401);

  // 3. Be idempotent on the delivery id. An operator can redeliver, and a retry after a 5xx sends
  //    the same id again — deliberately, so that you can safely discard what you have already seen.
  if (alreadyProcessed(req.get('X-Ashniva-Delivery'))) return res.sendStatus(200);

  handle(JSON.parse(req.body.toString('utf8')));
  res.sendStatus(200);
});
```

**Answer 2xx quickly and do the work afterwards.** Desk retries a 5xx, a 408, a 429 and a transport
failure with exponential backoff and gives up after five attempts; any other 4xx is treated as
permanent and is not retried.

**The signing secret is shown exactly once**, when the endpoint is created and when it is rotated.
Desk stores it encrypted because it has to read it back to sign with it — which is why it is not
hashed like a machine credential.

---

## 5. Packaging decisions

**The contract is inlined, not imported from `@ashniva/types`.** That package is unpublished, is
compiled for Node, and carries `zod` at runtime — none of which belongs in a bundle a customer
loads. So the handful of constants the SDK needs live in `src/contract.ts`, and
`src/contract.test.ts` imports `@ashniva/types` as a **dev** dependency to assert they still match.
The test runs in CI; nothing it imports ships.

**`build:packages` at the repository root is deliberately not widened to include this package.**
Nothing in the monorepo imports the SDK's `dist` — the API, web and mobile apps do not depend on
it, and its own typecheck needs only `@ashniva/types`, which that script already builds. Widening
it would add a Vite build to every `pnpm lint`, `pnpm typecheck` and `pnpm test` run on unrelated
pull requests for no benefit. `pnpm build` builds it, as it builds every workspace.

**Packaging follows `@ashniva/types`, not `@ashniva/ui`.** A real `dist`, `files: ["dist"]` and a
dual `exports` map, because a customer installs this one; exporting `src` the way `@ashniva/ui`
does would ship TypeScript that their build has to compile with our compiler options.

---

## 6. Example

`examples/vanilla.html` is a complete page — open it after setting `BASE_URL` and pointing
`mintSession` at a backend of yours that holds the `ask_` credential. It deliberately does not
contain one.
