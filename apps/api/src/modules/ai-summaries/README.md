# AI-generated progress summaries

Turns records the team already keeps — tasks, status changes, work logs, tickets, published client
updates, milestones, development activity, release notes — into a written summary of a period.
Everything generated is a draft until a person approves it, and a client sees nothing until a
second person publishes it.

**No AI company is named anywhere in this module.** The provider is an adapter behind an
interface; which one runs is configuration. A run records the provider, model, prompt version and
output version that produced it, so a summary regenerated on a different provider still says what
made each version.

## Files

| File | Responsibility |
| --- | --- |
| `injection-guard.ts` | Pure: making user-written text safe to put in a prompt, and flagging it |
| `source-selection.ts` | Pure: which record kinds each summary type may read, and the client filter |
| `prompt-builder.ts` | Pure: the versioned prompt, and the fence the sources sit inside |
| `output-guard.ts` | Pure: parsing the response, and the leakage check on client text |
| `ai-summary-workflow.ts` | Pure: which action is allowed from which state, with which permissions |
| `ai-failure.ts` | Pure: retryable versus not, for a failed provider call |
| `providers/ai-provider.interface.ts` | The seam. Nothing above it knows a vendor exists |
| `providers/http-ai.provider.ts` | A configurable HTTP adapter: endpoint, model, header, paths |
| `providers/mock-ai.provider.ts` | Builds a summary from the prompt's own records. Reaches nothing |
| `providers/ai-settings.ts` | Reading the non-secret settings off the integration connection |
| `ai-source-collector.service.ts` | The queries, tenant-scoped, gated on the authorised-source list |
| `ai-generation.service.ts` | One run end to end: collect, prompt, call, parse, check, store |
| `ai-summaries.service.ts` | Creating, editing, and the review workflow with its audit entries |
| `ai-summaries.repository.ts` | Data access; separate internal and portal queries |
| `ai-summaries.mapper.ts` / `portal-ai-summaries.mapper.ts` | Allow-list mappers, internal and client |
| `ai-summaries.queue.ts` / `.processor.ts` | Background generation on the `ai-summaries` queue |

## The workflow

```
DRAFT ──generate──▶ GENERATING ──▶ DRAFT ──submit──▶ IN_REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED
  │                     │                                │                      │
  │                     └── failure ──▶ GENERATION_FAILED │                      │
  │                                                       ├─ requestChanges ─▶ CHANGES_REQUESTED
  └──────────────────── cancel ──▶ CANCELLED ─────────────┴── returnToDraft ─────┘
```

Two checks have to pass for every transition. `@RequirePermissions` on the route answers "may this
person approve at all"; `checkAiSummaryAction` answers "may this summary be approved right now".

**Approval is what stops the text being a draft.** `isDraftOutput` is true from generation until
somebody approves it, and every screen that shows unapproved text shows that badge. Nothing else
clears the flag.

**Publishing needs two permissions**: `ai-summary:approve` says the person is trusted with
generated text, `client-update:publish` says they are trusted to send something to a client.
Publishing generated text to a client needs both. Reusing the existing client-publish key rather
than inventing a new one means the people who may already publish to a client — Project Manager,
Team Lead — may publish an approved summary, and nobody else acquires the ability by accident.

`GENERATING` is a real state rather than a flag, because a run that dies leaves a row somebody has
to be able to recover.

## Summary types

Six, split by who may ever read the output:

| Type | Reads | Client may see it |
| --- | --- | --- |
| Developer daily | tasks, status changes, work logs, tickets, code activity | no |
| Team lead daily | the above plus milestones | no |
| Project progress | tasks, status changes, milestones, client updates, release notes | yes |
| Client weekly | tasks, milestones, client updates, release notes | yes |
| Release note draft | tasks, client updates, code activity, release notes | yes |
| Ticket resolution | tickets, tasks, work logs | no |

An internal type is not "a client summary that happens to be unpublished" — publishing it is not
an action the workflow offers, whatever permissions the caller holds.

## Grounding, and what is deliberately not read

`AUTHORISED_SOURCES` in `source-selection.ts` is the whole list. A summary type that is not
allowed to read work logs does not issue the query at all, rather than issuing it and filtering
afterwards — the difference matters when someone later edits the filter.

Some fields are never read from any record:

- **Task descriptions.** They hold internal detail and estimates. The title and status say what
  was worked on.
- **Internal comments.** Not a source kind at all.
- **Ticket replies and triage notes.** Only the resolution, which is what was told to the
  requester, carries over.
- **Unpublished client updates and unpublished release notes.** A draft is not a fact yet.
- **Raw commits and code reviews.** Only a merge, a release or a tag is treated as client-visible
  development activity.

For a client-facing type, records that are not themselves client-visible are dropped before the
prompt is built. The model cannot leak what it was never given.

## Prompt injection

Every source was typed by a person, and one of those people may be a client. So it is untrusted
input and the prompt is an interpreter. Four things, in order of how much they are relied on:

1. **Structure.** Instructions come first, data last, inside a fence. Nothing user-written is ever
   interpolated into the instruction section.
