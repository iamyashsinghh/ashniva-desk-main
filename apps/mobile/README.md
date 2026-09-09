# @ashniva/mobile

The Ashniva Desk phone app: React Native on Expo, talking to the same API as the web app.

This is a **foundation**, not a store submission. Everything below works and is tested; what it
does not have is app-store assets, EAS build profiles, code signing, or a release pipeline.

## Running it

```
pnpm --filter @ashniva/mobile start     # Expo dev server; scan the QR code
pnpm --filter @ashniva/mobile ios       # iOS simulator
pnpm --filter @ashniva/mobile android   # Android emulator
pnpm --filter @ashniva/mobile test      # 352 tests
pnpm --filter @ashniva/mobile typecheck
pnpm --filter @ashniva/mobile build     # Metro bundle for ios and android
```

The API it talks to is `expo.extra.apiBaseUrl` in `app.json`, default
`http://localhost:3000/api/v1`. A simulator can reach `localhost`; a physical device cannot —
point it at your machine's address on the network instead. The sign-in screen says which API a
development build is using, so nobody wonders why their data is missing.

## Where authentication lives

**Not AsyncStorage.** That is an unencrypted file in the app's sandbox: readable on a rooted or
jailbroken device and present in a plain device backup, and a refresh token sitting there is a
long-lived credential in clear text.

| Value | Where | Why |
| --- | --- | --- |
| Access token | Memory only | Fifteen minutes of life. Writing it down would outlive its usefulness and its safety. |
| Refresh token | Keychain / Keystore, via `expo-secure-store` | Encrypted by the operating system, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| Cached user | Keychain / Keystore | So a cold start paints the right shell before the API answers |

The refresh token needs one thing the web does not. On the web the API sets it as an httpOnly
cookie and the browser sends it back; a native app has no cookie jar it can rely on, so the client
reads the token out of the `Set-Cookie` header and presents it as a `Cookie` header on refresh.
The API is unchanged — it reads the same header a browser sends.

Concurrent 401s share one refresh call. Two would present the same token, and the API rotates it:
the second presentation is a reuse of a spent token, which it treats as theft and revokes the
whole family.

## Session states

Four, not a boolean, because the difference changes what is drawn:

- **restoring** — the splash screen. We do not yet know.
- **signed-in** — the stored token was exchanged with the API just now.
- **offline** — there is a stored session that could not be checked. The app works from cache and
  says so. Losing your session because you opened the app in a lift is not a security improvement.
- **signed-out** — no session, or the API *refused* the stored one. Refused and unreachable are
  different answers and are treated differently.

## What is on the phone, and what is not

The phone carries the work that happens away from a desk. Administration is not here and is not
planned to be: users, roles, SLA policies, integrations, billing settings, audit history and
reports are dense, consequential and rarely urgent, and a cramped version of one of those screens
is worse than no version.

| Internal | Client |
| --- | --- |
| Home, and the five areas behind it | Home, and the two areas behind it |
| My tasks — now and upcoming → detail: start, block, unblock, log time, attach, send for review | Tickets → detail → raise → reply |
| Tickets → detail: reply, start, wait for the client, resume, resolve, call | Updates: progress summaries and releases → what changed in a release |
| Notifications | Invoices → detail |
| Projects, read-only → detail | Approvals → detail → approve, ask for changes, reject |
| Approvals → detail: send for review, publish, return to draft, withdraw | Sign-offs → detail → approve, ask for changes, ask a question |
| My time: what you have logged, by day | Profile, notification settings |
| Messages: project, task, ticket, direct and group conversations, with calls | |
| Testing: the tester queue → assignment → start → pass or fail | |
| Profile, notification settings | |

### Why those are not tabs

A bottom bar holds five entries comfortably; past that the labels truncate, and at a large text
size they truncate sooner. The internal bar was already at five — Home, Tasks, Tickets, Alerts,
You — so Projects, Messages, Testing, Approvals and My time each had to displace one, live behind
Home, or be reached from a screen. The client's bar is full too: Home, Tickets, Updates, Invoices,
You.

