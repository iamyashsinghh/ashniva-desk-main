/**
 * Reading a Meta WhatsApp Cloud API webhook.
 *
 * Everything here parses input from outside the system, from a request that has not been
 * authenticated at the point the tenant is worked out. Nothing is assumed about the shape: every
 * field is checked, an unrecognised payload yields an empty result rather than throwing, and no
 * value reaches a query until it has been proved to be a string.
 */

export interface InboundStatusEvent {
  kind: 'status';
  /** Meta's id for the message we sent, matching `provider_message_id`. */
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  /**
   * The number Meta says this receipt is about, when it says.
   *
   * Kept so a receipt whose `providerMessageId` matches no row can still be reconciled against
   * the message it belongs to — the case where a worker died between the provider accepting the
   * message and the id being written down.
   */
  recipientId: string | null;
  /** Present on a failure. Already just a code and title, never a credential. */
  error: string | null;
  occurredAt: Date;
}

export interface InboundMessageEvent {
  kind: 'message';
  /** Meta's id for the inbound message; the idempotency key for the delivery. */
  externalId: string;
  from: string;
  text: string | null;
  occurredAt: Date;
}

export type WhatsAppEvent = InboundStatusEvent | InboundMessageEvent;

export interface ParsedWebhook {
  /**
   * The WhatsApp Business Account the delivery claims to be for.
   *
   * A *claim*, not a fact. It is used to look up a stored connection, and the signature is then
   * verified against that connection's own secret. An unknown id is turned away before anything
   * is written, so an anonymous caller cannot create rows by inventing one.
   */
  businessAccountId: string | null;
  phoneNumberId: string | null;
  events: WhatsAppEvent[];
}

const STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

export function parseWhatsAppWebhook(body: unknown): ParsedWebhook {
  const empty: ParsedWebhook = { businessAccountId: null, phoneNumberId: null, events: [] };
  const root = asObject(body);
  if (!root || asString(root.object) !== 'whatsapp_business_account') {
    return empty;
  }

  const entries = asArray(root.entry);
  if (entries.length === 0) {
    return empty;
  }

  const events: WhatsAppEvent[] = [];
  let businessAccountId: string | null = null;
  let phoneNumberId: string | null = null;

  for (const rawEntry of entries) {
    const entry = asObject(rawEntry);
    if (!entry) {
      continue;
    }
    businessAccountId ??= asString(entry.id);

    for (const rawChange of asArray(entry.changes)) {
      const change = asObject(rawChange);
      const value = asObject(change?.value);
      if (!value) {
        continue;
      }
      phoneNumberId ??= asString(asObject(value.metadata)?.phone_number_id);
      events.push(...statusEvents(value), ...messageEvents(value));
    }
  }

  return { businessAccountId, phoneNumberId, events };
}

function statusEvents(value: Record<string, unknown>): InboundStatusEvent[] {
  const events: InboundStatusEvent[] = [];
  for (const raw of asArray(value.statuses)) {
    const status = asObject(raw);
    const id = asString(status?.id);
    const state = asString(status?.status);
    if (!id || !state || !STATUSES.has(state)) {
      continue;
    }
    events.push({
      kind: 'status',
      recipientId: asString(status?.recipient_id) ?? null,
      providerMessageId: id,
      status: state as InboundStatusEvent['status'],
      error: firstErrorOf(status?.errors),
      occurredAt: timestampOf(status?.timestamp),
    });
  }
  return events;
}

function messageEvents(value: Record<string, unknown>): InboundMessageEvent[] {
  const events: InboundMessageEvent[] = [];
  for (const raw of asArray(value.messages)) {
    const message = asObject(raw);
    const id = asString(message?.id);
    const from = asString(message?.from);
    if (!id || !from) {
      continue;
    }
    events.push({
      kind: 'message',
      externalId: id,
      from,
      // Only the text body is read. Media, location and contact payloads are ignored rather
      // than stored: nothing downstream handles them, and they would be personal data kept for
      // no reason.
      text: asString(asObject(message?.text)?.body),
      occurredAt: timestampOf(message?.timestamp),
    });
  }
  return events;
}

/**
 * The first error on a status, as `code: title`.
 *
 * Deliberately not the whole error object: Meta includes an `error_data.details` string that
 * echoes parts of the request back, and this is written to a column an administrator reads.
 */
function firstErrorOf(value: unknown): string | null {
  const first = asObject(asArray(value)[0]);
  if (!first) {
    return null;
  }
  const code = asString(first.code) ?? String(first.code ?? '').trim();
  const title = asString(first.title) ?? asString(first.message);
  if (!code && !title) {
    return null;
  }
  return [code, title].filter(Boolean).join(': ');
}

/** Meta sends a Unix timestamp in seconds, as a string. */
function timestampOf(value: unknown): Date {
  const seconds = Number(asString(value) ?? value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