2. **Escaping.** `sanitiseSourceText` breaks the fence characters and the markdown fence, so a
   record cannot close its own block. It also strips zero-width and bidi-control characters, which
   are invisible in a review screen and are the standard way to hide an instruction from a human.
3. **Flagging.** Text that reads like an instruction is flagged, not removed. Removal would
   silently change what a record says. The flag becomes a warning on the review screen, because
   the reviewer is the actual control.
4. **Output checking.** `findLeakage` runs on every piece of client-facing text the model
   produces, regardless of what it was asked to do — the check is on the output, not on the
   prompt. Text a person writes or edits by hand is not checked: they can see what they wrote,
   and it still needs a second person's approval before a client sees it.

None of the first three is treated as sufficient. The guarantee that matters is that a client sees
nothing until a person has read it and approved it.

## The leakage check

For a client-facing summary, `findLeakage` compares the generated client text against the internal
material from the same period — work-log summaries and status-change notes, read separately and
never put in a prompt. It looks for:

- **Copied internal text**, as overlapping six-word windows, so a half-copied sentence is caught
  rather than only a verbatim whole record.
- **Money**, in the formats an estimate or a price is written in, including lakh and crore.
- **Another client's name**, from the tenant's other client organizations.

A finding means the client text is not stored at all. The internal text still is, and the summary
carries a note telling the reviewer to write the client version by hand — so the run is not wasted
and the reason is visible.

This is belt and braces: the internal records were already withheld from the prompt. It exists
because the cost of being wrong is a client reading an internal cost estimate.

## Failure handling

`classifyAiError` decides retryable versus not, on HTTP conventions: 5xx and 429 and 408 are worth
another attempt, 401/403/404/4xx are not. (The messaging module's SMTP classifier reads the
opposite way for 5xx. The two look alike and mean opposite things, which is why they are separate
files.)

Only a retryable failure is re-thrown from the processor. Re-throwing everything would spend the
configured attempts on a rejected credential, and each attempt is a paid call.

An unparseable response is its own outcome — `INVALID_RESPONSE`, not retried — because a model
that returned prose once will probably return prose again, and a summary nobody can parse is
better surfaced than retried.

Every run is recorded either way: provider, model, prompt version, attempt, token counts, latency,
and a failure code. Failure messages go through `redactMessage` and never contain a credential,
a prompt, or a response body.

## Versions

Regenerating writes the current text to `ai_summary_versions` first, then overwrites. So does a
hand edit. An approved or published summary cannot be regenerated or edited at all — the previous
text is always reachable, and an approval always refers to text that has not changed since.

## Duplicate runs

Two defences, because the first is only advisory. The queue job id is derived from the summary, so
two clicks collapse into one job. And `claimForGeneration` is a conditional update — the database
evaluates `status IN (DRAFT, CHANGES_REQUESTED, GENERATION_FAILED)` — so a duplicate that does get
through finds the row already claimed and stops.

The job id uses a hyphen, not a colon: BullMQ rejects a custom id containing one.

## What a client sees

`portal-ai-summaries.controller.ts`, a separate controller, reading through a query that selects no
internal column and a mapper that builds `PortalAiSummary` — a type with no field for internal
content, sources, runs, review notes or provider details. A summary with no client text is not
returned at all rather than falling back to the internal text.

The portal routes carry no `ai-summary:*` permission. A client user holds none, and requiring one
would lock them out of their own published summaries — the same arrangement as the portal release
notes and the portal invoices.

## Configuration

| Variable | Meaning |
| --- | --- |
| `AI_PROVIDER` | `mock` (default) or `http` |
| `AI_REQUEST_TIMEOUT_MS` | How long one call may take. Default 30000 |
| `AI_MAX_ATTEMPTS` | Queue attempts for a retryable failure. Default 3 |

The endpoint, model and credential are **not** environment variables. They are per-organization
settings on the `AI` integration connection, so two tenants can use different providers, and the
credential is stored through `SecretCipherService` like every other integration credential — never
returned by an API, never logged.

The default is `mock`, unlike messaging, whose default is live. A deployment with no provider
should produce nothing rather than fail every generation against a half-configured endpoint, and
unlike an email, nobody is waiting on a summary that never arrives.

## Tests

`injection-guard.spec.ts`, `source-selection.spec.ts`, `prompt-builder.spec.ts`,
`output-guard.spec.ts`, `ai-summary-workflow.spec.ts` and `ai-failure.spec.ts` cover the pure
logic: the injection cases and the ones that must *not* flag, the authorised-source table, the
fence holding against a record that tries to close it, response parsing and its refusals, the
leakage patterns, the two-permission publish rule, and the retry classification.

`test/ai-summaries.e2e-spec.ts` covers the API against the real guards and database: the workflow,
the client boundary, tenant isolation, a task title carrying an injection attempt, duplicate-run
prevention, regeneration keeping earlier versions, and the portal.

No test contacts an external provider. `test/load-env.ts` forces `AI_PROVIDER=mock`, and the mock
builds its answer from the prompt's own records — so the parse, the leakage check and the version
handling are all exercised on a real response rather than stubbed out.