They live behind Home, as named rows with a sentence saying what is behind each. Nobody opens this
app more often for a project than for the tasks on it, and an unlabelled sixth icon is not a better
answer than one tap. They are also reached from the thing they are about: a task and a ticket each
open their own conversation, and a project opens its channel.

The client's Approvals row carries a count, from `GET /portal/home`. It is deliberately additive:
Home has to paint on a cold start with no network, so there is no loading state and no error state
for it — a request that fails leaves the badge off and every row still there.

Tabs and rows are both derived from **permissions**, not from a role name, so a custom role built
on the Developer template gets what its permissions justify. Every one of the nine seeded roles is
covered by a test asserting it gets a usable bar and can always reach its profile — signing out
lives there.

A tab or a row appearing is never authority. The API decides, on every request.

## The client boundary

The same as everywhere else in the system, and enforced the same way: by the API. The portal
endpoints return only published records scoped to the caller's own organization, and the phone
renders what it is given. There is no organization id in any URL this app builds, so a modified
app cannot ask for another tenant's data.

Three deliberate narrowings on the phone:

- A ticket reply from here is **always public**. The internal-note toggle exists on the web; the
  difference between the two is one switch, and getting it wrong on a phone means an internal
  remark reaching a customer. The internal discussion has its own place — the conversation attached
  to the ticket — where there is no toggle to get wrong, because nothing in it ever reaches a client.
- Task review, reassignment, override and cancel are not here. They are decisions taken with the
  full history in front of you. Start, block, unblock and send-for-review are here: they are
  statements about your own work, and you know the answer without a screen full of history.
- **Editing an approval request's wording is not here.** A request is a title and up to five
  thousand characters of client-visible summary; rewriting that on a phone, with the client's copy
  of the old wording already in their inbox, is the edit that gets regretted. Moving the request —
  send for review, publish, return to draft, withdraw — is here, and every one of those buttons
  comes from `approval.actions`, which the API computed for this caller on this request. A refused
  action is drawn greyed with the API's own reason rather than hidden, for the reason
  `task-display.ts` sets out.
- **Whose time.** `GET /work-logs` will answer with a team's or an organization's when the caller
  may see them. "My time" pins the request to the signed-in user's id and offers no control that
  widens it: a phone list of who logged how much is a ranking whatever it is titled.
- Internal conversations are refused to a client by the API at the first check of every route, and
  the app does not offer them the door. `canUseInternalChat` repeats both halves of the API's own
  test — the role key *and* whether the organization is the service provider — so a custom role in
  a client organization is caught as well as a seeded client role.

## Design

Colours come from `@ashniva/ui/tokens`, the TypeScript mirror of the web `tokens.css` — the same
values, so the two apps do not drift. The subpath matters: importing `@ashniva/ui` would pull in
web React components whose CSS imports Metro cannot bundle.

Light and dark are both written out rather than one derived from the other, and the scheme comes
from the device setting. The brand colour is a runtime override on top, not a constant.

Three rules hold everywhere, kept in `primitives.tsx` rather than in thirty screens:

- Nothing tappable is smaller than **44 points**.
- No input's text is smaller than **16 points** — below that, the platforms zoom the field.
- Every colour comes from the theme.

Font scaling is left on. Somebody who has set large text has asked for large text.

## Reads

`shared/api/queries.ts`, over React Query: `useResource` for one record, `usePagedResource` for a
cursor-paged list. The three loading states a screen actually distinguishes are separate — the
first load, a pull-to-refresh, and the next page — because conflating them makes the list flash on
every refresh.

Only the network and the 5xx range are retried. A 4xx is the API saying no, and it will say no
again.

## Writes

