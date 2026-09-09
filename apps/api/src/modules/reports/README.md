# reports

**Owns:** Automatic daily reports (per person, per team, per day) computed from work logs and
completions, and the Phase 2 advanced reports with their CSV export.

**Phase:** 1 (daily reports) and 2 (advanced reports) — implemented. PDF export remains a later
phase.

**Entities:** report_snapshots, plus read-only queries over tasks, tickets, contracts, milestones
and change requests

**Endpoints:** `GET /reports/daily` · `GET /reports/daily/team` · `GET /reports/daily/history` ·
`GET /reports/advanced` · `GET /reports/advanced/:type` · `GET /reports/advanced/:type/export` ·
`GET /portal/reports` · `GET /portal/reports/:type` · `GET /portal/reports/:type/export`

**Rules:**
- `advanced/report-context.ts` decides what a caller may see before any query runs: the audience
  (internal or client), whether money means value or cost, and which people are in scope. Staff
  need `report:read-all` for organization-wide reports; a team lead gets the team-scoped ones over
  their own people; clients are pinned to their own organization and to client-visible data.
- Internal performance, cost and margin figures are never part of a client report.
- Export goes through the API so it can be audited (`report.exported`); `csv.ts` writes a BOM for
  Excel and neutralises formula injection.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
