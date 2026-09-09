# call-logs

**Owns:** support calls attached to tickets — who a call should reach, what was tried, how it
ended, where the recording is, and who may listen to it. Also the inbound provider webhook, because
applying an IVR event means writing a call record.

**What it does not own:** telephony. Desk never dials. Ashniva IVR places and bridges the call, so
neither party learns the other's number and Desk transmits none. And routing: package 8b decides
who is eligible, and `CallRoutingService` calls *its* functions rather than repeating its rules.

**Entities:** `call_logs`, `call_attempts`. `call_logs` is a row-level-security child of `tickets`,
so a client reads their own ticket's calls through the portal; `call_attempts` is provider-only,
because which people were rung and why each was passed over is staff data.

## The ladder

One method — `CallPlacementService.advance` — does the first placement and every fallback, because
they are the same act. Destinations, in order:

1. **the person the ticket is already assigned to**, if package 8a's resolver says they are there.
   A manual assignment lands here too, which is how a person's decision keeps outranking the
   chain's for calls as well as tickets;
2. **package 8b's routing answer**, asked with the destinations already rung excluded — the same
   mechanism a re-routed ticket uses, so "next eligible" means what it means everywhere else;
3. **package 8b's escalation answer**: backup, senior, support executive;
4. **the configured fallback** — the product's IVR policy first, then the project's routing
   fallback;
5. **the support queue**: the call ends with a stated reason and whoever manages support routing
   is notified. A support call is never silently dropped.

Three things bound the loop: nobody is rung twice on one call, the policy's attempt ceiling stops
it even while eligible people remain, and the attempt counter is claimed conditionally so two
workers cannot both ring somebody. Every attempt is kept, including the failed ones — "we tried the
on-call developer, then the senior, and neither answered" is the fact somebody needs when a client
says nobody rang back.

`CallMonitorProcessor` sweeps calls the provider never reported on, so a dropped callback ends in
the same two outcomes a real `no_answer` does rather than in a call that rings forever.

## Recordings

`call:play-recording` is a separate permission from `call:read-internal` and from `ticket:read`. On
top of it the product's `recordingPlaybackScope` decides how far playback reaches — leads only by
default, optionally the developer who took the call, optionally any permitted project member. The
decision is `canPlayRecording` in `packages/types`, shared by the API and the web app so the button
and the endpoint cannot disagree; the endpoint runs it too, because hiding a control is decoration.
No audio is stored: Desk holds a reference and asks the adapter for a short-lived URL each time.
Every playback **and every refusal** is audited, including by the most privileged roles.

**Endpoints:** `GET|POST /tickets/:id/calls` · `GET /tickets/:id/calls/availability` ·
`POST /calls/:id/cancel` · `GET /calls/:id/recording` (`call:play-recording`) ·
`GET /portal/tickets/:id/calls` (allow-list: time, status, duration — nothing else) ·
`POST /webhooks/ivr/:provider` (public, signed).

**Rules:** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
