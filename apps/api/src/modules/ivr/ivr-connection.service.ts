import { Injectable } from '@nestjs/common';

import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import {
  IntegrationsRepository,
  type IntegrationConnectionRow,
} from '../integrations/integrations.repository';
import type { IvrProviderAccount } from './ivr-provider.interface';

/**
 * One tenant's IVR account, and the secret that proves an inbound delivery came from it.
 *
 * The IVR connection is an ordinary `IntegrationConnection` with `provider = IVR`, which is what
 * gives it encrypted credentials, an enable switch, a status and an external account id for free.
 * This service is the thin layer that turns such a row into the shape an adapter wants, and it is
 * the only place a decrypted IVR secret exists.
 *
 * Nothing here logs, audits or returns a secret. `account()` hands the credential to an adapter
 * and to nobody else.
 */
@Injectable()
export class IvrConnectionService {
  constructor(
    private readonly integrations: IntegrationsRepository,
    private readonly cipher: SecretCipherService,
  ) {}

  /** The account a call is placed on, or null when this tenant has no working IVR connection. */
  async account(organizationId: string): Promise<IvrProviderAccount | null> {
    const row = await this.integrations.findByProvider(organizationId, 'IVR');
    if (!row?.enabled) {
      return null;
    }
    return {
      externalAccountId: row.externalAccountId ?? '',
      credential: row.encryptedCredentials ? this.cipher.decrypt(row.encryptedCredentials) : null,
      baseUrl: baseUrlOf(row.settings),
    };
  }

  /**
   * Every connection claiming an account id, for the webhook path.
   *
   * All of them, not the first: `external_account_id` carries no unique constraint, so nothing
   * stops two tenants entering the same value, and `findFirst` would hand one tenant's deliveries
   * to whichever row the planner happened to pick. Which candidate is real is decided by whose
   * secret verifies the signature — the same shape the WhatsApp intake uses, for the same reason.
   */
  candidatesFor(externalAccountId: string): Promise<IntegrationConnectionRow[]> {
    return this.integrations.findAllByExternalAccount('IVR', externalAccountId);
  }

  /** The webhook secret for one candidate connection, or null when it has none. */
  secretOf(connection: IntegrationConnectionRow): string | null {
    if (!connection.enabled || !connection.webhookSecretEncrypted) {
      return null;
    }
    return this.cipher.decrypt(connection.webhookSecretEncrypted);
  }
}

/**
 * The API host from a connection's non-secret settings.
 *
 * Read defensively: `settings` is a JSON column an administrator edits, so it can hold anything.
 * Anything that is not a plain non-empty string is treated as absent rather than passed further
 * down to a URL constructor, where it would fail somewhere much less explicable.
 */
function baseUrlOf(settings: unknown): string | null {
  if (typeof settings !== 'object' || settings === null) {
    return null;
  }
  const value = (settings as { baseUrl?: unknown }).baseUrl;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
