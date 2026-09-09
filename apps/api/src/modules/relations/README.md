# relations

**Owns:** Typed links between two work items of the same kind — ticket ↔ ticket and task ↔ task —
the duplicate closure that goes with one, the visibility filter that decides what a reader is told
about the far end, and the candidate list the link dialog offers.

**Entities:** ticket_relations, task_relations

**Endpoints:**
`GET|POST /tickets/:id/relations` · `DELETE /tickets/:id/relations/:relationId` ·
`GET /tickets/:id/relations/candidates` ·
`GET|POST /tasks/:id/relations` · `DELETE /tasks/:id/relations/:relationId`

## Why this is not the problems module

Package 11 already answers a question that sounds like this one, and it is worth being clear about
which is which.

- A **`Problem`** is a third record that several clients' tickets are grouped under so that a fault
  in the product can be owned, analysed and closed. It is internal-only by design, `problem:read` is
  deliberately not `ticket:read`, and creating one needs `problem:manage`. It answers *"is this a
  fault in the product, and how many clients has it reached?"*
- A **relation** is the desk's own smaller statement: *"this one is the same as that one"*, or
  *"these two belong together"*. It works for two tickets from a single client, it is visible to the
  client whose two tickets they are, and it works for tasks — none of which a problem does.

The detection is *not* duplicated. The fingerprint on every ticket row, the keyword extraction and
the ranking all belong to `recurring-issues`, and `GET /tickets/:id/relations/candidates` asks that
package's repository the same question the "Similar issues" panel asks. Two matchers would
eventually disagree about what "the same fault" means.

## Rules

- **A duplicate is a pointer plus a status, never a merge.** The user's rule for this feature is
  *do not destructively merge away ticket history*. Marking A a duplicate of B writes one row and,
  when the workflow allows the move, cancels A with a note. Nothing is moved, copied or deleted:
  both tickets keep their replies, attachments, SLA record, status history and audit trail, and the
  e2e suite asserts that by id, before and after, and again after the link is removed.
- **Unlink removes the pointer and nothing else.** A duplicate that was closed stays closed —
  `CANCELLED` has no outgoing transition, and inventing one for this feature's convenience would be
  the destructive edit the feature exists to avoid. The unlink audit entry records that a closure is
  still standing so it can be put right deliberately. `closeDuplicate: false` records the pointer
  without touching the workflow at all.
- **Direction is part of the statement.** `DUPLICATE_OF` is directed — source is the copy, target is
  the one kept — and the same row reads as "duplicate of" from one end and "duplicated by" from the
  other. `RELATED_TO` is symmetric and is stored with the ids in ascending order, so linking B to A
  when A is already linked to B collides with the unique index rather than making a second row.
- **The duplicate graph is one level deep.** `planRelation` in `@ashniva/types` refuses a self link,
  a second link for a pair that already has one, a second canonical for the same copy, a canonical
  that is itself a copy, and a copy that already has copies of its own. There is no chain, so there
  is no cycle — the refusal is structural rather than a search.
- **A link is a disclosure.** The far end of every link is loaded under the same rule that governs
  opening it directly. A far end the reader may not open comes back as `other: null` — no id, no
  key, no title — and for a client user the row is dropped entirely, because the existence of a link
  to another client's ticket is itself the disclosure. `ticket_relations` says the same thing again
  in its row-level policy: a client tenant sees a row only when **both** ends are theirs.
- **For tasks, that rule arrives through the `TASK_SCOPE` seam** (`task-scope.ts`), and it is
  applied to *all four* things a link touches: the anchor of a read, the anchor of a write, the
  anchor of a delete, and the far end that gets rendered. An anchor outside the scope is a **404**,
  matching `GET /tasks/:id`; a far end outside it is **`other: null`**. A permission gate on the
  controller says a person works with tasks — it never says whose, so `task:read` and `task:create`
  are not scope checks and this module does not treat them as any.
  `RelationsRepository.taskEdgesFor` is deliberately *not* scoped: those rows only feed
  `planRelation`, which has to see the whole neighbourhood or somebody could build a cycle through a
  task they cannot see. Nothing from them is rendered.
- **Two clients' tickets can be duplicates of one fault, and neither may learn it.** The closing note
  lands on the duplicate's own activity trail, which its client reads through `GET /tickets/:id`, so
  `duplicateCloseNote` names the ticket being kept only when both belong to the same client.
- **Writes are gated and audited.** `ticket:triage` for tickets — the permission that already gates
  converting a ticket and cancelling one as a duplicate, and one no client role may hold —
  `task:create` for tasks. Both services assert an internal actor as well, rather than trusting
  `CLIENT_SAFE_PERMISSIONS` to stay as it is. Every link and unlink writes an audit entry naming
  both ends, the type and whether a closure went with it; no titles.

## The task scope seam

The rule for *which* tasks a person may open belongs to whoever owns tasks, not here, so it arrives
through the `TASK_SCOPE` token as a `Prisma.TaskWhereInput | undefined` — `undefined` meaning "may
read everything".

That signature is deliberately identical to `TaskVisibilityService.taskWhere` on
`feat/task-visibility`, so that service **satisfies `TaskScopeProvider` structurally**. Binding them
is two lines in `relations.module.ts`:

```ts
imports: [..., TaskVisibilityModule],
providers: [{ provide: TASK_SCOPE, useExisting: TaskVisibilityService }, ...],
```

No adapter class, no logic moved, and no second copy of the rule — which is the point of the seam.

Until then `OrganizationTaskScope` answers "the tenant, and nothing narrower". That is not a rival
implementation of task visibility; it is the honest statement that this branch has none, because
this branch's own `GET /tasks/:id` and `?view=all` are tenant-only too. The two therefore agree at
every point in time, before the swap and after it.

`ticket-task-relations.e2e-spec.ts` binds a stub to the token to prove the endpoints *honour* a
"no" rather than merely asking for one: out-of-scope anchor 404 on read, write and delete; far end
masked to `other: null`; and an in-scope control on the same user so none of it can pass vacuously.
All five refusals fail against the code that ignored the scope.

The fixture also satisfies the **real** membership rule, not only the stub's: the developer is added
as a member of the fixture project, and the block asserts both that and the absence of any route
into the out-of-scope one. A stub can grant a project by fiat; `TaskVisibilityService` grants it to
managers, leads and members. Without that row the in-scope control — the test that stops the four
refusals passing vacuously — is the first thing to fail the moment the override is removed, which is
what happens as soon as both branches are on `main`.

The task relations panel on the web is still to come, and waits on `feat/task-visibility` because
`apps/web/src/features/tasks/**` belongs to that branch.
