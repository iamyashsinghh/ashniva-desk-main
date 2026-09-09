# Theme Manager integration — what Ashniva Desk needs from the Ashniva Theme Manager

Ashniva Desk's theming is built and tested. What it cannot do is take a theme from the Ashniva
Theme Manager, because **no integration contract for that product exists in this repository**.

An exhaustive search of this codebase for "theme manager", "theme-manager", "ThemeManager", "theme
service" and "token api" returns four hits, all of them doc comments saying what something *is
not* — each one disambiguating Desk's client approvals from the Theme Manager's publishing
approvals. There is no client, no adapter, no DTO, no endpoint, no column and no environment
variable. Nothing in any `.env.example`. That is the entire prior art.

This document is the shopping list. It exists so that whoever can get answers out of the Theme
Manager team knows exactly what to bring back, and so that nobody is tempted to guess. **A guessed
endpoint would be worse than the current refusal**: it would look like a working integration, and
because a theme is the first thing anybody sees, it would fail on the sign-in page of whichever
tenant turned it on.

The same list is served by `GET /admin/branding/theme-source` as `ThemeSourceReadiness.missing`,
so an administrator sees it next to the switch it governs rather than only here.

## 1. What is already done, and is not waiting on anybody

Everything on Desk's side of the boundary:

- **The write path.** `PATCH /admin/branding` under `branding:manage`, audited, tenant-scoped by
  construction — there is no organization parameter anywhere on it. Until this branch, branding
  could only be changed by editing a JSON blob in the database by hand, despite
  `branding.module.ts` having promised the endpoint "in Phase 1".
- **A real theme document.** A versioned document covering every family that exists in
  `packages/ui/src/tokens/tokens.css` — colour, typography, spacing, radius, shadow and focus —
  replacing the three colours the contract carried before. Every field is optional over a complete
  default, so a partial document is a partial override and never a broken page.
- **Validation as a security boundary.** These values are written into CSS custom properties, so
  every token is checked against the grammar of its own *kind*: a colour is `#rrggbb`, a length is
  a bounded number and one of three units, a ratio is a number, a shadow is one pinned layer, a
  font stack admits no `url(`. Nothing is validated as "a string", the lengths are capped as
  tightly as the values they describe, and an unknown token or family is refused rather than
  ignored.
- **An allow-listed applier.** `applyCssProperties` writes only properties on
  `SETTABLE_CSS_PROPERTIES`; anything else is dropped. The semantic tone pairs, the priority
  colours, the layout measurements and the touch target are deliberately not on it — they encode
  meaning rather than taste, and a theme that could move them could make a "cancelled" pill look
  like a "done" one.
- **The consumption seam.** `ThemeSource` with two implementations, selected by
  `THEME_PROVIDER=local|remote`, the same `useFactory` shape the messaging, AI and IVR modules use.
- **Outbound requests through the shared destination guard.** `SafeHttpService`, which refuses
  loopback, private, link-local and cloud-metadata addresses, pins the connection to the address it
  checked, and re-checks every redirect. There is no raw `fetch` anywhere in this feature.
- **Per-tenant credentials**, AES-256-GCM encrypted at rest on a `THEME_MANAGER`
  `IntegrationConnection`.
- **A 64 KB cap on the response.** A theme document is a few kilobytes of bounded tokens, so
  anything near that is broken or hostile; without the cap each API instance would buffer and
  validate up to `SafeHttpService`'s 5 MB default, per tenant, per TTL.
- **A last-good-document cache with a TTL**, served while a refresh runs behind the request.
- **The fallback ladder**, which is the part that matters most: cached document → the
  organization's stored branding → the built-in Ashniva Desk theme. No request waits on the Theme
  Manager, and nothing it does can throw into a response path.

Turning this into a working integration is one file —
`apps/api/src/modules/branding/theme/remote-theme.source.ts` — plus, depending on the answers to
§4, a translation layer. Nothing above the seam changes.

## 2. The integration direction — the first question, and a product one

This is genuinely undecided, and it is not an engineering decision. Everything in §3 to §7 depends
on it.

### 2.1 Pull — Desk fetches

Desk asks the Theme Manager for a tenant's live document, on a schedule bounded by a TTL. This is
what the code on this branch is shaped for, because it is the only option that works with no
cooperation from the other side beyond an endpoint.

- **Implies:** a documented read endpoint, an authentication scheme, and a polling interval the
  Theme Manager is willing to be asked at.
- **Costs:** a published theme takes up to one TTL to appear, times the number of API instances,
  because the cache is per process (§6). Desk polls whether or not anything changed.
- **Best when:** themes change rarely and the Theme Manager cannot be asked to call out.

