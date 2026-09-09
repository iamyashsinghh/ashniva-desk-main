# communication

**Owns:** internal conversations — project channels, task threads, internal ticket threads,
direct conversations, **scope direct messages and groups** — the messages in them, the calls placed
from them, and the super-admin oversight of both.

**Not a company messenger, and not the `messaging` module.** That one sends transactional email and
WhatsApp *outward* to clients. This one is internal staff talking to each other.

## Two families of conversation, and two different sources of permission

The original rule was that **the right to talk to somebody is derived from a shared project, not
from being an employee**, and for the four project-anchored kinds that is unchanged, line for line:
a developer on project A still has no channel to a developer on project B, and no deep link,
crafted request or websocket frame produces one.

Beside them there are now two kinds with **no project at all**, whose authority is a *management
relationship* instead:

| Kind | Project | Who is in it |
| --- | --- | --- |
| `PROJECT` · `TASK` · `TICKET` | required | **derived** — whoever the project admits |
| `DIRECT` | required | **the pair**, one thread per pair *per shared project* |
| `SCOPE_DIRECT` | none | **the pair**, one thread per pair for the organization |
| `GROUP` | none | **the list** — `conversation_members` |

`packages/types` states the split as `DERIVED_MEMBERSHIP_KINDS`, `PAIR_MEMBERSHIP_KINDS` and
`LISTED_MEMBERSHIP_KINDS`, and `canCommunicate` branches on the presence of a project: a
conversation that has one is decided by exactly the code that decided it before the scope kinds
existed, and a conversation that has none by `scopeDecision`. Neither is reachable from the other.

## Who may reach whom outside a project

**`MessagingScopeService` is the only place this is answered.** Three surfaces ask — who may be
direct-messaged, who may be added to a group, and who `GET /conversations/directory` returns — and
a rule expressed three times drifts.

**There is no reporting-line table and this module does not invent one.** Reach is derived from
relations somebody already maintains:

* **Manager** — the members of the projects they manage (`projects.manager_user_id`, or a `MANAGER`
  row in `project_members`) and of the teams they lead (`teams.lead_user_id`).
* **Team lead** — the members of the teams they lead and of the projects they lead
  (`projects.lead_user_id`, or a `LEAD` row), **plus the managers of those projects**.
* **Everybody else — nothing.** A developer or a tester holds none of those relations, so every
  query returns nothing and their reach is empty. Their project, task and ticket conversations,
  the project-anchored pairing table and mentioning anybody on a shared project are untouched.
* **`conversation:reach-organization`** — the whole tenant, held by the super admin by default. A
  permission rather than a role comparison, so a tenant can see it and take it away. It is a
  *scope* grant only: an administrator who is not on a project still may not write in its threads.

Everybody the service returns is additionally a live member of the actor's own organization,
holding a non-client role and `conversation:participate`. A `CLIENT_CONTACT` project member is
excluded twice over.

## The permission is computed — and, for a group, listed

For every project-anchored kind, `conversation_members` is a **read cursor and a hint**, never
consulted as authorization. `CommunicationPolicyService` recomputes the relationship on every read,
every send, every subscription and every call. Removing somebody from a project removes their
access **without any row being deleted**, and the test that proves it deletes nothing.

**For a `GROUP` the list is the membership**, because there is no project to derive one from. That
is a real change of contract and it is bounded by four things:

1. **Every addition is re-checked against the adder's live scope** — being in a group is not a
   licence to bring in anybody at all, and the API refuses, not the screen.
2. **Leaving is expressible.** `left_at` is set rather than the row deleted, so a former member
   reads nothing from the next request onwards while the thread still renders who said what.
3. **The permission and the account are still live facts** — losing `conversation:participate`, or
   being deactivated, removes access with no row changing.
