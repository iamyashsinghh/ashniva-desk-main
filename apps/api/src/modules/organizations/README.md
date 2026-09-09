# organizations

**Owns:** tenants — own group companies, corporate customers, contract clients, AMC clients —
and their settings (branding, notification defaults, timezone, currency).

**Phase 0 (done):** repository (`findBySlug`, `findServiceProvider`) used by the branding module.

**Phase 1:** `GET|POST /organizations`, `GET|PATCH|DELETE /organizations/:id`, admin "Companies &
clients" screen, `PATCH /admin/branding`.

**Entities:** `organizations`.