### 2.2 Push — the Theme Manager POSTs to a Desk webhook

The Theme Manager notifies Desk when a theme is published, and Desk stores it.

- **Implies:** the Theme Manager has to sign deliveries, retry them, and say which tenant each one
  is for.
- **Desk's half is the cheap half and already exists**, built and tested for the WhatsApp and IVR
  intakes: `sha256=<hex>` HMAC verification over the raw request body, timing-safe; delivery
  de-duplication by an explicit delivery header falling back to the body's own digest; and tenant
  attribution where the payload *claims* an account and whichever tenant's secret verifies the
  signature *proves* it. The `THEME_MANAGER` connection already carries a `webhookSecretEncrypted`
  and an `externalAccountId` for exactly this, and `integration_events` already carries the
  idempotency index.
- **Costs:** a Desk instance must be reachable from the Theme Manager, and a missed delivery is a
  theme that silently never arrives — so a push design still wants a periodic pull as a safety net,
  which means answering §3 anyway.
- **Best when:** themes change often enough that TTL staleness is visible, and both products are
  operated by the same team.

### 2.3 Build-time — a shared token package

The Theme Manager publishes `@ashniva/tokens`; Desk depends on it and ships the tokens in its
bundle.

- **Implies:** no runtime integration at all — no endpoint, no credential, no cache, no failure
  mode. It is by far the cheapest and most reliable option.
- **Costs:** and it gives up the thing the whole exercise is for. Tokens become identical for every
  tenant on a deployment and change only on a Desk release, so *per-tenant* theming would still
  have to come from the local source. It answers "one shared design system", not "each client sees
  their own brand".
- **Best when:** the Theme Manager is a design-system authority rather than a per-client theming
  product.

### 2.4 Recommendation

**Pull, with the door left open to push.** Pull is the only option that needs nothing from the
Theme Manager but a documented endpoint, it is what the fallback ladder is already built around,
and its worst case is staleness rather than a wrong theme. The connection already stores the
webhook secret, so adding a push notification later is an invalidation callback rather than a
redesign — the fetch path stays exactly as it is and the callback only shortens the TTL.

A build-time package is worth doing *as well* if the two products should share a single canonical
default theme, but it is not a substitute: it cannot vary per tenant.

## 3. What is missing — the Theme Manager's half

### 3.1 The document endpoint

Desk calls a read endpoint for one tenant and expects a theme document back. Required:

- the URL path and HTTP method;
- how a tenant is identified in that request — a path segment, a header, or the credential itself;
- the success response, and specifically whether the body *is* the document or wraps it;
- which error statuses mean "nothing published for this tenant yet" rather than "something is
  broken". The two deserve different behaviour and only one is worth retrying.

Until this arrives, `RemoteThemeSource` makes **no request at all**. It reads the path from the
connection's `settings.documentPath`, which has no default, and refuses to construct one.

### 3.2 Authentication and the base URL

The connection models **one** opaque credential plus a base URL. That is enough for a static API
key and not enough for anything else. Required:

- the scheme: static API key header, HTTP Basic, or OAuth2 client credentials;
- the exact header name and value format. Desk currently sends `Authorization: Bearer <credential>`
  unless the connection overrides it — **that is Desk's own convention, not a documented one**;
- if OAuth2: the token endpoint, the scopes, and the refresh and expiry behaviour. The connection
  would then need a client id, a client secret and an expiry, and would refresh before
  `credentialsExpireAt` the way other integrations already do;
- whether the API host is per tenant or per region.

Plain HTTP is refused outright by the destination guard, because the credential would go in clear.

## 4. The token document and its schema

Desk's document is version `1` and looks like this — the whole vocabulary, with every field
optional:

```json
{
  "version": 1,
  "colors": {
    "brandPrimary": "#3b5fa0", "brandSecondary": "#1b1c1e", "brandAccent": "#1f6b43",
    "background": "#f4f4f2", "surface": "#ffffff", "surfaceMuted": "#f6f6f4",
    "border": "#e4e4e0", "borderSubtle": "#efefec", "borderStrong": "#d6d6d2",
    "text": "#1b1c1e", "textMuted": "#6b6c70", "textFaint": "#8b8c90",
    "textOnBrand": "#ffffff", "danger": "#a8321f"
  },
  "typography": {
    "fontSans": "'IBM Plex Sans', Arial, sans-serif", "fontMono": "'IBM Plex Mono', monospace",
    "sizeXs": "11px", "sizeSm": "12.5px", "sizeMd": "13.5px",
    "sizeLg": "16px", "sizeXl": "20px", "size2xl": "26px", "lineHeight": 1.45
  },
  "spacing": { "space1": "4px", "space2": "8px", "space3": "12px", "space4": "16px",
               "space5": "20px", "space6": "24px", "space8": "32px" },
  "radius": { "sm": "4px", "md": "6px", "lg": "8px", "pill": "999px" },
  "shadow": { "sm": "0 1px 2px rgba(0, 0, 0, 0.06)", "md": "0 4px 16px rgba(0, 0, 0, 0.1)" },
  "focus": { "ring": "0 0 0 3px rgba(59, 95, 160, 0.35)" }
}
```