`shared/api/mutations.ts`: `useApiMutation`. Every write used to be an `apiRequest` wrapped in a
hand-rolled `busy` flag, a `try/catch`, an `errorMessage` and a `finally` — five lines of ceremony
per button, each of them one edit away from leaving the spinner on after a failure.

Three things it does deliberately. It **does not throw**: `run` resolves with the result or with
null and puts the reason in `error`, because a screen that has to wrap every call in a `try` in
order not to crash is a screen where somebody eventually forgets, and an unhandled rejection in
React Native is a red box over whatever the person was doing. Invalidation is **declared where the
write is defined** rather than remembered at each call site. And the error is a **sentence**, taken
from the API's own body.

## Attachments

`shared/attachments/`. Two pickers, because the two things people attach from a phone arrive by
different doors: a screenshot is in the camera roll and only `expo-image-picker` reaches it; a log
or a signed PDF is in Files, and only the document picker sees those.

The upload is `POST /files`, the same endpoint the web app uses, through the shared client — so it
carries the bearer token and shares the single-flight refresh. `send` leaves a `FormData` body
alone and lets React Native write the `Content-Type` with the boundary it generated; one of ours
would name a boundary that is not in the body, and the API would see a single unparseable part.

Size and content type are both checked on the device first, against `MAX_FILE_BYTES` and the
allow-list in `@ashniva/types` — the same values the API checks, imported rather than copied, so
they cannot drift apart. The API stays the authority; this is only so a 40 MB video or a 9 MB
screen recording is refused here rather than after minutes of cellular data. The document picker
is given the same list as a filter, but a filter is a hint — the upload checks the answer.

Images are shown rather than listed: the common attachment on a phone is a screenshot, and a
filename is not one. `GET /files/:id/download` streams through the API after its access checks, so
`Image` is given the bearer token as a header — there is no signed URL and no public bucket path.
The token is subscribed to, not read once: an image request happens outside the API client and
cannot take its retry path, so a picture whose token expired mid-scroll would stay broken until the
screen was remounted. When the shared refresh commits a new token the source is rebuilt with it.
Anything that is not an image is a row with its name and size; opening it would mean writing a
client's file to the device and handing it to another app, and that decision belongs on the web
until somebody has taken it deliberately.

## Chat, and why it polls

Conversations are refetched when the screen comes into focus, and polled every fifteen seconds
while a thread is open. There is no Socket.IO connection, and that is a decision rather than an
omission.

A socket on a phone is not the object it is in a browser tab. It has to be torn down when the app
backgrounds and rebuilt when it returns, reauthenticated against a token that rotates every fifteen
minutes, backed off across a radio that comes and goes, and reconciled with whatever was missed
while it was down. Every part of that which is wrong shows up as a conversation that has silently
stopped updating — which is worse than one that is fifteen seconds behind, because the second is at
least honest about what it is.

So the socket stays in "not done here" until it is worth building properly, rather than sitting
half-built in the app.

### The three screens

**The list** is one request per window and one more for the unread notifications, never one per
row: every field a row draws is on the summary the list endpoint returns. Filters are a scrollable
chip row rather than the web app's sidebar — a sidebar costs a column this app does not have — and
they narrow on the server where `GET /conversations` can express the chip (`kind` for Project, Task,
Ticket and Group; `unreadOnly` for Unread) and on the device where it cannot. "Direct" is the case
that cannot: it is two kinds, `DIRECT` and `SCOPE_DIRECT`, and the parameter takes one.

**That endpoint has no cursor.** It takes a `limit` and answers with that many rows in recency
order; there is no `nextCursor` on the response and no `cursor` on the DTO. So reaching further
back widens the window — 25 rows at a time to the endpoint's ceiling of 100 — rather than fetching
a page, and it is named as that in `chat-api.ts` rather than dressed up as paging. The message
history *is* cursor-paged, and that is what `onEndReached` does in the thread.

