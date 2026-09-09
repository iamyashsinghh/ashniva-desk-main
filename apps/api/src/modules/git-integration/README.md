# git-integration

**Owns:** GitHub and GitLab adapters, repository ↔ project links, signature-verified webhooks,
task linking from `TSK-###` / `<CODE>-###` references, and the development-activity feed.

**Planned phase:** Phase 3 (order 2)

**Entities:** repository_links, code_activities (webhook receipts live in integration_events)

**Endpoints:** GET /git/repositories · GET|POST /projects/:id/repositories ·
DELETE /repositories/:id · GET /tasks/:id/activity · GET /projects/:id/activity ·
POST /webhooks/github · POST /webhooks/gitlab

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.

**Webhooks are the only unauthenticated write surface in Phase 3**, so the order in
`GitService.handleWebhook` is load-bearing:

1. find the repository link named in the payload — that is what resolves the tenant, since a
   webhook carries no session;
2. verify the signature over the **raw bytes** against *that tenant's* secret;
3. record the event, whose unique index rejects a redelivery;
4. only then parse and store.

Nothing before step 2 writes, and nothing after a failed step 2 runs. A payload naming an unknown
repository is turned away before anything is recorded — otherwise an anonymous caller could write
rows by inventing repository ids. Rejections carry no reason: telling a caller whether the
repository or the signature was wrong tells them which one to fix.

`rawBody: true` is set on the Nest application because the HMAC covers the exact bytes sent;
re-serialising a parsed body reorders keys and changes whitespace, failing every genuine delivery.

**Development activity is internal.** Commit messages, branch names, PR titles and reviewer names
have no client-portal route and the internal routes refuse client users outright.