The value grammars are strict, and deliberately so — every one of these ends up on the right-hand
side of a CSS custom property:

| Kind | Rule |
| --- | --- |
| Colour | `#rrggbb`. No shorthand, no alpha, no colour function, no `var()`. |
| Length | `0` or a number up to four digits, three decimals, unit `px`, `rem` or `em`. No `calc()`, no unitless value. |
| Ratio | A JSON number between 0.5 and 4. A number, not a string, so there is nothing to escape. |
| Shadow | One layer: `<x> <y> <blur> [spread] rgba(r, g, b, a)`, or `none`. |
| Font stack | Letters, digits, spaces, hyphens, dots, commas and quotes, up to 160 characters. No `url(`, so a theme cannot make a browser fetch a font from an address the theme chose. |
| Logo URL | `https`, or `http` only on loopback. The logo is an `<img src>` on the sign-in page: plain HTTP there is mixed content a browser blocks on an HTTPS deployment, and a picture anything on the path can substitute. |

An unknown family or token is **refused**, not ignored: a document written against a newer schema
should fail loudly rather than quietly lose half of itself.

**Required from the Theme Manager:**

- the token vocabulary it publishes, mapped onto the six families above;
- how it expresses a value Desk refuses today — a colour with alpha, a multi-layer shadow, a length
  in an unsupported unit. Each of those is either a translation in the adapter or a schema change
  with a version bump, and which one it is has to be decided per case rather than by loosening a
  rule;
- **whether a published theme is complete or a partial override.** Desk treats an absent token as
  "inherit the default". If the Theme Manager's convention is the opposite — absent means "unset" —
  then every document would silently reset the tokens it does not mention, and that is a difference
  that will not show up in testing until somebody publishes a two-token theme.

### 4.1 Version negotiation

Desk understands exactly one version and refuses any other, rather than half-applying a document.
That is the right default — a page that is neither the old theme nor the new one is worse than the
old theme — but it needs a counterpart. Required:

- where the version appears in the document, and whether it is an integer or a semantic version;
- whether a consumer can *ask* for a version it understands, or only take whatever is published;
- what the Theme Manager expects a consumer to do when it cannot read the current version. Desk's
  answer is to keep serving the last good document and report the refusal; both sides should agree
  on that before either relies on it.

## 5. The publishing lifecycle — which theme is live

**Desk has nothing here today, and that is worth stating plainly.**
`organizations.settings.branding` is a single untracked JSON blob on the organization row. There is
no `themeVersion`, no history, no draft state, no publication timestamp and no rollback: the only
record that a theme changed at all is the audit entry `branding.updated`, which carries the whole
document before and after and is therefore the *only* way to reconstruct a previous theme.

Required from the Theme Manager:

- how a theme is promoted from draft to live, and whether that is per tenant or global;
- how a rollback is requested, and whether previous versions stay retrievable;
- whether the Theme Manager tells Desk that the live version changed, or Desk finds out by polling
  — which is the direction question from §2 wearing different clothes.

What Desk would owe in return, once that is answered: a `themeVersion` alongside the stored
document, so "which version is this tenant on?" has an answer that does not involve reading the
audit log, and so an invalidation callback naming a version has something to compare against.

## 6. Caching and invalidation

Today: an in-process `Map`, TTL `THEME_CACHE_TTL_SECONDS` (default 300), fetched in the background
and served stale while the refresh runs. In process rather than in Redis on purpose — a cache whose
job is to survive an outage should not itself depend on another service over the network. The cost
is that each API instance warms its own copy, so a newly published theme takes up to one TTL to
appear and nothing can shorten it.

Required:

- a cache-validation mechanism — an `ETag`, a `Last-Modified`, or a version endpoint cheap enough
  to poll often. Any of the three turns most refreshes into a 304 and makes a shorter TTL
  affordable;
- a recommended poll interval and the rate limit behind it;
- whether an invalidation callback is available, which would make the TTL a safety net rather than
  the mechanism.

## 7. Operational limits