**The mention badge is derived from the notification inbox**, because the conversation list cannot
answer the question: `ConversationSummary` carries an unread total and a preview whose mentions are
masked to `@someone`. Every `CONVERSATION_MENTION` notification carries `entityType: 'conversation'`
and the conversation's id, so one request for the unread notifications badges the whole list. A
badge that cost a request per row would not be worth having.

**The thread is an inverted `FlatList`**, and that is the whole scrolling design. Index 0 renders at
the bottom, so the newest message is where the thread opens, a message arriving while somebody sits
at the bottom slides into view with no `scrollToEnd` call, and — the one that matters — a message
arriving while somebody is reading history does not yank them anywhere, because the content grows at
the far end of the list. Inversion also makes `onEndReached` mean "reached the top", which is where
older history belongs. Days and runs come from `groupMessagesByDay` in `@ashniva/types`, the same
function the web app calls, so the two cannot disagree about which side of midnight a line fell on.

The unread divider is drawn from the unread *count* rather than a read timestamp, walking back over
other people's messages the way the API counts them, and it is frozen when the thread opens: the
read cursor moves a moment later, and a "you were here" line that vanishes or walks down the screen
is worse than none.

**The composer never loses what was typed.** A dropped connection, a refused mention or an
oversized attachment leaves the draft exactly where it was, with a sentence above it. Every send
carries a `clientMessageId` held in a ref from the first attempt until one succeeds, so a retry is
the *same* send and the API returns the message the first attempt created rather than posting a
second copy — generating that id at the moment of the press, which this screen used to do, makes a
retry a new send and duplicates the message it was meant to save. That id is a uuid, because the
DTO bounds it at 64 characters and the shape this used to build — conversation id, epoch
milliseconds and a base-36 tail of no fixed width — sometimes came out at 65, which the API refused
and the held key then repeated on every retry.

A mention of somebody outside the conversation's audience is a **400 rather than a silent drop**,
which is the right behaviour and needs somewhere to land: the composer names the person who can no
longer be reached and offers to send the same words with the mention written out as an ordinary
name — rewritten rather than deleted, so the sentence keeps its addressee and nobody is silently
edited. Recognising that refusal takes the API's own error and not only the status: a 400 from this
endpoint is equally an over-long body, a bad attachment id or a `clientMessageId` past its limit,
and answering one of those with a mention remedy is a wrong diagnosis attached to a fix that cannot
work. Both halves match `apps/web/src/features/communication/components/mention-refusal.ts`
deliberately; two screens drawing the same refusal should not disagree about what it is. The picker
itself
is `GET /conversations/:id/mentionable` — the conversation's own audience, debounced, with the
limits from `@ashniva/types` rather than numbers of its own — and it writes `@[<uuid>]`, never a
name. Keyboard navigation is a desktop concern; what replaces it is a 44-point row and an explicit
Dismiss, because with the keyboard up there is often nothing behind the list to tap.

**Push notifications are not part of any of this.** There is no device table, no registration
endpoint and no push channel; `push-registration.ts` obtains an Expo token and stops. Notification
taps reach a conversation through `notification-router.ts` like every other deep link.

### Direct messages and groups

A project, task or ticket conversation is opened from the thing it is about, which is why this app
had no "new conversation" button for a long time. A **scope direct message** and a **group** are
attached to *people* instead, so there is nowhere else to start one from and Messages now carries
the button.

Who may be reached comes from `GET /conversations/directory` — the messaging question, not
`GET /users/directory`, which lists the whole organization so that work can be assigned. It is the
same resolution the create and add-member endpoints enforce, so a name shown is a name they accept,
and the reason each person is reachable is printed beside them: a directory that says "you may
message this person" without saying why invites the question every time somebody appears in or
disappears from it, and on a phone there is nowhere to go and look it up. A developer or a tester
holds none of the relations that create reach, so their directory is empty and says so.

A group's members live on their own screen rather than in a panel above the thread: this app has
one column, and a member list wedged over the conversation is in the way of the thing people came
for. Renaming, adding, removing and leaving are all there, each drawn from `abilities.canManage` or
`abilities.canLeave`. **Setting a group's picture is not** — it is a rare act, the web has it, and
it would be the only thing on that screen needing an image picker.

