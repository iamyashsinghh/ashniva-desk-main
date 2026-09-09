import type {
  EmailSettings,
  MessageTemplate,
  OutboundMessageStatus,
  OutboundMessageSummary,
  WhatsAppSettings,
} from '@ashniva/types';

import { maskDestination } from './destination-mask';
import type { OutboundMessageRow } from './messaging.repository';
import { readEmailConfig } from './providers/email-settings';
import { readWhatsAppConfig } from './providers/whatsapp-settings';
import type { IntegrationConnectionRow } from '../integrations/integrations.repository';

/**
 * Allow-list mappers for the messaging screens.
 *
 * Two things must never appear in a response, and neither has a field to appear in: the stored
 * password or access token, and an unmasked recipient address.
 */

export function toOutboundMessageSummary(row: OutboundMessageRow): OutboundMessageSummary {
  const channel = row.channel as 'EMAIL' | 'WHATSAPP';
  return {
    id: row.id,
    channel,
    template: row.template as MessageTemplate,
    destination: maskDestination(channel, row.destination),
    subject: row.subject,
    status: row.status as OutboundMessageStatus,
    attempts: row.attempts,
    lastError: row.lastError,
    queuedAt: row.queuedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

/** The email settings screen. `hasPassword` is a boolean, never the password. */
export function toEmailSettings(row: IntegrationConnectionRow | null): EmailSettings | null {
  if (!row) {
    return null;
  }
  const config = readEmailConfig((row.settings ?? {}) as Record<string, unknown>);
  return {
    enabled: row.enabled,
    senderName: config?.senderName ?? '',
    senderEmail: config?.senderEmail ?? '',
    replyTo: config?.replyTo ?? null,
    host: config?.host ?? '',
    port: config?.port ?? 587,
    encryption: config?.encryption ?? 'STARTTLS',
    username: config?.username ?? null,
    hasPassword: Boolean(row.encryptedCredentials),
    lastSuccessAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastErrorMessage,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
  };
}

/**
 * The WhatsApp settings screen.
 *
 * Three booleans stand in for three secrets — the access token, the app secret and the verify
 * token — and there is no field any of them could be written into.
 */
export function toWhatsAppSettings(
  row: IntegrationConnectionRow | null,
  webhookBaseUrl?: string,
): WhatsAppSettings | null {
  if (!row) {
    return null;
  }
  const config = readWhatsAppConfig((row.settings ?? {}) as Record<string, unknown>);
  return {
    enabled: row.enabled,
    businessAccountId: config?.businessAccountId ?? '',
    phoneNumberId: config?.phoneNumberId ?? '',
    displayPhoneNumber: config?.displayPhoneNumber ?? null,
    apiVersion: config?.apiVersion ?? 'v21.0',
    templateLanguage: config?.templateLanguage ?? 'en',
    templateNames: config?.templateNames ?? {},
    hasAccessToken: Boolean(row.encryptedCredentials),
    hasAppSecret: Boolean(row.webhookSecretEncrypted),
    hasVerifyToken: Boolean(config?.verifyToken),
    webhookUrl:
      webhookBaseUrl && config?.businessAccountId
        ? `${webhookBaseUrl}/webhooks/whatsapp?waba=${config.businessAccountId}`
        : null,
    lastSuccessAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastErrorMessage,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
  };
}
