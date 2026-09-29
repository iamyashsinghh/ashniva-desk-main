# users

**Owns:** User profiles, invitations, activation/suspension, per-user settings (show Development section, default view, timezone) and each person's profile picture.

**Planned phase:** Phase 1 (order 2)

**Entities:** users, user_settings

**Endpoints:** GET|POST /users · PATCH /users/:id · POST /users/:id/roles · PATCH /admin/users/:id/settings · PATCH /users/:id/availability · POST|PUT|DELETE /users/me/avatar · GET /users/:id/avatar

**Profile pictures** (`user-avatar.*`): a person has a photo, a built-in preset (`AVATAR_PRESETS`)
or nothing, never two. The photo is stored under `avatars/<userId>/<uuid>.<ext>` in the same
object storage as attachments; its type comes from the bytes (JPEG, PNG or WebP, 2 MB max), never
from the name or the client's content type. Payloads carry a `UserAvatar` from `toUserAvatar` —
the storage key never leaves the API. `GET /users/:id/avatar?v=<version>` serves the photo to the
person themselves or to anybody in their current organization; everybody else, and a person with no
photo, gets 404. The version changes on every change, so the response is cacheable forever.

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