4. **A `SCOPE_DIRECT` closes when the reach that opened it goes.** The person who *started* it
   carries the re-check on every read and every post; the person they reached never held the reach
   and does not lose the thread. A group does not do this — its members may come from several
   projects and there is no pairwise relation to recheck — so a group member is removed by an
   administrator or leaves, and that is the deliberate boundary.

The judgement itself is `canCommunicate` in `packages/types`, pure and exhaustively unit-tested.
This module gathers facts; it does not decide.

### A task thread is narrower than its project

Every other project-anchored kind admits whoever the project admits. A `TASK` conversation does
not, and that is the one place the two questions come apart:

> **Reading a task tells you what the work is. Reading its thread tells you what the people doing
> it said to each other while doing it.**

Judging a task thread on project membership meant a developer was shown the task conversations of
tasks that were not theirs — found in UAT, on a project they merely belonged to. So `canCommunicate`
takes a second fact for this kind, `taskRelationship`, and a person is in the room only through:

* **a place on the work** — assignee, creator, reviewer, tester, or a live `TestingAssignment`;
* **authority over the work** — the projects they manage or lead (`projects.manager_user_id`,
  `projects.lead_user_id`, a `MANAGER`/`LEAD` row in `project_members`, or a project belonging to a
  team they lead);
* **authority over the people** — the members of teams they lead.

Not plain project membership, and not `task:read-all`: that permission makes a project manager's
task *list* the whole tenant, and it is a grant to read work rather than a place in every private
discussion of it. A super admin still reaches every thread through `conversation:inspect` —
read-only, `viaOversight`, audited, and unchanged.

The predicate lives in `TaskChatScopeService` (`modules/tasks/task-chat-scope.service.ts`), beside
`TaskVisibilityService` and built from its own `taskScopeClauses`, so there is one definition of
"this task is yours" and two sets of projects around it: the task list grants a whole project to
its members, task chat does not. `audienceFor` there is the same rule read backwards, and the fan-
out, the notification dispatcher and the mention picker all use it — a person the predicate admits
but the audience omitted would miss messages with no way to tell.

A refusal here answers **404 rather than 403**, alone in this module: a task conversation exists
because somebody opened one on a particular piece of work, so 403 would tell a colleague on the
project that this task has a discussion and roughly when it started. The audit row is written
either way.

### The pairings, for a `DIRECT` conversation inside one project

These govern the project-anchored direct kind only, and are unchanged. `SCOPE_DIRECT` does not
consult them: it has no project, so there are no project roles to pair, and the scope resolution
above is the whole of its decision. The table lives in `packages/types/src/workflow/direct-pairings.ts`.

| From | May hold a direct conversation with |
| --- | --- |
| Project manager | Manager, lead, developer, tester, support |
| Team lead | Manager, lead, developer, tester, support |
| Developer | Manager, lead, support · **tester, only with a shared task or ticket** |
| Tester | Manager, lead, support · **developer, only with a shared task or ticket** |
| Support | Manager, lead, developer, tester |
| Client contact | Nobody |
| Super admin | Read of every project conversation, through the oversight surface, always audited |

Developer↔developer is absent on purpose, and tester↔tester with it: the requirement names the
pairs, and a wider default never gets narrowed later. They still share the project channel and the
internal threads of its tickets — but **not** every task thread on it; see below. The table is
symmetric and a unit test enforces that — a one-sided pairing would let one person open a
conversation the other could not.

## Editing and deleting a message

Both are decided by `canCommunicate`, per **message** rather than per conversation — the edit
window closes on one line while the next is still fresh — so `canEdit` and `canDelete` ride on
`MessageSummary` and not on `ConversationAbilities`.

* **Editing** needs the sender *and* the relationship: the same check that would let them post
  here now. Losing the project loses the ability to rewrite the record of it.
* **The window is `MESSAGE_EDIT_WINDOW_MINUTES` (15).** Long enough for a typo, short enough that
  the odds of somebody having acted on the words are low.
