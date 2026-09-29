# auth

**Owns:** login, refresh-token rotation, logout, password reset, invitation acceptance, the JWT
access token format and the global `JwtAuthGuard` / `PermissionsGuard`.

**Phase 0 (done):** `PasswordHashingService` (argon2id), `TokenService` (JWT access tokens),
`RefreshTokenService` (opaque hashed tokens, rotation, reuse detection, remote logout), guards,
and `GET /auth/me` (proves the guard chain end to end).

**Phase 1 (done):** `POST /auth/login`, `/auth/refresh`, `/auth/logout`,
`/auth/switch-organization`, `GET /auth/me`. The access token (15 min) is returned in the body
and kept in memory by the apps; the refresh token travels only in an httpOnly, SameSite=strict
cookie scoped to `/api/v1/auth` (`auth-cookies.ts`), is stored hashed with the organization it
was opened for, rotates on every use and revokes its whole family on reuse. Reuse within 30
seconds of the rotation (`ROTATION_GRACE_MS`) is a lost reply rather than theft — an app reloaded
mid-refresh, two tabs refreshing together — and rotates the live token its chain leads to instead;
a chain that ends in a logout or revocation is still theft. A token that was itself presented and
whose replacement nobody has presented yet (`presentedAt`) is accepted however late: the reply was
lost or the request failed after the rotation committed, so no one holds the replacement. A token
retired by such a retry has no `presentedAt`, so two holders of one family cannot keep trading
retries past the window. Login is throttled
(20/min/IP) and every success, failure and logout is audited. Password change lives in the
users module (`POST /users/me/change-password`) and signs out other devices.

**Phase 2:** `/auth/forgot`, `/auth/reset`, `/auth/invite/accept` (email delivery needed).

**Entities:** `users.password_hash`, `refresh_tokens`.

**Emits:** `user.logged_in` (Phase 1).
