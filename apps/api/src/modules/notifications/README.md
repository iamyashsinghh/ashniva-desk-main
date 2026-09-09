# notifications

**Owns:** In-app notifications: dispatch, de-duplication, grouping, quiet hours, rate limiting,
read state, per-event and per-channel preferences, live delivery and the scheduled reminders.

**Phase:** 2 — implemented in-app. Email and WhatsApp exist as provider interfaces only.

**Entities:** notifications, notification_preferences, notification_settings

**Endpoints:** `GET /notifications` · `GET /notifications/unread-count` ·
`POST /notifications/read-all` · `POST /notifications/:id/read` ·
`GET|PUT /notifications/preferences` · `POST /notifications/jobs/deliver|reminders`

**Rules:**
- Other modules call `NotificationDispatcher.notify()`; they never write rows themselves.
- `notification-rules.ts` owns the decisions: a repeat inside 24 hours with the same dedupe key is
  dropped, events with the same group key inside 30 minutes are merged with a count, quiet hours
  and the per-minute rate limit defer delivery instead of losing it.
- Recipients are resolved under `runAsSystem()`, so a client's action can still notify the provider
  staff who hold the right permission.
- In-app is on by default; the other channels are off by default (`defaultChannelEnabled`) and the
  preferences screens do not offer them (`ACTIVE_NOTIFICATION_CHANNELS`). Channels implement
  `NotificationChannel` and report `isConfigured()`.
- Channels are decided one at a time: the in-app row, the email and the WhatsApp message are each
  gated on their own preference, so "email but not in the app" is a setting that works. The
  pipeline above it — de-duplication, grouping, quiet hours, the rate limit — is per notification,
  not per channel, and the row is written even when in-app is off, undelivered, because it is what
  that pipeline counts.
- The urgent types (`URGENT_NOTIFICATION_TYPES`) reach the inbox whatever the in-app preference
  says, and ignore quiet hours and the rate limit.
- Jobs: `deliver-deferred` every minute and `daily-reminders` at 03:00 UTC (tasks due or overdue,
  contract expiry and renewal, low support hours).

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