* **There is no ordinary delete.** A sender used to be able to withdraw their own message at any
  age, which makes a conversation a record of whatever its participants still want it to say, and
  the tombstone did nothing about that because they chose when it appeared. `DELETE` now refuses
  everybody without `conversation:inspect` — the sender included, with the same answer a bystander
  gets, so the refusal says nothing about whose message it is. What remains is the administrative
  redaction: permission-gated, `viaOversight: true`, and audited. The soft delete, the tombstone,
  the attachment cascade and the audit row are all exactly as they were.
* **An edit keeps what it replaced** in `message_revisions`, readable only through
  `conversation:inspect` and audited when read. Not the audit log: a message body has no business
  in an audit payload, and the audit rows here carry ids and the shape of the change only.
* **Deleting is soft** — the row keeps its place so the thread still reads correctly — and it
  soft-deletes the attached files in the same transaction, so an attachment cannot survive in the
  files module a message it no longer appears on.
* **Oversight may delete and may never edit.** Removing is a moderation act; writing words in a
  colleague's name is not one, and no permission here grants it. Editing is otherwise untouched:
  the sender only, inside the window, revisions retained, `editedAt` set.
* **Both writes are conditional on the row the decision was made about** — `updateMany` pinned to
  `editedAt` and `deletedAt`, `409` when it matches nothing. Two tabs of one sender, or a sender
  and an inspector, both reach the write with the same starting row; an unconditional update would
  drop one edit with no revision recording it, which is the revision trail failing at the only
  moment it was needed.
* **The read decision is taken before the message is looked up.** Otherwise the refusal is an
  oracle: 404 for an id that is not in the thread, "cannot be changed" for a system note or a
  tombstone, "only the person who wrote it" for a live one — three facts about a conversation the
  asker was never admitted to.

## Mentions

A mention is written `@[uuid]` — an id, so it survives a rename and cannot be forged by typing a
colleague's name. `mentionsIn` / `maskMentions` / `splitMentions` live in `packages/types` because
the notification path, the conversation-list preview and the web renderer all share the grammar.

Naming an id is **not** a way to reach somebody, and it is refused rather than quietly dropped.
`ConversationMentionsService` intersects the ids in the body with the conversation's own audience
**before the row is written** — a forged id that reaches the `messages` table is in the record for
every renderer that resolves mentions, whatever the notification path then does with it. The send
path and the edit path both ask, the refused ids go to the audit trail as
`conversation.access_denied` with `attempted: MENTION`, and the caller gets a `400`.

The picker asks the same service:

```
GET /conversations/:id/mentionable?q=<search>&limit=<n>&cursor=<userId>
  → { items: [{ userId, name, email, roleName, contextLabel }], nextCursor? }
```

`limit` defaults to 10 and is capped at 25; `q` is searched **inside** the audience, so a term can
never widen it, and below two characters the endpoint returns the head of the audience in name
order rather than scanning. The candidate set is the conversation's audience — the project's
members for a channel, the task's people for a task thread, the group's members for a group — and
never the user table. `roleName` is the person's organization role and `contextLabel` the short
reason they are reachable here; both are for telling two people apart in a picker and neither is
consulted where anything is decided. An inspector gets an empty list: they may read a thread they
are not part of, but there is nobody in it for them to address.

`GET /conversations/:id/audience` returns the same audience unpaged, and is what the current web
picker still uses.

A mentioned person gets exactly one notification, through the existing dispatcher with its dedupe,
grouping, quiet hours and rate limit. Email and WhatsApp stay off — a standing product decision.

## Realtime

`conversation.subscribe` is authorized and refused when it should be. It is **not** a grant.
Messages are delivered to the *per-user* rooms of an audience recomputed at send time, because a
Socket.IO room remembers who joined and remembering is the failure this package exists to prevent.
Both halves matter: an unauthorized subscribe must fail loudly, and an authorized one must not
become permanent.

