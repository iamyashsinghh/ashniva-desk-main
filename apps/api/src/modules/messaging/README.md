# Messaging

Outbound email and WhatsApp. Transactional only — there is no campaign, list or broadcast here,
and adding one would need a different mechanism with consent tracking and an unsubscribe path.

## Files

| File | Responsibility |
| --- | --- |
| `delivery-failure.ts` | Pure: is this failure worth retrying? |
| `destination-mask.ts` | Pure: masking a recipient for the history |
| `idempotency.ts` | Pure: the key that stops one event sending twice |
| `message-templates.ts` | Pure: rendering subject, text and HTML |
| `messaging.repository.ts` | The `outbound_messages` table |
| `message-sender.service.ts` | Queue, render, send, classify, decide on a retry — shared by both channels |
| `messaging-notification.channel.ts` | Bridges the notification dispatcher to the sender |
| `email.service.ts` | Email's own settings shape and test message |
| `whatsapp.service.ts` | WhatsApp settings, the webhook, delivery receipts |
| `whatsapp-webhook.ts` | Pure: parsing an untrusted Meta payload |
| `providers/` | `MessageProvider` interface, SMTP, Meta Cloud API, and a mock of each |

## Where each concern lives

The notification dispatcher already applies preferences, de-duplication, grouping, quiet hours
and the rate limit. This module does not repeat any of that. It receives a notification the
dispatcher has already decided to send and is responsible only for getting it out.

Quiet hours are worth spelling out. A deferred notification's email is sent when the
notification is finally delivered, not when it was created — otherwise the phone lights up at
3am and the deferral achieved nothing. `NotificationDispatcher.dispatchOne` sends immediately
only when the notification is not deferred; `deliverDeferred` sends when it is released.

## Idempotency

`outbound_messages` has a unique index on `(organization_id, channel, idempotency_key)`, and
`claim()` inserts rather than checking first. Two workers racing both call insert, one wins on
the constraint and the other gets `P2002` — a check-then-insert would leave a window where both
see nothing.

The key is derived from template, recipient, entity and an optional `occurrence`, and never from
a timestamp, so a job retried a minute later produces the same key. `occurrence` is what lets a
genuine repeat through: a second reply on the same ticket is a second message, not a duplicate.
The key is hashed because its parts include an address, and it is stored, indexed and logged.

## Retry classification

`classifyError` reads `responseCode` (nodemailer), then `status`/`statusCode` (HTTP), then `code`
(Node sockets). **SMTP and HTTP mean opposite things by the same number**: SMTP `5xx` is a
permanent rejection, HTTP `5xx` is the server's problem and worth retrying. Getting this
backwards retries "no such mailbox" forever, which on many providers damages the sending
domain's reputation, so they are separate functions rather than one with a flag.

An unrecognised failure is treated as transient: a message arriving late beats one dropped
because the error was unfamiliar.

## Secrets

The SMTP password and the WhatsApp access token live in `integration_connections`
`encryptedCredentials`, encrypted with `SecretCipherService`. No endpoint returns them — the
settings response carries `hasPassword: boolean` and has no field the value could occupy.
Saving the settings without a password keeps the stored one, so changing a port does not silently
wipe a credential nobody can read back.

Provider errors go through `redactMessage` before being stored or shown: a nodemailer failure can
quote the AUTH line back at you.

## Recipient addresses

The delivery history masks them (`p•••a@example.com`). It is an operational record — did it go
out, did it bounce — not a directory. The mask does not grow with the address, so it does not
leak length either.

## Test send

`POST /settings/email/test-message` always sends to the signed-in user. A settings screen that
emails an arbitrary address on request is an open relay for anyone who can reach it.

## Providers

`MESSAGING_PROVIDER=mock` registers in-memory providers that reach nothing, used by the local
preview. The e2e suite forces it in `test/load-env.ts` rather than defaulting to it, so a test run
can never contact a real mail server whatever a developer has in their `.env`. Any other value
uses the real providers, so a deployment cannot land on the mock by forgetting the variable.

A transporter is built per send rather than pooled: settings are per tenant and can change at any
moment, and a cached transport would keep using the old host until the process restarted.

## The WhatsApp webhook

The only unauthenticated write surface this module adds. The order is what the security rests on:

1. parse the payload defensively and read the business account id it *claims*;
2. look that id up among stored connections — **this, and only this, decides the tenant**,
   because a webhook carries no session;
3. verify the HMAC over the raw bytes against that tenant's own app secret;
4. record the event, whose unique index rejects a redelivery;
5. only then act on it.

Nothing before step 3 writes a row. A caller who invents a business account id is turned away at
step 2 with nothing recorded; one who names a real id but cannot sign is turned away at step 3.
Neither can create tenant records. A rejection says only "rejected" — naming which check failed
would tell an attacker which half to work on.

Delivery receipts are applied with `updateMany` scoped by organization *and* provider message id.
A verified webhook is authenticated for one tenant, and must not be able to reach another
tenant's rows by naming their message id.

`rawBody` is required on the app (`NestFactory.create({ rawBody: true })`): the HMAC covers the
exact bytes Meta sent, and `JSON.parse` then `JSON.stringify` reorders keys and changes
whitespace, which would fail every genuine delivery.

## WhatsApp templates

WhatsApp will not deliver free-form text to someone who has not messaged the business recently,
so everything sent is a template approved in advance. The mapping from our message types to
approved names is per tenant and editable, because only the account holder knows what they had
approved. A type with no name mapped cannot be sent — the provider raises a *permanent* failure
rather than retrying, since no number of attempts will conjure an approved template.

The app secret and the access token are separate secrets and are stored separately: the token in
`encryptedCredentials`, the app secret in `webhookSecretEncrypted`. Meta issues them
independently and rotating one should not disturb the other.
