# organization-memberships

**Owns:** the link between a user and an organization (`organization_memberships`): role inside
that organization, job title, and per-user settings such as "show Development section".

**Phase 0 (done):** repository used by `JwtAuthGuard` to load the role and permissions.

**Phase 1:** invite user to organization, change role, remove membership, organization switch for
multi-organization users (`GET /auth/me` lists memberships).

**Entities:** `organization_memberships`.
