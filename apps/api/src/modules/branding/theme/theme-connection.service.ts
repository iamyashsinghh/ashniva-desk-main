import { Injectable } from '@nestjs/common';
import { INTEGRATION_PROVIDER } from '@ashniva/types';

import { SecretCipherService } from '../../../common/crypto/secret-cipher.service';
import { IntegrationsRepository } from '../../integrations/integrations.repository';

/**
 * One tenant's Theme Manager connection, and the credential that proves Desk may read from it.
 *
 * A `THEME_MANAGER` `IntegrationConnection` rather than a table of its own, for the same reasons
 * the IVR one is (`modules/ivr/README.md`): encrypted credentials, an enable switch, a status, a
 * non-secret settings blob for the base URL, and — for the day the direction turns out to be push
 * rather than pull — a webhook secret and an idempotency index that already exist. A parallel
 * `theme_providers` table would be a second copy of all of that to keep right.
 *
 * This is the only place a decrypted Theme Manager credential exists. It is handed to the source
 * that makes the request and to nobody else: never logged, never audited, never returned.
 */
export interface ThemeManagerAccount {
  /** The Theme Manager host for this tenant. Non-secret; checked by the SSRF guard before use. */
  baseUrl: string | null;
  /**
   * The path the published theme document is read from.
   *
   * **No default, deliberately.** Desk does not know the Theme Manager's API, and a plausible
   * guess (`/api/v1/theme`, say) would make this look like a working integration and fail against
   * the real product. Until the contract exists an operator may supply the path themselves, and
   * until they do the remote source refuses to make a request at all.
   */
  documentPath: string | null;
  /** Header the credential is sent in. Desk's own convention, not a documented vendor one. */
  authHeader: string;
  /** Prefix put before the credential in that header. */
  authPrefix: string;
  credential: string | null;
}

const DEFAULTS = { authHeader: 'Authorization', authPrefix: 'Bearer ' } as const;

@Injectable()
export class ThemeConnectionService {
  constructor(
    private readonly integrations: IntegrationsRepository,
    private readonly cipher: SecretCipherService,
  ) {}

  /** The account a theme is read from, or null when this tenant has no enabled connection. */
  async account(organizationId: string): Promise<ThemeManagerAccount | null> {
    const row = await this.integrations.findByProvider(
      organizationId,
      INTEGRATION_PROVIDER.THEME_MANAGER,
    );
    if (!row?.enabled) {
      return null;
    }
    const settings =
      typeof row.settings === 'object' && row.settings !== null
        ? (row.settings as Record<string, unknown>)
        : {};

    return {
      baseUrl: stringOf(settings.baseUrl),
      documentPath: stringOf(settings.documentPath),
      authHeader: stringOf(settings.authHeader) ?? DEFAULTS.authHeader,
      authPrefix: stringOf(settings.authPrefix) ?? DEFAULTS.authPrefix,
      credential: row.encryptedCredentials ? this.cipher.decrypt(row.encryptedCredentials) : null,
    };
  }
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
