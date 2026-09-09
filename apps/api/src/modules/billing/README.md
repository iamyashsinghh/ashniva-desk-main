# Billing and invoicing

GST invoices for an Indian service business: draft, issue, collect, chase. Money is exact
throughout — PostgreSQL `numeric`, Prisma `Decimal`, `decimal.js` in the service layer. No figure
on an invoice has ever been a JavaScript `number`.

**This is not a GST filing system.** It produces tax invoices and keeps the records behind them.
It does not file returns, reconcile GSTR data, validate a GSTIN against the GST portal, or
substitute for an accountant.

## Files

| File | Responsibility |
| --- | --- |
| `money.ts` | The `Decimal` alias, parsing, rounding, and the Indian amount-in-words |
| `invoice-calculator.ts` | Pure: the GST engine — taxable value, CGST/SGST/IGST, rounding |
| `invoice-numbering.ts` | Pure: financial year, the printed label, what the next sequence is |
| `payment-allocation.ts` | Pure: how a receipt is applied to invoices, and what it refuses |
| `invoice-rows.ts` | Pure: mapping a calculation onto the invoice, line and tax-breakdown rows |
| `billing.repository.ts` | Data access, tenant-scoped; the internal and client-facing queries |
| `billing-profile.service.ts` | The supplier's own details and numbering settings |
| `invoices.service.ts` | Reads, the preview, and drafting: create and update |
| `invoice-lifecycle.service.ts` | Issue, cancel, void, mark reminded — with their audit events |
| `invoice-snapshot.ts` | The supplier and customer details frozen onto an invoice at issue |
| `payments.service.ts` | Recording a receipt and allocating it, in one transaction |
| `invoice-pdf.service.ts` | Renders and stores the document, via the existing S3 storage |
| `invoice-pdf-layout.ts` / `-supplier.ts` | How the page is drawn, and what it prints from |
| `billing.mapper.ts` / `portal-billing.mapper.ts` | Allow-list mappers, internal and client |
| `billing-notifications.service.ts` | Issued, paid, due soon, overdue, cancelled |
| `billing.processor.ts` | The daily sweep on the `billing` queue: due-soon and overdue |

## The workflow

```
DRAFT ──issue──▶ ISSUED ──payment──▶ PARTIALLY_PAID ──payment──▶ PAID
  │                 │                      │
  │                 └──── past due ────▶ OVERDUE ──payment──▶ PAID
  │
  └──cancel──▶ CANCELLED          (ISSUED / PARTIALLY_PAID / OVERDUE) ──void──▶ VOID
```

A draft is freely editable and has no number. Everything after `DRAFT` is not: an issued invoice
carries a frozen snapshot of the supplier and customer details, and editing it is refused with a
message pointing at a credit note. `CANCELLED` is for a draft nobody relied on; `VOID` is for an
invoice that was sent and must be withdrawn — the number stays consumed, because a gap in an
invoice sequence is a question an auditor asks. Both need `invoice:void`, a reason, and both are
audited.

## Numbering

The label is `PREFIX/FY/NNNN` — `INV/2026-27/0007`. The financial year starts in April, and the
sequence restarts with it, which is why the year is part of the label: the sequence alone would
not be unique.

The number is taken inside the transaction that writes it, over a `SELECT … FOR UPDATE` on the
billing profile row. Two people issuing at the same moment serialise on that lock, so they cannot
be handed the same number. A unique index on `(organization_id, number_label)` is the backstop if
that reasoning is ever wrong. `invoices.e2e-spec` issues five invoices concurrently and asserts
five distinct labels.

Drafts carry a placeholder label until they are issued, so the sequence is never spent on an
invoice that is later abandoned.

## GST

`invoice-calculator.ts` is the only place tax is computed, and it is pure — no database, no
clock, no request. What it handles:

- **Exclusive** pricing: the unit price is the taxable value, tax is added.
- **Inclusive** pricing: the unit price already contains the tax, so
  `taxable = net ÷ (1 + rate/100)`.
