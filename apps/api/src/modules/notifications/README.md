# notifications

**Owns:** In-app notifications: dispatch, de-duplication, grouping, quiet hours, rate limiting,
read state, per-event and per-channel preferences, live delivery and the scheduled reminders.

**Phase:** 2 — implemented in-app. Email and WhatsApp exist as provider interfaces only.

**Entities:** notifications, notification_preferences, notification_settings, push_subscriptions,
device_push_tokens

**Endpoints:** `GET /notifications` · `GET /notifications/unread-count` ·
`POST /notifications/read-all` · `POST /notifications/:id/read` ·
`GET|PUT /notifications/preferences` · `POST /notifications/jobs/deliver|reminders` ·
`GET /notifications/push/vapid-public-key` · `POST /notifications/push/subscribe|unsubscribe` ·
`POST /notifications/push/devices` · `POST /notifications/push/devices/unregister`

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

**Native push (mobile):**
- The app registers its Expo push token with `POST /notifications/push/devices`
  (`{ token: 'ExponentPushToken[…]', platform: 'IOS' | 'ANDROID' }`, 204) and forgets it on
  sign-out with `POST /notifications/push/devices/unregister` (`{ token }`, 204). A token is unique:
  registering it again re-binds it to the caller, so a phone that signs in as someone else stops
  receiving the previous person's pushes. Unregistering only ever deletes the caller's own token.
- `ExpoPushNotificationChannel` and `WebPushNotificationChannel` share the `PUSH` key; the dispatcher
  sends to every configured adapter under an enabled key, so the one "Push notifications"
  preference, quiet hours and the rate limit cover browsers and phones alike.
- Sends go to `https://exp.host/--/api/v2/push/send` through `SafeHttpService`, in batches of 100,
  with `data: NativePushData` (`notificationId`, `groupedCount`, `type`, `link`, `entityType`,
  `entityId`) and the unread count as the badge. Tokens Expo answers `DeviceNotRegistered` for are
  deleted. Failures are logged without the token and never thrown.
- A grouped notification pushes for every event merged into it, not only the first: the second
  reply on a ticket buzzes the phone the way a second chat message does. The row keeps its id, so
  the app tells events apart by `groupedCount`. A row still waiting out quiet hours, or an event
  over the rate limit, stays silent.
- `EXPO_PUSH_ENABLED` (default `true`; forced `false` in tests) and optional `EXPO_ACCESS_TOKEN`,
  needed only when "enhanced push security" is on for the Expo project.
- `device_push_tokens` has row-level security scoped to the owner's organization or the owner;
  re-binding and delivery run as the system with explicit organization and user filters.

**Rules (shared):** controllers stay thin; business rules live in `*.service.ts`; data access in
`*.repository.ts` (tenant-scoped); DTOs in `dto/`; every state change that matters is audited.