**A message can be edited, and cannot be withdrawn.** Those are two different decisions and the
API takes both of them.

`message.canEdit` says whether *this* line may be rewritten — the sender, inside
`MESSAGE_EDIT_WINDOW_MINUTES`, answered per message on every read because the window closes on one
line of a thread while the next is still fresh. The phone renders that answer and computes none of
its own: a window measured against the device's clock would drift from the one the server enforces.
Saving is `PATCH /conversations/:id/messages/:messageId`, which keeps what the message said before
in `message_revisions`, and the bubble says "· edited" without saying what it used to say. Emptying
a message is not an edit — the DTO is `@MinLength(1)` — so Save is inert on an empty box rather
than sending a request that will fail.

**There is no delete**, and `canDelete` is why rather than a preference. `DELETE` on a message
refuses everybody without `conversation:inspect`, the person who wrote it included and with the
same answer a bystander gets, so a control conditioned on that flag would never appear for anybody
this app is built for — and a withdraw button that only ever refuses is worse than not drawing one.
Moderation happens on the web, where the act is labelled as the administrative one it is. A
withdrawn message keeps its place in the thread and says what happened.

## Calls

Every gate is the server's answer, never a local guess.

- Starting a call about a ticket: `GET /tickets/:id/calls/availability`, asked on every render. The
  product's IVR policy, the client's support tier and whether the requester may initiate are not
  things the device can work out, and they are things it would eventually work out wrongly.
- Starting a call from a conversation: `abilities.canCall` on the conversation — **and** that the
  conversation has a project. Telephony stays project-anchored: everything an internal call needs
  comes from a project, so `POST /conversations/:id/calls` refuses a scope direct message or a
  group outright. `canCall` can still come back true there, so a scope thread says where calls come
  from rather than offering buttons that every one of them would answer 400 to.
- Playing a recording: `canPlayRecording`, computed per call and per caller. A recording is
  somebody's voice describing their problem, and "probably allowed" is not a standard to play one
  on. The API issues a short-lived URL and audits every playback and every refusal; the phone hands
  that URL to the system rather than shipping an audio player of its own.

The one place a permission held on the device is consulted is whether to *ask* for a ticket's call
history. `call:read-internal` is a hard requirement on that route, so without it the request is a
guaranteed 403, and asking anyway would put a red error on the screen of every developer who opens
a ticket. The API still decides the answer; this only avoids the question.

## Push notifications

`shared/notifications/push-registration.ts` is an abstraction over the service, for the same
reason the API's AI and messaging modules have one: the service is a deployment choice. The app
asks for a token and hands it to the API.

Permission is requested from the profile screen, not on launch. Asked at the wrong moment the
answer is usually no, and on both platforms no is permanent until somebody goes into system
settings.

## Deep links

`ashnivadesk://tickets/<id>` and an https link to the web app, so a link in an email opens the app
when it is installed and the site when it is not.

A push payload comes from a service outside the app, so `resolveDeepLink` treats it the way the
API treats a webhook body: the screen name is checked against a list, an id must be a UUID, a
detail screen without a usable id falls back rather than opening a blank page, and extra fields
are ignored rather than passed through.

That is the first of two checks, and they answer different questions. `resolveDeepLink` asks
whether the payload is safe and what it names; `notification-router` asks whether that screen
exists **for this person**. A support executive has no Tasks tab and a client has no Notifications
tab, so the same trustworthy payload has to land somewhere different for each of them — and
navigating to a tab that is not in the bar is not a crash, it is a tap that appears to have done
nothing. Anything that does not fit falls back to the person's own first tab.

`use-notification-taps` subscribes to both ways a tap arrives: the response delivered while the app
is running, and `getLastNotificationResponseAsync` for the tap that launched it. The second one is
the tap people actually make, on a locked phone, and without it that one opens the home screen.

