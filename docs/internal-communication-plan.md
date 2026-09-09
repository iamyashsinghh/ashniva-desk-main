# Project-scoped internal communication — design

**Status: delivered by package 9b.** This document is the design; the code that implements it
lives in `apps/api/src/modules/communication/`, `apps/web/src/features/communication/`,
`packages/types/src/workflow/communication-policy.ts` and the migrations
`20260913090000_internal_communication` / `20260913091000_conversation_permissions`.

Where the built system diverges from what is described below, the divergences are listed in
§9 rather than edited into the body, so the reasoning that produced each decision stays readable
next to what was actually done. (The one exception is the permission keys, corrected in place in
§3 — see §9.1 — because a wrong key copied out of a design document is a trap rather than a
record.)

This is deliberately **not** a company chat. Ashniva Desk already has one messaging module and it
sends transactional email and WhatsApp *outward*; this is a different thing, and the difference
that governs every decision below is that **the right to talk to somebody is derived from a shared
project, not from being an employee**. A developer on project A has no channel to a developer on
project B, and no UI, no deep link and no crafted request produces one.

---

## 1. Why the permission is computed, never listed

The obvious model — a `conversation_participants` table, add whoever you like — fails the
requirement the first time somebody is removed from a project, because the row outlives the
relationship that justified it. So the participant list is not the authority. **A relationship is
recomputed on every send, every read and every call**, from:

1. the same organization (tenant), and
2. a shared project (or a task/ticket that belongs to one), and
3. a role pairing the policy allows on that project.

A conversation stores who it is *for*; whether you may act on it today is answered by the policy
service each time. Losing your place on a project silently loses your access to its conversations,
which is the behaviour a stored participant list cannot give.

### The role pairings

Read as "may start and continue a conversation with", within one project:

| From | To |
| --- | --- |
| Developer | Team lead, project manager, the tester(s) assigned to their work |
| Tester | The developer whose work they are testing, team lead, project manager |
| Team lead | Every developer, tester and manager on the project |
| Project manager | The whole project team |
| Super admin | Read of every authorized project conversation; may participate |
| Client user | **Nothing here at all** — clients use the portal, which is a separate surface |

Two people with no shared project have no pairing and therefore no conversation, whatever their
roles. Developer↔developer is not in the table on purpose: the requirement names the pairs, and a
wider default is the kind of thing that is never narrowed later.

## 2. Entities

Four tables, all provider-internal, all `organizationId`-scoped with forced row-level security and
a provider-only policy (the same shape package 8a used — no `= app_tenant_id()` branch to widen).

**`conversation`** — `id`, `organizationId`, `projectId` (required: there is no project-less
conversation), `kind` (`PROJECT` | `TASK` | `TICKET` | `DIRECT`), `taskId?`, `ticketId?`,
`title?`, `createdById`, `createdAt`, `lastMessageAt`. A `DIRECT` conversation additionally
carries exactly two `conversation_member` rows; the other kinds are open to whoever the policy
admits, so membership is not enumerated.

**`conversation_member`** — `conversationId`, `userId`, `lastReadAt`, `mutedAt?`. This is a *read
cursor and a hint*, not an authorization record. It is what makes unread counts cheap; it never
grants access on its own.

**`message`** — `id`, `organizationId`, `conversationId`, `senderId`, `body`, `createdAt`,
`editedAt?`, `deletedAt?`, `systemKind?` (for "call started", "call ended"). Attachments reuse the
existing `files` module by `fileId`, so storage, virus policy and tenancy are not reinvented.

**`call`** — `id`, `organizationId`, `conversationId`, `projectId`, `taskId?`, `ticketId?`,
`providerCallId`, `startedAt`, `endedAt?`, `durationSeconds?`, `status`, `disposition?`,
`recordingRef?`, `recordingConsent`, plus `call_participant` rows (`userId`, `joinedAt`,
`leftAt`, `role`). **No audio is stored.** Ashniva IVR is the source of truth for the media;
`recordingRef` is an opaque provider handle that the API exchanges for a short-lived URL at
playback time, so revoking access is a policy change rather than a file deletion.

