# problems

**Owns:** Problem records that group related tickets from several clients (each client keeps its own ticket and private thread), the duplicate threshold, and the workflow: view related, link, create, request RCA, ask developer, assign permanent fix, add preventive test, close.

**Entities:** problems, problem_tickets, problem_questions

**Endpoints:** GET|POST /problems · GET|PATCH /problems/:id · POST /problems/:id/{tickets,request-rca,ask-developer,assign-fix,preventive-test,close}

**Rules:**

- **Internal only.** A problem names every client that reported the same fault. There is no portal
  shape for any of it, `problem:read` is deliberately not `ticket:read` (every client role holds
  the latter), and `assertInternal` refuses a client user before any of it is read.
- **The closure gate is the server's.** `problemClosureGate` in `@ashniva/types` decides, and
  `problem-closure.ts` is the one place that says what each of its facts means in the database.
  The decision travels on every detail response as `closure`, so the screen's disabled button and
  the API's refusal are the same sentence.
- **Counting is in clients, never in tickets.** `ProblemLinkingService` is where that rule lives:
  three reports from one client is one unhappy client; three from three is a fault in the product.
- **One problem per group, under a lock.** Two people confirming different candidates on the same
  ticket at once would otherwise each read "no problem yet" and each open one, splitting the client
  count between them so the threshold alert never fires. `findOrCreateForGroup` takes a
  `pg_advisory_xact_lock` on the group and re-reads inside it; no unique index can say "one problem
  per group of tickets that do not point anywhere yet".
- The analysis lives next door in `rca/`, which imports this module and is not imported by it.