## Tests

352, all offline. The native modules are replaced with in-memory doubles in `jest.setup.js`
rather than left to fail — and `secure-store.test.ts` asserts against those doubles that the
wrapper writes where it says it does, which is the one assertion this app most needs.

A screen test renders the real `SessionProvider` over a mocked `restoreSession` rather than a stub
of the context, through `shared/testing/harness.tsx`: what a screen is given has to be what the app
gives it, or the test proves something about a double. The harness is imported only by tests and is
not reachable from `App.tsx`, so nothing in it reaches a bundle.

| File | What it proves |
| --- | --- |
| `secure-store.test.ts` | Tokens go to secure storage; the wrapper survives a platform failure |
| `session-store.test.ts` | The access token is never written down; the cookie parsing holds |
| `auth-api.test.ts` | Refused and unreachable are different; sign-out is local-first |
| `client.test.ts` | Bearer token, one shared refresh, 4xx not retried, no tenant id in a URL |
| `tabs.test.ts` | All nine roles get a usable bar; clients get no internal tab |
| `deep-links.test.ts` | An untrusted payload cannot reach a screen or carry a bad id |
| `notification-router.test.ts` | A checked payload lands on a screen this person actually has |
| `use-notification-taps.test.tsx` | A tap — including the one that launched the app — navigates |
| `chat-access.test.ts` | No client gets a chat entry point, permission or not |
| `MessageThread.test.tsx` | Own on the right and others left, a separator per day, an unread divider, a mention drawn as a name, Edit only where `canEdit` says so and no withdraw for anybody |
| `thread-rows.test.ts` | The divider counts back the way the API counts, and stops rather than lie about unloaded history |
| `mention-draft.test.ts` | An email address opens no picker, and what is written into the body is an id |
| `mention-refusal.test.ts` | A 400 about a body's length or an attachment is not a refused mention, and the remedy keeps the name |
| `client-message-id.test.ts` | The send key is a uuid inside the API's 64 characters, on a platform with Web Crypto and on one without |
| `MessageEditor.test.tsx` | An edit reaches that one message, an emptied one is never sent, and a refusal stays open |
| `conversation-filters.test.ts` | Direct is two kinds, so it is never sent as the endpoint's one |
| `MessageComposer.test.tsx` | It sends and clears; a failure keeps every word; a retry cannot post twice; a refused mention is recoverable |
| `ConversationScreen.test.tsx` | No withdraw control for anybody, and a 404 reads as "not there for you" |
| `ConversationCalls.test.tsx` | No call action on a group or a scope direct message, with the API's own refusal in its place |
| `ConversationsScreen.test.tsx` | Search costs no request, the list never asks per conversation, and a mention badges its row |
| `NewConversationScreen.test.tsx` | The directory says why, and each action sends what the API documents |
| `GroupScreen.test.tsx` | Manage and leave are the server's answers; the owner cannot be removed |
| `mutations.test.tsx` | A refusal shows the API's words, frees the button and throws nothing |
| `attachments.test.ts` | Multipart with the bearer token; an oversized or unaccepted file never leaves the device |
| `TaskAttachments.test.tsx` | A picker that fails says so; an attachment image follows the session token |
| `task-display.test.ts` | A refusal about timing is explained; one about the person is hidden |
| `TaskActions.test.tsx` | Upcoming shows Start disabled with its reason, and sends nothing |
| `LoginScreen.test.tsx` | The form is reachable by label and shows why a sign-in failed |
| `queries.test.tsx` | A cursor-paged list asks for the next page and keeps the first |
| `HomeScreen.test.tsx` | Every row is offered on a permission, and a provider never asks the portal |
| `approval-display.test.ts` | Edit and the client's own decision are never drawn on the provider's screen |
| `ApprovalsScreen.test.tsx` | Each audience reads its own endpoint, and an empty view names itself |
| `InternalApprovalDetailScreen.test.tsx` | A refused transition is greyed with its reason and sends nothing |
| `ClientApprovalDetailScreen.test.tsx` | No form without `canDecide`; a refusal needs its comment |
| `SignOffScreen.test.tsx` | Reading and answering are separate; only `uat:decide` sees the form |
| `work-log-display.test.ts` | The day totals and the seven-day range, including across a month |
| `MyTimeScreen.test.tsx` | Only the signed-in person's time, with no control that widens it |
| `UpdatesScreen.test.tsx` | Each list pages, and a release opens what changed rather than a version |

