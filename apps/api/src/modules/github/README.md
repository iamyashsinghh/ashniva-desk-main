# github

**Owns:** GitHub App installation per organization, repository ↔ project mapping with branch roles and required checks, signed and idempotent webhooks, linking branches/commits/PRs/checks/deployments to tasks by AD-### references.

**Planned phase:** Phase 2 (order 7)

**Entities:** github_installations, github_repo_links, github_refs, webhook_events

**Endpoints:** GET /github/install-url · POST /github/webhooks · GET /github/installations · POST /projects/:id/github-link · DELETE /github-links/:id · GET /tasks/:id/github

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