## 3. The server-side communication policy

One service, `CommunicationPolicyService`, with one entry point used by every controller,
every gateway event and the call path:

```
canCommunicate(actor, { projectId, taskId?, ticketId?, withUserId?, action })
  → { allowed: true } | { allowed: false, reason: NOT_SAME_TENANT | NOT_ON_PROJECT
                                        | ROLE_PAIR_NOT_ALLOWED | CHAT_DISABLED
                                        | CALLING_DISABLED | NO_PERMISSION }
```

The reasons are named for the same purpose the routing engine's skip reasons are: so that a refusal
can be explained rather than merely returned. The checks, in order:

1. **Tenant.** `actor.organizationId` must match the conversation's. Nothing later can rescue this.
2. **Client users are refused outright.** Internal communication is internal.
3. **Project membership.** The actor must be on the project — or hold a super-admin oversight
   permission, which is a *read* grant unless they are also a member.
4. **Linked context.** A task or ticket conversation resolves to its project first; a task that
   moves between projects moves its conversation's authority with it.
5. **Role pairing**, from the table in §1, for `DIRECT` conversations and for starting one.
6. **Feature policy** — organization- and product-level switches for chat and for calling,
   checked separately, because an organization may want chat without telephony.
7. **Permission** — `conversation:participate`, `conversation:call`,
   `conversation:inspect`, `conversation:recording-play`, each shipped by a data migration with
   its role grants, never by the seed.

The UI mirrors this to decide what to render. It is not a second implementation: the same policy
result is returned on the conversation payload, so a button that is hidden and a request that is
refused are the same decision made once.

## 4. Calling, and when it is refused

Chat → Call → Ashniva IVR → the permitted participants are bridged. The existing `IvrProvider`
boundary already bridges without exposing personal numbers, and this reuses it rather than dialling
anything itself.

**Package 9 has since built the seam this describes**, and 9b should call it rather than repeat
it. `CallLogsModule` exports `CallsService` and `CallPlacementService`; asking either for a call
gets the routing ladder, the fallback attempts, the lifecycle, the recording reference and the
audit trail that the ticket screen gets, because it is the same code. Concretely:

- `CallsService.initiate(actor, ticketId, input)` places a call about a ticket and returns the
  record. A chat-initiated call about a ticket is that call, not a parallel one.
- `CallPlacementService.advance(organizationId, callId)` is the whole ladder, and is what a
  9b-specific trigger would use if it ever needed to walk it directly.
- `canPlayRecording` in `packages/types` is the recording decision. §5 below describes the same
  rule; 9b must consume that function rather than restate it, or the two will drift and the
  drift will be in whether somebody may hear a client's voice.

What 9b still owns is the *conversation*: `conversation:call`, `canCommunicate`, the system
messages that mark a call in the thread, and the multi-party invitee checks. What it must not own
is a second way to place a call.

A call is refused — before the provider is contacted — when any of these hold:

- calling is disabled for the organization or the product,
- the actor lacks `conversation:call`,
- any invitee fails `canCommunicate` against the same project,
- the conversation's project relationship does not admit the pairing.

The call is created in `INITIATING`, and only reaches `IN_PROGRESS` on the provider's webhook, so a
provider that never answers leaves a recorded failure rather than a call that looks live forever.
A system message in the conversation marks the start and the end, which is how the call becomes
part of the thread rather than a separate history nobody opens.

## 5. Recording visibility

**A recording is not visible to everybody who was on the call.** That is the point of this section
and it is the opposite of what a naive implementation does.

| Who | Default |
| --- | --- |
| Super admin | May play |
| Project manager (of that project) | May play |
| Team lead (of that project) | May play |
| Developer, tester — including participants | Metadata only, unless granted |
| Client (portal) | **Never**, and no policy in this package can grant it |

