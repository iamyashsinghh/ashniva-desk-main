# recurring-issues

**Owns:** Similar / duplicate ticket detection by product, module, version, error code and keywords (fingerprint + keyword search now; AI similarity behind an interface later), the confirm / dismiss decisions people take on its suggestions, and the recurring-issues dashboard.

**Entities:** similarity_matches, tickets.keywords / tickets.fingerprint

**Endpoints:** GET /tickets/:id/similar · POST /tickets/:id/similar/:candidateId/decide · GET /reports/recurring

**Rules:**

- **Nothing here decides anything.** The matcher ranks candidates and shows the reasons; joining
  two clients' tickets into one problem is a person's decision taken with `problem:manage`, and
  carried out by the problems module this one imports. A wrong automatic link would put one
  client's report inside another client's problem.
- `problem:suggest-duplicate` may dismiss a suggestion and may *ask* for a link; a link request
  from it is stored as the suggestion it is, waiting for somebody who may confirm it.
- **Decisions are written for both ordered pairs**, so dismissing from either ticket dismisses it
  from the other — otherwise the same pair comes back as a fresh suggestion next week and people
  learn to ignore the panel.
- The dashboard counts with two `groupBy` queries and no per-row work; the number that matters —
  distinct client organizations — is why there are two rather than one.
- **Every count is inside the report's window**, and the rows are capped at `MAX_RECURRING_ROWS`.
  Counting all of history would put the "over threshold" badge on three clients who each hit the
  same module in a different year; and `productVersion` is free text, so an integration posting a
  build hash per ticket would otherwise make one group — and one row — per ticket.
- The scoring itself is `workflow/ticket-similarity.ts` in `@ashniva/types`, exercised there.
