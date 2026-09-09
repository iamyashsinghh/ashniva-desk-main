import type {
  ProductCallbackEndpointSummary,
  SupportCallbackDeliverySummary,
  SupportCallbackEvent,
  SupportCallbackStatus,
} from '@ashniva/types';

import type { CallbackEndpointRow } from './callback-endpoints.repository';
import type { CallbackDeliveryRow } from './support-callbacks.repository';

/**
 * Rows into API shapes.
 *
 * `signingSecretEncrypted` is not mapped anywhere in this file, and there is no shape it could be
 * mapped into: `ProductCallbackEndpointSummary` has no field for it. That is the point — the
 * secret cannot leak through a DTO because there is nowhere for it to go.
 */
export function toEndpointSummary(row: CallbackEndpointRow): ProductCallbackEndpointSummary {
  return {
    productId: row.productId,
    url: row.url,
    enabled: row.enabled,
    events: row.events as SupportCallbackEvent[],
    rotatedAt: row.rotatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDeliverySummary(row: CallbackDeliveryRow): SupportCallbackDeliverySummary {
  return {
    id: row.id,
    event: row.event as SupportCallbackEvent,
    status: row.status as SupportCallbackStatus,
    ticketId: row.ticketId,
    url: row.url,
    attempts: row.attempts,
    responseStatus: row.responseStatus,
    lastError: row.lastError,
    queuedAt: row.queuedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
  };
}