Metadata — that a call happened, who was on it, when, how long, its disposition — is visible to the
conversation's members, because hiding that a call happened would make the thread incoherent.
The *audio* is separate: playback needs `conversation:recording-play` plus the project role above,
each playback is audited with actor, call and time, and the URL handed out is short-lived and
single-use so it cannot be forwarded.

Client visibility is a deliberate dead end. Making a recording client-visible would need a separate,
explicitly-named policy and a separate mapper into the portal DTOs; it is not a flag on this table
and cannot be reached by widening anything here.

## 6. Super-admin oversight

`conversation:inspect` grants read across the organization's project conversations: threads,
task- and ticket-linked ones, call history with participants and timestamps, and recording
references. Every inspection is itself audited — oversight that leaves no trace is indistinguishable
from a breach.

Two things it does not do. It does not reach another tenant: an inspection is still bounded by
`organizationId`, and the row-level policy enforces that beneath the service. And it does not turn
message content into a place for secrets: the existing `destination-mask` idiom applies here, tokens
and credentials pasted into a thread are the kind of thing that should be flagged and redacted at
ingest rather than faithfully preserved for whoever inspects later.

## 7. Tests this package must ship

The requirement asks specifically for proof that unrelated users cannot reach each other, so these
are stated as the acceptance criteria rather than left to judgement:

1. Two developers on different projects, same tenant → cannot create a direct conversation, cannot
   post into each other's project conversation, cannot call. Three separate assertions; the third
   is the one an implementation is most likely to forget.
2. A developer removed from a project loses access to its conversations **without any row being
   deleted** — proving the policy is computed, not stored.
3. A tester may talk to the developer whose work they test and not to an unrelated developer on the
   same project.
4. A client user is refused every endpoint in the module, including read.
5. A call is refused when calling is disabled, when one invitee is not permitted, and when the
   actor lacks the permission — each independently, so one guard cannot mask another.
6. A participant developer gets call metadata and is refused playback; a project manager is granted
   it; both are audited.
7. No portal DTO in the codebase can carry a recording reference — asserted by construction, the
   way the client-visibility mappers are already tested.
8. Cross-tenant: everything above, again, with the second organization.

## 8. Where it sits in the order

After package 9 (IVR), as **9b**. It depends on the `IvrProvider` boundary being real rather than an
interface, and on the product-level policy switches package 8c introduces. Building it before those
would mean stubbing both and rewriting the call path once they exist.

---

## 9. What was actually built, and where it diverges

### 9.1 The permission prefix is `conversation:`, not `communication:`

`communication:manage` already exists — it is Phase 3's outbound email and WhatsApp permission —
and `PERMISSION_MODULE_LABELS` is keyed by the resource prefix, so a second module under the same
prefix would have folded internal chat into the outbound-messaging group in the roles screen. The
five keys shipped are `conversation:participate`, `conversation:call`,
`conversation:recording-play`, `conversation:inspect` and `conversation:settings-manage`. The last
one is new relative to this design: the organization-wide switches need an owner, and reusing
`conversation:inspect` for them would have made oversight a write permission.

### 9.2 Playback is a permission, not a consequence of having been on the call

§5 left "the participants" as a plausible playback scope. The delivered rule is stricter and is
what the requirement asks for: taking part in a call earns call *metadata*, never audio. Playback
needs `conversation:recording-play` **and** a project role inside the organization's configured
scope, decided by `canPlayRecording` in `packages/types` — the same function package 9 uses for
support-call recordings, so there is one answer to "may this person hear this" in the product.

### 9.3 Internal calls reuse package 9 end to end

