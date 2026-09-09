# branding

**Owns:** what an organization is called, what its logo is, and the design tokens every screen is
built from. Also where those tokens come from: the tenant's own stored branding, or an Ashniva
Theme Manager.

**Entities:** none of its own. Branding lives in `organizations.settings.branding` as a JSON
override — a document that says only what a tenant has changed, resolved at read time over the
built-in Ashniva Desk theme. The Theme Manager *connection* is an `IntegrationConnection` with
`provider = THEME_MANAGER`, which is what gives it encrypted credentials, an enable switch, a
non-secret settings blob for the base URL, and — for the day the integration direction is decided
to be push rather than pull — a webhook secret and an idempotency index that already exist.

**Endpoints:** `GET /branding` and `GET /branding/logo` (both `@Public()` — the sign-in page has no
bearer token) · `GET|PATCH /admin/branding` and `GET /admin/branding/theme-source`
(`branding:manage`, and the write is audited).

## The three rules worth knowing before changing anything here

**1. Validation is the security boundary, not a nicety.** Every token value ends up on the
right-hand side of a CSS custom property, written into the live document with `setProperty`. A
value validated as "a string" is an injection point. So each token is checked against the grammar
of its own *kind* — colour, length, ratio, shadow, font stack — in `packages/types/src/api/
theme-values.ts`, and that one schema is applied identically to an administrator's edit, to a
document read back out of the database, and to whatever a Theme Manager returns. Three sets of
rules that were meant to agree would eventually not, and the loosest one would be the hole.

**2. The applier has an allow-list.** `applyCssProperties` writes only properties on
`SETTABLE_CSS_PROPERTIES`. The semantic tone pairs, the priority colours, the layout measurements
and the touch target are deliberately absent: they encode meaning rather than taste, and a theme
that could move them could make a "cancelled" pill look like a "done" one.

**3. Nothing here may fail a request.** `GET /branding` is public and is the first thing the web
app asks for, so a theme is not worth an error page. The resolution order is cached document → the
organization's stored branding → the built-in theme; `ThemeSource.load` never rejects and never
waits on a network round trip. Desk's *own* stored blob is read two ways, and which one depends on
who is waiting: `BrandingStore.read` is lenient on the public paths, logging an unreadable row and
serving the built-in theme, because a row that stopped parsing — `logoUrl` was any URL `new URL()`
accepted, and a theme could once only be set by hand — must not become a 500 on the first request
the sign-in page makes. `BrandingStore.readStrict` refuses instead, and is what Admin → Branding
uses: there the reader can repair the row, and a wrong brand colour shown quietly as "no overrides"
is worse than a loud failure.

## Configuration

`THEME_PROVIDER=local|remote` selects the source, defaulting to `local`. That is the opposite of
`IVR_PROVIDER`'s reasoning and on purpose: there the real adapter is the default so that forgetting
the variable cannot silently disable telephony, while here the local source is the one that always
works, and landing on a remote dependency by accident is not something a deployment should be able
to do. `THEME_CACHE_TTL_SECONDS` and `THEME_REQUEST_TIMEOUT_MS` bound the remote source.

No Theme Manager secret belongs in the environment — credentials are per tenant, on the connection,
encrypted at rest.

## What the remote source does not do

**It does not invent an API.** There is no Ashniva Theme Manager contract in this repository, so
`RemoteThemeSource` has no endpoint path compiled into it and constructs none: it reads one from
the connection's `settings.documentPath`, which has no default, and makes no request at all until
somebody supplies it. Everything that is Desk's own responsibility is real — the destination guard,
the schema, the cache, the fallback ladder — and `GET /admin/branding/theme-source` reports what is
still owed, item by item.

`docs/theme-manager-integration.md` is that list with the reasoning, including the integration
direction, which is an open product question rather than an engineering one.
