import type {
  IntegrationConnectionDetail,
  IntegrationConnectionSummary,
  IntegrationEventSummary,
  IntegrationProvider,
  IntegrationStatus,
  SyncStatus,
} from '@ashniva/types';

import type { IntegrationConnectionRow, IntegrationEventRow } from './integrations.repository';

/**
 * Allow-list mappers. Written as explicit field lists rather than a spread precisely because the
 * rows carry `encryptedCredentials` and `webhookSecretEncrypted`: a spread here would put
 * ciphertext into an API response the first time someone adds a field to the model.
 *
 * `hasCredentials` and `webhookConfigured` are the only things a caller learns about them.
 */
export function toIntegrationConnectionSummary(
  row: IntegrationConnectionRow,
): IntegrationConnectionSummary {
  return {
    id: row.id,
    provider: row.provider as IntegrationProvider,
    status: row.status as IntegrationStatus,
    enabled: row.enabled,
    displayName: row.displayName,
    hasCredentials: row.encryptedCredentials !== null,
    credentialsExpireAt: row.credentialsExpireAt?.toISOString() ?? null,
    scopes: row.scopes,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus as SyncStatus,
    lastErrorMessage: row.lastErrorMessage,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    webhookConfigured: row.webhookSecretEncrypted !== null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toIntegrationConnectionDetail(
  row: IntegrationConnectionRow,
): IntegrationConnectionDetail {
  return {
    ...toIntegrationConnectionSummary(row),
    settings: readSettings(row.settings),
    externalAccountId: row.externalAccountId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toIntegrationEventSummary(row: IntegrationEventRow): IntegrationEventSummary {
  return {
    id: row.id,
    provider: row.provider as IntegrationProvider,
    eventType: row.eventType,
    status: row.status,
    signatureVerified: row.signatureVerified,
    attempts: row.attempts,
    lastError: row.lastError,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

/**
 * Names that mean the value is a secret, whatever column it ended up in.
 *
 * Credentials belong in the encrypted columns, and every provider today puts them there — bar
 * WhatsApp's webhook verify token, which Meta echoes back during the handshake and which sat in
 * the plain `settings` blob. Rather than trusting each provider to keep making the right choice,
 * anything whose name reads like a secret is reduced to a boolean here: whoever adds the next
 * provider gets the safe outcome by default, and a settings screen can still say "configured".
 */
const SECRET_LOOKING = /token|secret|password|passphrase|credential|private[-_]?key|api[-_]?key/i;

/**
 * `settings` is a Json column, so its runtime shape is not guaranteed by the type system.
 * Only scalars are let through; anything nested is dropped rather than trusted, which also stops
 * a nested object smuggling a secret into a response.
 */
function readSettings(value: unknown): Record<string, string | number | boolean | null> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_LOOKING.test(key)) {
      out[key] = entry !== null && entry !== '';
      continue;
    }
    if (
      entry === null ||
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
    ) {
      out[key] = entry;
    }
  }
  return out;
}