There is no second telephony path. `CallLog` gained a `kind` discriminator (`SUPPORT` /
`INTERNAL`), a nullable `ticketId`, and `conversationId` / `taskId` links; the provider adapter,
attempt rows, lifecycle graph, webhook correlation and recording reference are package 9's
unchanged. What 9b adds is a destination policy — `InternalCallRoutingService` — whose fallback
ladder is at most two rungs long and never reaches the support queue.

`CallLogsModule` cannot import `CommunicationModule` (conversations sit above telephony, not
beside it), so package 9 hands internal calls back through `InternalCallAdvancerRegistry`, a small
typed seam documented in `internal-call-advancer.ts`. A queue was considered and rejected: a lost
job there is a dropped call.

### 9.4 The realtime seam is delivery-by-user, not delivery-by-room

`conversation.subscribe` is authorized and refused with a reason, but a successful subscription
does not put the socket in a conversation room. Messages are delivered to per-user rooms computed
at send time from live project membership, so a socket that subscribed while its owner was on the
project stops receiving content the moment they are removed — without anything having to notice
the removal and evict them.

### 9.5 Attachments reuse the files module

No second upload path exists. A file is uploaded through the existing files endpoint, its id is
passed to the send, and the message transaction adopts it — forcing `visibility: INTERNAL`, and
only when the file has no other parent, so an id belonging to somebody else's ticket cannot be
adopted into a thread.

### 9.6 The test count

The eight acceptance criteria in §7 are covered by `apps/api/test/communication.e2e-spec.ts`
(77 scenarios) and `communication-migration.e2e-spec.ts` (12), with the policy function itself
exercised by 45 unit tests in `packages/types`, the mention grammar by 17 more, the notification
audience by 7 in `apps/api`, and the chat panel by 20 in `apps/web`.

### 9.7 Editing and deleting a message

§2 listed `editedAt?` and `deletedAt?` as columns and stated no rule for either. The delivered
rules are these, and the reasoning matters more than the numbers.

**An edit is bounded by the same relationship a post is.** `COMMUNICATION_ACTION` gained `EDIT`
and `DELETE`, and `canCommunicate` decides both — per *message*, not per conversation, so the two
abilities are reported on `MessageSummary` rather than on `ConversationAbilities`. The rule is not
"the sender may edit their own message" but "the sender may edit their own message *while they
could still post here*": a developer removed from the project cannot rewrite what they wrote
yesterday, which is §1's property applied to history rather than to access.

**The edit window is fifteen minutes** (`MESSAGE_EDIT_WINDOW_MINUTES`, beside
`MAX_MESSAGE_LENGTH`). No window at all makes people delete and repost, which is worse for a
thread than an edit; an open-ended one lets somebody rewrite a decision after a colleague acted on
it. Deleting has no window, because the reason an edit expires is that a *replacement* can
mislead, and a tombstone misleads nobody.

**An edit keeps what it replaced,** in `message_revisions` (migration
`20260916090000_message_revisions`). Fifteen minutes is short but not zero, so somebody may
already have relied on the words being replaced: the window bounds the surprise, the revision
removes the loss. It is not the audit log, because a message body in an audit payload is exactly
the second, differently-governed copy §6 and `MessagesService` already refuse to make — the audit
rows carry ids and the shape of the change. Revisions are readable only through
`conversation:inspect`, and that read is audited like every other inspection.

**Deleting is soft, and oversight may do it.** `DELETE` is the one writing action an inspector is
admitted to, because it removes rather than adds; editing somebody else's message is refused to
everybody, with or without oversight, since putting words in a colleague's name is not a
moderation power this product grants. A deletion soft-deletes the attached files in the same
transaction: a blanked-out attachment list in this module plus a working download in the files
module would be a hidden deletion rather than a deletion. `DELETE` is also deliberately *not* a
"writing action" for the chat switch, because an organization that has just switched chat off is
often doing so precisely because something needs taking down.

### 9.8 Mentions

