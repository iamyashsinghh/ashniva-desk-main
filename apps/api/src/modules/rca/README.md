# rca

**Owns:** Root-cause analyses — the approved form's ten questions (what, why, affected clients and versions, introduced by, workaround, permanent fix, prevention, tests added, owner, target date) and the review that accepts them or sends them back.

**Entities:** rca_reports, rca_actions

**Endpoints:** POST /problems/:id/rca · PATCH /rca/:id/approve

**Rules:**

- **Imports `ProblemsModule`, and is not imported by it.** The dependency runs one way on purpose:
  a problem's own rules should not come to depend on the shape of a form, and the closure gate
  reads the report's status rather than asking this module anything.
- Both routes answer with the whole **problem**, because submitting or reviewing an analysis moves
  the problem's status and its closure decision — a screen that had to fetch the problem again
  would show the two disagreeing for a moment.
- A draft moves nothing; a submission takes the problem to RCA submitted, and a request for
  changes takes it back. An approved analysis is a signed record and cannot be edited in place.
- **Internal only.** §5 of the product requirements lists RCA discussions among the things a
  client is never shown, and an analysis names other clients' versions by construction.
