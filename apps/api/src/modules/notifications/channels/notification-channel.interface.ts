import type { NotificationType } from '@ashniva/types';

/**
 * A delivery channel for notifications. In-app (table + Socket.IO) is built into the
 * dispatcher; email and WhatsApp are adapters behind this interface. Phase 2 ships the
 * interface and no-op adapters; real providers arrive in Phase 3 without touching callers.
 * Messages carry deep links only — never passwords or credentials (Architecture Plan §13).
 */
export interface NotificationMessage {
  recipientUserId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Deep link into the web or mobile app, e.g. /tasks/<id> */
  link: string | null;
}

export interface NotificationChannel {
  readonly key: 'EMAIL' | 'WHATSAPP';
  /** False until a provider is configured; the dispatcher then skips the channel silently. */
  isConfigured(): boolean;
  send(message: NotificationMessage): Promise<void>;
}

/** Injection token for the array of channel adapters. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
