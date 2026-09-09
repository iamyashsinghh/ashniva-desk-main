# contracts

**Owns:** Contracts (fixed price, retainer, AMC, support hours, dedicated developer), the
support-hour ledger, billing periods, payment milestones, contract documents, and the client-portal
projection of all of it.

**Phase:** 2 — implemented.

**Entities:** contracts, contract_periods, contract_hour_ledger, payment_milestones, files
(documents)

**Endpoints:** `GET|POST /contracts` · `GET|PATCH /contracts/:id` · `POST /contracts/:id/archive` ·
`GET /contracts/:id/ledger` · `POST /contracts/:id/hours` (re-auth) ·
`POST /contracts/:id/periods/close` · `GET|POST /contracts/:id/payment-milestones` ·
`PATCH|DELETE /contracts/:id/payment-milestones/:paymentId` ·
`GET /portal/contracts` · `GET /portal/contracts/:id` · `GET /portal/milestones`

**Rules:**
- The ledger is append-only and every row records the balance after it, so history never needs
  recomputation. A partial unique index on the work log makes a second deduction impossible.
- Manual movements need a reason, a fresh password check (`@RequireRecentAuth`) and are audited;
  an idempotency key makes retries safe.
- Internal cost and internal notes never leave the provider: the portal mappers are allow-lists,
  and `cost:read` gates the internal figures.
- Which contract a work log consumes is decided in `contracts.repository.findHourContractForProject`
  (project contract first, then a contract for the whole client).