- **Intra-state** (place of supply matches the supplier's state code): the tax splits into CGST
  and SGST. The split is of the *tax amount*, with SGST taking the remainder, so the two halves
  always sum back to the tax exactly — never `0.005` short on an odd paisa.
- **Inter-state**: IGST at the full rate.
- **Reverse charge**: the tax is calculated and printed, but not collected — the invoice total is
  the taxable value, because the client pays the tax directly.
- **Export** and **exempt**: no tax, and the supply type says which.
- **Discounts**: a percentage, a flat amount, or both; applied before tax, per line.
- **Rounding**: when the profile asks for it, the total rounds to the rupee and the difference is
  shown as its own line, as an Indian invoice normally does.

Rounding is half-up at two decimals, applied per line and again at the invoice total. Every
figure the API stores is one the calculator produced.

**Totals are never accepted from a caller.** `POST /invoices` takes lines and settings; it
recomputes everything. `POST /invoices/calculate` runs the same function so a preview cannot
disagree with what is saved — the browser displays figures, it does not produce them.

## Payments

A payment is one receipt. Its allocations say which invoices it settled, and the two are written
in a single transaction together with the balance updates, so a payment can never exist with
allocations that do not add up to it.

`planAllocation` validates the whole request before anything is written, and **refuses the entire
request if any single entry is bad** — a partly applied batch would leave the payment and the
invoices disagreeing, which is worse than a rejection. It refuses: overpaying an invoice,
allocating more than the payment holds, an invoice it was not given, a draft or void invoice, and
zero or negative amounts. Overpayment is refused rather than absorbed, because absorbed money is
a discrepancy nobody finds until a reconciliation.

`reference` is unique per organization, so entering the same bank reference twice is rejected
instead of double-crediting the client.

## What a client can see

The portal endpoints are in `portal-billing.controller.ts`, separate from the internal controller,
and they build their responses through `portal-billing.mapper.ts`, which is a different file with
a different type — `PortalInvoiceDetail` has no field for internal notes or status history, so
there is nothing to forget to strip.

A client sees an invoice only when it belongs to their organization and it has been issued: the
portal query excludes `DRAFT` and `CANCELLED`. Payments are visible as amounts and dates against
their own invoices, and nothing else.

The portal routes carry no `@RequirePermissions`. Granting a client the `invoice:read` permission
would open the internal `/invoices` endpoints too, since the same key guards them — so, as with
the portal release notes, access is membership plus `clientOrganizationId` scoping.

## The PDF

Rendered with pdfkit, stored through the existing S3 storage, and recorded as a `File` with
`visibility: 'CLIENT'` — it is a document the client receives.

Branding, the supplier details, the bank instructions and the terms all come from the billing
profile, so nothing is hardcoded to one company. Where an invoice carries a snapshot, the PDF
prints from the snapshot rather than the live profile: a document must not change because someone
later corrected an address.

A regeneration creates a new file rather than overwriting. The previous document stays reachable
through the invoice history, so what a client was actually sent remains readable.

`internalNotes` is never rendered. `notes` is the client-facing field.

## Notifications

Five events, all through the existing dispatcher, so channel preferences, quiet hours,
deduplication and retry apply without billing knowing about any of them: invoice issued, payment
recorded, payment due soon, invoice overdue, invoice paid, invoice cancelled.

The due-soon and overdue sweeps run on the `billing` queue once a day. Both are idempotent — the
dispatcher's deduplication key covers the invoice and the day, so a repeated run does not chase a
client twice.

## Tests

`invoice-calculator.spec.ts`, `money.spec.ts`, `invoice-numbering.spec.ts` and
`payment-allocation.spec.ts` cover the arithmetic: intra-state CGST/SGST, inter-state IGST,
inclusive and exclusive pricing, discounts, rounding, reverse charge, partial payments, and the
precision cases — awkward paise, three part-payments that must leave nothing behind, and the
values a double would mangle.

`test/billing.e2e-spec.ts` covers the API: the workflow, permissions, the client boundary, the
duplicate-reference rejection, and the concurrent-issue race.