**The audience is the control, so it asks the endpoint's questions.** Per-user rooms are rooms
every connected socket is already in, which means a name on the audience list is delivery whatever
the person did or did not subscribe to. `ConversationAudienceService` therefore keeps only people
who are on the project — or, for a scope conversation, on the member list and not gone — **and**
hold `conversation:participate` — the same pair of facts
`GET /conversations/:id/messages` refuses on. A tenant may build a custom role without that
permission and still put somebody on a project; asking only about membership would hand them every
message body over their socket while the endpoint answered 403.

## Calls

Everything mechanical is package 9's — the provider adapter, the call log, the attempt rows, the
lifecycle, the webhook correlation, the recording reference. There is one IVR integration in this
product and this is not a second one.

**The destination policy is not package 9's, and must not be.** A support call walks package 8b's
chain because a client's problem belongs to whoever can take it. An internal call rings the person
it is for, and if they do not answer the organization's `internalCallFallback` decides: `NONE` by
default, or at most the project's own lead — somebody the pairing already admits. There is no
configuration that reaches further and no path from here into the support chain, because quietly
connecting a private developer-to-tester call to an unrelated support agent would be a disclosure
dressed up as a fallback.

Package 9 hands internal calls back through `InternalCallAdvancerRegistry` rather than importing
this module: conversations sit above telephony, not beside it.

## Recordings

Two independent gates, and being on the call is neither of them:

1. `canCommunicate(PLAY_RECORDING)` — do you belong in this conversation, and do you hold
   `conversation:recording-play`? That permission is not part of the developer or tester role.
2. `canPlayRecording` — the *same* function package 9 uses, against the organization's playback
   scope and your role on the project.

Every playback **and every refusal** is audited, including by a super admin. No audio is stored;
playback mints a short-lived URL from the adapter.

**Entities:** `conversations`, `conversation_members`, `messages`, `message_revisions`,
`communication_settings`,
`call_participants`. All provider-only under forced row-level security — an internal conversation
has no client-visible form, so there is no branch for one. Attachments are ordinary `files` rows
with a `message_id`, and a group's picture is an ordinary `files` row referenced by
`conversations.image_file_id`: the same upload path, content-type rules, size limit, storage key
and tenancy as every other file in the product, forced to `INTERNAL` visibility.

**Thread identity** is `(organization_id, anchor_key)`. It used to be `(project_id, anchor_key)`,
which stopped enforcing anything the moment `project_id` became nullable — PostgreSQL treats NULLs
as distinct, which is the exact trap `anchor_key` was invented to dodge in the first place. So the
project's id moved *into* the key for the kinds that have one (`PROJECT:<id>`,
`DIRECT:<projectId>:<pair>`), a scope direct message's key is the pair alone
(`SCOPE_DIRECT:<pair>`), and a group carries a random discriminator because two groups of the same
people are two groups.

**Endpoints:** `GET|POST /conversations` · `GET /conversations/contacts` ·
`GET /conversations/directory` (scope-based; not `GET /users/directory`, which lists the whole
organization for assigning work) · `POST /conversations/direct` · `POST /conversations/groups` ·
`PATCH /conversations/:id` (rename, picture — a group's owner and administrators) ·
`GET|POST /conversations/:id/members` · `DELETE /conversations/:id/members/:userId` ·
`POST /conversations/:id/leave` ·
`GET /conversations/:id` · `GET /conversations/:id/audience` ·
`GET|POST /conversations/:id/messages` ·
`PATCH|DELETE /conversations/:id/messages/:messageId` ·
`GET /conversations/:id/messages/:messageId/revisions` (`conversation:inspect`, audited) ·
`POST /conversations/:id/read` · `GET|POST /conversations/:id/calls` ·
`GET /conversations/calls/:callId/recording` · `GET|PUT /communication/settings`
(`conversation:settings-manage`) · `GET /communication/oversight/{conversations,calls}`
(`conversation:inspect`, audited).

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited —
and message bodies are never copied into an audit payload, because they already live in `messages`.
