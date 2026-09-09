# qa

**Owns:** Testing assignments (QA, retest, live verification, UAT), the pass/fail form with evidence, automatic return-to-developer on failure, reusable test accounts with encrypted secrets, timed credential grants and the credential access log, and client UAT sign-off (internal and portal sides).

**Planned phase:** Phase 1 (order 6)

**Entities:** testing_assignments, test_results, test_accounts, credential_grants, credential_access_log, uat_requests, uat_comments

**Endpoints:** GET /qa/assignments?view=… · POST /qa/assignments/:id/{start,result,clarify,verify-live} · GET|POST /projects/:id/test-accounts · POST /test-accounts/:id/{grant,rotate,reset-data} · POST /grants/:id/reveal · GET /credential-access-log · GET|POST /uat · GET /uat/:id · POST /uat/:id/comments · GET /portal/uat · GET /portal/uat/:id · POST /portal/uat/:id/{decide,comments}

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.

**Client UAT is the one client-visible thing here.** `uat.mapper.ts` builds every UAT response
field by field from a narrow `select` in `uat.repository.ts` — no staging URL, no test account, no
pull request, no internal note can reach it — and `portal-uat.service.ts` pins every portal query
to the caller's own `clientOrganizationId`. Deciding is the client's alone: internal staff are
refused even when their role holds `uat:decide`.
