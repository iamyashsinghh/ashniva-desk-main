import type { ExternalTicketStatus } from './products';

/**
 * What Desk tells a product about its own tickets, without being asked.
 *
 * The ingress is one-way: a product raises a ticket and then has to poll to learn anything. A
 * callback is the other direction, and it is deliberately thin. It says what happened and gives
 * the caller the same client-safe view `GET /support/tickets/:id` returns — nothing about who is
 * working on it, what was said internally, or how the routing went. Those are Ashniva's business.
 */

/** Every event a product may subscribe to. */
export const SUPPORT_CALLBACK_EVENT = {
  TICKET_CREATED: 'ticket.created',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_WAITING_CLIENT: 'ticket.waiting_client',
  TICKET_IN_PROGRESS: 'ticket.in_progress',
  TICKET_RESOLVED: 'ticket.resolved',
  TICKET_CLOSED: 'ticket.closed',
  /** A public reply. Never an internal note — those have no event and no shape here. */
  SUPPORT_UPDATE: 'support.update',
} as const;

export type SupportCallbackEvent =
  (typeof SUPPORT_CALLBACK_EVENT)[keyof typeof SUPPORT_CALLBACK_EVENT];

export const SUPPORT_CALLBACK_EVENTS: readonly SupportCallbackEvent[] =
  Object.values(SUPPORT_CALLBACK_EVENT);

export const SUPPORT_CALLBACK_EVENT_LABELS: Record<SupportCallbackEvent, string> = {
  'ticket.created': 'Ticket accepted',
  'ticket.assigned': 'Someone picked it up',
  'ticket.waiting_client': 'Waiting for the client',
  'ticket.in_progress': 'Work started or resumed',
  'ticket.resolved': 'Resolved',
  'ticket.closed': 'Closed',
  'support.update': 'Public reply added',
};

/** Header names a receiver reads. Written down once so the docs and the sender agree. */
export const SUPPORT_CALLBACK_HEADERS = {
  SIGNATURE: 'X-Ashniva-Signature',
  DELIVERY: 'X-Ashniva-Delivery',
  EVENT: 'X-Ashniva-Event',
  TIMESTAMP: 'X-Ashniva-Timestamp',
} as const;

/**
 * How long a receiver should accept a signed timestamp for.
 *
 * The signature covers the timestamp, so an attacker cannot move it; what it bounds is *replay*
 * of a genuine delivery captured off the wire. Five minutes is long enough for a slow queue and a
 * clock a little out of step, and short enough that a captured body stops being useful quickly.
 */
export const SUPPORT_CALLBACK_REPLAY_WINDOW_SECONDS = 300;

/**
 * The body of one callback.
 *
 * `ticket` is the very same `ExternalTicketStatus` the ingress returns, built by the same reader.
 * That is the protection and it is structural: there is no field on this shape for an assignee,
 * an internal note, a routing trail, a recording or an RCA, so no future change to a query can
 * start including one.
 */
export interface SupportCallbackPayload {
  /** Unique per delivery. Receivers deduplicate on this — see the redelivery note in the docs. */
  deliveryId: string;
  event: SupportCallbackEvent;
  occurredAt: string;
  product: { id: string; code: string };
  ticket: ExternalTicketStatus;
  /** Present only on `support.update`: the public reply that caused it. */
  update?: { at: string; body: string };
}

/** The endpoint as an administrator reads it. The signing secret is not here, and never will be. */
export interface ProductCallbackEndpointSummary {
  productId: string;
  url: string;
  enabled: boolean;
  /** Empty means every event, following `ProductIvrPolicy.allowedTiers`. */
  events: SupportCallbackEvent[];
  rotatedAt: string | null;
  updatedAt: string;
}

/**
 * The one and only response that carries a signing secret.
 *
 * Returned when the endpoint is first configured and when the secret is rotated, and never again:
 * the stored form is ciphertext that only the sender decrypts, and no endpoint reads it back.
 */
export interface ProductCallbackEndpointWithSecret {
  endpoint: ProductCallbackEndpointSummary;
  /** Give this to the receiving system; it is what verifies `X-Ashniva-Signature`. */
  signingSecret: string;
}

export type SupportCallbackStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

/** One delivery, for the log an administrator reads. */
export interface SupportCallbackDeliverySummary {
  id: string;
  event: SupportCallbackEvent;
  status: SupportCallbackStatus;
  ticketId: string | null;
  url: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
  failedAt: string | null;
}
