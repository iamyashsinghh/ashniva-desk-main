# Release notes

Turns completed client-visible work into a document a client reads in the portal, through a
review and approval workflow.

## Files

| File | Responsibility |
| --- | --- |
| `draft-selection.ts` | Pure: what goes into a draft, in what order, and how duplicates collapse |
| `release-note-workflow.ts` | Pure: which action is allowed from which state, with which permission |
| `release-notes.repository.ts` | Data access, including the candidate queries that read other aggregates |
| `release-note-generator.service.ts` | Draft generation and the reporting period |
| `release-notes.service.ts` | CRUD, items, and the workflow transitions with their audit events |
| `portal-release-notes.service.ts` | Client reads: published only, scoped by `clientOrganizationId` |
| `release-notes.mapper.ts` | Allow-list mappers for the internal and client shapes |
| `release-notes.queue.ts` / `.processor.ts` | Background generation on the `release-notes` queue |

## The workflow

```
DRAFT ──submit──▶ IN_REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED
  ▲                   │                      │
  │                   ├──requestChanges──▶ CHANGES_REQUESTED ──submit──▶ IN_REVIEW
  └───────────────────┴── returnToDraft ─────┘
                                    (any open state) ──cancel──▶ CANCELLED
```

Three permissions, deliberately separate: `release-note:write` to edit and submit,
`release-note:approve` to approve, send back or cancel, `release-note:publish` to publish.
Publishing is the only action a client can observe, so it is the only one that needs its own
permission. Team Lead holds approve but not publish; Project Manager holds both.

Two checks have to pass for every transition. `@RequirePermissions` on the route answers "may
this person publish at all"; `checkReleaseNoteAction` answers "may this note be published right
now" — so holding the publish permission cannot skip review by calling the endpoint directly.

## What a client can see

A client sees a note only when all of these hold:

- its status is `PUBLISHED` — `PortalReleaseNotesService` has no parameter that relaxes this;
- its `clientOrganizationId` is the caller's own organization;
- the individual item is flagged `clientVisible`.

`PortalReleaseNote` is a separate interface rather than a `Partial` of the internal detail: there
is no field for `internalNotes` or the approval trail to be mapped into, so a mapper cannot leak
one by forgetting to omit it.

The `release_note_history` table is provider-only under RLS — the approval trail names internal
reviewers and their reasons.

## Generation

`collectCandidates` filters client visibility **in SQL**, so internal work is never loaded into
memory in the first place. Code activity is limited to `MERGE`, `RELEASE` and `TAG`; raw commits
and reviews would expose internal development chatter.

Generation is additive and deterministic:

- items already on the note are left alone, so a hand-written or edited line survives a
  regenerate;
- ordering comes from (kind, occurredAt, identity), never from database row order, so
  regenerating the same period twice produces the same document;
- the reporting period defaults to "since the last published note for this project", so
  consecutive releases tile without gaps.

## Duplicate prevention

Each item stores an `identity` column — `kind:refId:externalRef` — with a unique index on
`(release_note_id, identity)`. The obvious alternative, a unique index over the three parts
directly, does **not** work: `ref_id` and `external_ref` are null for most items and Postgres
treats nulls as distinct, so duplicates would pass straight through. A hand-written line names no
source row, so it is given a unique identity instead — two different manual lines are two
different lines.

`ReleaseNotesRepository.addItems` derives the column itself, so the constraint and
`selectDraftItems` are guaranteed to compute the same key.

## Background generation

`POST /release-notes/:id/generate` with `background: true` queues the job instead of running it in
the request. The job id is the note's id, so two clicks collapse into one queued job; it runs in
the requesting user's tenant context, and it is safe to retry because generation is idempotent.