The composer §9.4 implied has been built. A mention is written `@[uuid]` — an id, so it survives a
rename and cannot be forged by typing a colleague's name — and the picker is fed by
`GET /conversations/:id/audience`, which returns the *same* audience the send path intersects a
mention against. That is what makes the offer honest: a name the picker shows is a name the
notification will reach. The grammar (`mentionsIn`, `maskMentions`, `splitMentions`) lives in
`packages/types` because three consumers share it, and unresolved mentions are masked as
`@someone` everywhere a message appears without its roster.

---

## 10. Scope messaging: what the next cycle changed, and what it deliberately did not

Everything above describes a package in which **the right to talk to somebody is derived from a
shared project**. That is still true of the four project-anchored kinds, unchanged, and the
regression tests that hold them to it were not touched. Beside them there are now two kinds with
no project at all.

### 10.1 Two more kinds, and a three-way split

`SCOPE_DIRECT` is a direct message admitted by a management relationship rather than by a shared
project — one thread per pair for the whole organization, where a `DIRECT` is one per pair per
shared project. `GROUP` is a named group of people. Both leave `conversations.project_id` null,
which is why the column became nullable, and `OPEN_CONVERSATION_KINDS` became three lists:
membership is **derived** (from the project), a **pair**, or **listed**.

`canCommunicate` branches on the presence of a scope context, which the API builds only for a row
whose `project_id` is null. The project-anchored path is therefore unreachable from the new one
and vice versa — the property a test asserts by walking every action and every role and checking
that no scope refusal can come out of a project-anchored decision.

### 10.2 The scope is derived, because there is no reporting line to read

There is no reporting-line table in this product and none was invented. `MessagingScopeService`
resolves reach from relations somebody already maintains — the members of the projects you manage
or lead and the teams you lead, plus, for a lead, the managers of those projects — so it changes
the moment the relation does, which is the same property §3 rests on.

**A developer and a tester get no new reach at all.** That is not a rule written down and hoped
for: they hold no `manager_user_id`, no `lead_user_id` and no `MANAGER`/`LEAD` membership, so every
query returns nothing. A super admin reaches the tenant through
`conversation:reach-organization` — a sixth permission, shipped by a data migration like the other
five, so a tenant can see it on the roles screen and take it away rather than discovering it in a
service that compares a role name.

### 10.3 `conversation_members` becomes authorization — for one kind

§3 and `README.md` said a member row is never consulted as authorization. For a `GROUP` it now is,
because there is no project to derive membership from. Four things bound the change: every
addition is re-checked against the adder's live scope at the moment it is made; leaving is
expressible (`left_at` rather than a deleted row, so a former member reads nothing while the thread
still renders who said what); the permission and the account remain live facts; and a
`SCOPE_DIRECT` closes when the reach that opened it goes — the person who *started* it carries
that re-check on every read and post, while the person they reached never held the reach and keeps
the thread.

A group does **not** do that last one, and the omission is deliberate rather than an oversight: its
members may come from several projects and there is no pairwise relation left to re-check, so a
group member is removed by an administrator or leaves. Anything more would be a background job
deciding to eject people from conversations, which is a product decision nobody has made.

### 10.4 §9.7 is superseded: there is no ordinary delete

§9.7 above describes a sender who may withdraw their own message at any age. That is no longer
true, and the requirement that changed it is explicit: **no normal user delete.** A conversation
whose participants may take their own words back whenever they like is a record of whatever they
still want it to say, and the tombstone did nothing about that because they chose when it appeared.

`DELETE` now refuses everybody without `conversation:inspect` — the sender included, with the same
answer a bystander gets, so the refusal says nothing about whose message it is. What survives is
the administrative redaction §9.7 already describes: permission-gated, `viaOversight: true`,
audited, soft, and taking the attachments with it. Editing is untouched — sender only, fifteen
minutes, revisions retained, oversight may never edit.

### 10.5 The anchor moved, and why that was the dangerous part