A test that renders anything with a mutation in it builds its `QueryClient` with `gcTime: 0`. That
is not tidiness: React Query holds a finished mutation for a five-minute garbage-collection window
and schedules a real timer to drop it, and a jest worker with one of those outstanding does not
exit — the run ends in "a worker process has failed to exit gracefully" rather than finishing.

## Versions

Pinned to what Expo SDK 57 bundles — React Native 0.86.3, React 19.2.3 — rather than to the
latest of each. `@expo/metro-config` expects the bundled React Native and fails to resolve its
polyfill entry against a newer one, which shows up as a bundling error rather than an install
warning.

`expo-image-picker` and `expo-document-picker` are pinned the same way, to what SDK 57 bundles.
Both are needed rather than one: see "Attachments". `expo-image-picker` is also a config plugin,
so its photo-library permission string lives in `app.json` rather than in a native project nobody
edits by hand.

`@react-native/assets-registry` and `@types/jest` are declared explicitly because `jest-expo`
reaches into them and pnpm's strict layout does not hoist a transitive into view. See the note in
`jest.config.js` for the related `transformIgnorePatterns` detail — pnpm's `.pnpm` directory has
to be in the allow-list or nothing is transformed.

## Not done here

App icons and a splash image, EAS build profiles, code signing, over-the-air updates, offline
write queueing, biometric unlock, and a Socket.IO connection for live updates — see "Chat, and why
it polls".

Also deliberately absent, each for its own reason:

- **Per-environment API URLs.** `app.json` is static, so one build points at one API. Pointing a
  staging build somewhere else means converting it to `app.config.ts`; nothing here needs that yet.
- **Replying to one message in particular.** Not a decision this app gets to take: a message has no
  parent. There is no `replyToId` column on `Message`, no field on `MessageSummary` and none on the
  send DTO, so a "reply to" control here would either invent a convention the web app does not
  share or quote the text into the body — where it would be an ordinary message that merely looks
  like a reply, and would not survive the original being edited or withdrawn. It needs a column, a
  contract field and both clients, and that is a piece of work rather than a phone screen.
- **Downloading a non-image attachment.** It would mean writing a client's file to the device and
  handing it to another app.
- **Revealing a test credential.** That is an audited endpoint with a short reveal window, and a
  password on screen in a public place is exactly what the window exists to limit. A tester's
  assignment shows the username; the reveal stays on the web.
- **Assigning testing, triaging tickets, editing a project.** Decisions about who does what next,
  taken with a queue or a team calendar in front of you.
- **Raising an approval request, and the client's own projects list.** Preparing a request means
  choosing a subject, writing five thousand characters of client-visible summary and attaching
  files, which is desk work; the phone answers requests rather than composing them. A client's
  project board is the one gap here that is a gap rather than a decision — it is a dense screen
  and it is on the list, not in this change.
- **Contracts, change requests, milestones, releases, problems and incidents.** Read-heavy screens
  whose actions are decisions taken with a contract, a burn-down or an incident timeline open.
- **The tester's other five queue views** — today, passed today, UAT, live, retest. They are ways
  of reviewing a day's work, which is a desk activity. The phone shows mine, ready, failed and
  overdue.
The approved clickable mobile prototype is at
`docs/design-reference/prototype/Ashniva Desk - Mobile Prototype.dc.html`.
