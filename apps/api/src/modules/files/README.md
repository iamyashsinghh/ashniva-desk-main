# files

**Owns:** Uploads through presigned S3 URLs, visibility flag (internal / client), file type allow-list, virus-scan hook, download URLs with short expiry.

**Planned phase:** Phase 1 (order 4)

**Entities:** files

**Endpoints:** POST /files/presign · POST /files/:id/complete · GET /files/:id/url

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