`@@unique([project_id, anchor_key])` stops enforcing anything the moment `project_id` can be null,
because PostgreSQL treats NULLs as distinct — the exact trap `anchor_key` was invented in
`20260913092000` to dodge. The index now spans `(organization_id, anchor_key)`, and the project's
id moved *into* the key for the kinds that have one. A migration test inserts real threads with the
old keys before running the migration, because the risk of moving a unique index is not that it
fails, it is that it silently re-keys a live thread.

---

## 11. The screens: what the web and the phone do with all of that

Sections 1–10 describe an API and a chat panel. This section covers the cycle that turned the panel
into a surface people can live in, on both clients. **It added no endpoint and changed no rule** —
every decision below is one the server had already made and sent back as `abilities`, or on the
message itself.

### 11.1 The existing chat was kept and improved, not replaced

`ConversationPanel` still opens a thread by anchor, and the project, task and ticket screens still
mount it exactly as they did. What changed underneath is that the thread markup moved into
`MessageThread`, so the messages screen and those embedded panels draw the same conversation the
same way. The composer, the mention picker, the attachment path, the edit window and the read
cursor are the ones §9 describes.

### 11.2 Days and runs live in `packages/types`

Where a date separator falls, and which consecutive lines belong to one person, is
`groupMessagesByDay` — shared by both apps for the reason `splitMentions` is: two clients drawing
one conversation should not each decide which side of midnight a message fell on. A day is the
*reader's* calendar day rather than UTC's, and a system note never joins a run in either direction,
or "a call was started" would lose its own line and read as something a colleague said.

### 11.3 What the two clients each got, and the one thing only the web has

Web: a searchable conversation list with unread state and an unread-only filter, the thread with
days and runs, the group affordances (create, rename, picture, add, remove, leave), the scope
directory, and `/messages/:conversationId` — the route `conversationLink` has pointed notifications
at since package 9b and which had never existed, so those links opened nothing.

The phone: the same list, thread and composer, a "new conversation" screen over the same directory,
and a group screen of its own — a phone has one column, and a member list above the thread is in
the way of the thing people opened the app for. **Setting a group's picture is web-only**: a rare
act, and it would be the only thing on that screen needing an image picker.

### 11.4 Paging, and the N+1 that was not reintroduced

The thread walks the cursor `GET /conversations/:id/messages` has always returned; the list raises
its `limit`, which is the only paging that endpoint offers. Neither client fetches per-conversation
detail to fill a row — every field a row draws is on the summary, which is what §10's query work
was for — and both have a test that asserts it rather than a comment claiming it. On the web, the
DOM a long thread accumulates is bounded a second time by `content-visibility` on each day section.

### 11.5 Calling, and where it is refused

`POST /conversations/:id/calls` refuses a conversation with no project outright: everything an
internal call needs — the fallback destination, the recording playback scope, the roles that decide
both — comes from a project. Both clients therefore ask whether the conversation has one as well as
what `abilities.canCall` says, and a scope thread states where calls come from instead of offering
a control that would answer 400.

**A gap worth naming rather than papering over:** `abilities.canCall` can still come back true for a
`GROUP`, because `scopeDecision` reaches its `CALL` branch and returns `allow()` when calling is
switched on and the caller holds the permission — only the endpoint knows better. Nothing is
insecure about that; the endpoint refuses. But an ability the API contradicts is the kind of
disagreement §1 exists to prevent, and the honest fix is in `abilitiesForMany`, not in a client.

### 11.6 Notifications were wired already

A direct message notifies, a mention inside a shared thread notifies, and a group deliberately does
not — it is treated like a project channel, because a thread that pings everybody on every line is
one people switch off. De-duplication, grouping, quiet hours and the rate limit are the
dispatcher's, and there is no second delivery path. Email and WhatsApp stay off by decision:
`ACTIVE_NOTIFICATION_CHANNELS` holds `IN_APP` alone and the preferences screens render the other
two inert. The only thing this cycle added was the route those notifications point at.