- request rate limits, and what a throttled response looks like;
- a sandbox tenant that can be published to without affecting anyone;
- the expected availability, so it is clear whether the fallback ladder is a rare path or a daily
  one.

## 8. Health checks — deliberately not in `GET /health`

**Recommendation: the Theme Manager must not appear in `GET /health`, and this is not an
oversight.**

`GET /health` is a readiness probe. Its answer decides whether a load balancer sends traffic to an
API instance, so everything in it is a component Desk genuinely cannot serve requests without —
the database, Redis, object storage. The Theme Manager is not one of those. Desk is *required* to
work when it is unreachable, and the whole fallback ladder exists to make that true.

Putting it in the readiness probe would invert that: a Theme Manager outage would start failing
health checks, instances would be pulled from rotation, and a theming service being down would take
the product down — the exact failure the design spends its complexity avoiding. It would also be
dishonest, because the instance would be perfectly capable of serving every request.

Where it belongs instead, and where it is: `GET /admin/branding/theme-source`, behind
`branding:manage`, next to the switch that governs it. That report says what is working, what is
missing item by item, what Desk does meanwhile, and when a document was last served. An
administrator can act on it; a load balancer has no business reading it.

## 9. Environment and configuration

| Variable | Meaning |
| --- | --- |
| `THEME_PROVIDER` | `local` (default) or `remote`. `local` is the default — the opposite of `IVR_PROVIDER`'s reasoning, and on purpose: there the real adapter is the default so forgetting the variable cannot silently disable telephony, while here the local source is the one that always works, and landing on a remote dependency by accident is not something a deployment should be able to do. |
| `THEME_CACHE_TTL_SECONDS` | How long a fetched document is served before a background refresh. Default 300. Bounds staleness, not latency. |
| `THEME_REQUEST_TIMEOUT_MS` | How long one fetch may take before it is abandoned and the cache kept. Default 5000. |

**No Theme Manager secret belongs in the environment.** Credentials are per tenant, on the
`THEME_MANAGER` `IntegrationConnection`:

| Field | Meaning |
| --- | --- |
| `settings.baseUrl` | The Theme Manager host for this tenant. Non-secret; checked by the destination guard before any connection is opened. |
| `settings.documentPath` | The path the document is read from. **No default** — Desk will not guess an endpoint, and makes no request until this is supplied. |
| `settings.authHeader` / `settings.authPrefix` | Optional overrides; default `Authorization` and `Bearer `. Desk's convention until §3.2 is answered. |
| `encryptedCredentials` | AES-256-GCM at rest. Never logged, audited or returned. |
| `webhookSecretEncrypted` | Unused today. Already here for a push direction. |
| `externalAccountId` | Unused today. What an inbound delivery would claim, and what a signature would prove. |

## 10. What happens today, and why it is not a bug

With `THEME_PROVIDER=local` — the default — nothing changes. The tenant's own stored branding is
served, edited from Admin → Branding, and no external service is involved.

With `THEME_PROVIDER=remote` and no answers to §3, Desk starts normally, signing in works,
`GET /branding` returns a complete theme, and the theme served is the organization's stored
branding or the built-in default. `RemoteThemeSource` makes no HTTP request at all while no
document path is configured, and `GET /admin/branding/theme-source` reports `healthy: false` with
this document's list underneath it.

That is the correct failure: it is visible where an administrator will see it, it costs a tenant
their newest tokens and nothing else, and **no theme published in the Theme Manager reaches Desk**.
Nobody has to discover that from a client asking why the portal is the wrong colour.

## 11. Mobile

Out of scope on this branch, and a different shape of problem. `apps/mobile` consumes the same
tokens as a TypeScript object from `@ashniva/ui/tokens` rather than as CSS, because a stylesheet is
web-only — so it needs the resolved document turned into a theme object, not custom properties.

The architecture supports it: `GET /branding` already returns the complete resolved document,
`resolveThemeDocument` is in `packages/types` and has no DOM dependency, and the allow-list in
`packages/ui` maps document tokens to variable names in one pure function that a React Native
equivalent would mirror. What it would take is a `themeFromDocument(document)` beside
`themeCssProperties`, and for `App.tsx` to pass the fetched branding into the theme provider —
which it does not do today, so tenant branding never reaches the phone at all. The
`feat/package-12-mobile` branch owns that wiring.

## 12. What lands when the answers arrive

Only `apps/api/src/modules/branding/theme/remote-theme.source.ts`, plus — depending on §4 — a
translation layer between the Theme Manager's vocabulary and Desk's, and — depending on §5 — a
`themeVersion` on the stored branding. Everything else, including every test above the seam, is
already written and stays as it is.

That is the point of the seam.
