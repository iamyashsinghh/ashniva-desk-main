import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type IntegrationConnectionDetail,
  type IntegrationConnectionSummary,
  type IntegrationEventSummary,
  type IntegrationProvider,
  type SyncStatus,
  type ValidationResult,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { ConnectIntegrationDto, UpdateIntegrationDto } from './dto/integration.dto';
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProviderAdapter,
  type ProviderSettings,
} from './integration-provider.interface';
import {
  toIntegrationConnectionDetail,
  toIntegrationConnectionSummary,
  toIntegrationEventSummary,
} from './integrations.mapper';
import {
  IntegrationsRepository,
  type IntegrationConnectionRow,
  type IntegrationEventRow,
} from './integrations.repository';
import { redactMessage } from './redact';

const MAX_EVENTS = 50;

/** A sync that finished but skipped something is PARTIAL, not a clean SUCCESS. */
function syncStatusFor(outcome: { ok: boolean; partial?: boolean }): SyncStatus {
  if (!outcome.ok) {
    return 'FAILED';
  }
  return outcome.partial ? 'PARTIAL' : 'SUCCESS';
}

/**
 * Connections, credentials and status for every provider.
 *
 * Credentials only ever exist in three places: the request DTO, the encrypt call below, and the
 * ciphertext column. `credentialFor()` is the single door back out, and it is used by provider
 * code inside this API — never by a controller and never by a mapper.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly cipher: SecretCipherService,
    private readonly auditLog: AuditLogService,
    private readonly logger: PinoLogger,
    @Inject(INTEGRATION_PROVIDERS)
    private readonly adapters: IntegrationProviderAdapter[],
  ) {
    this.logger.setContext(IntegrationsService.name);
  }

  async list(actor: AuthenticatedUser): Promise<IntegrationConnectionSummary[]> {
    const rows = await this.repository.findAll(actor.organizationId);
    return rows.map(toIntegrationConnectionSummary);
  }

  async get(
    actor: AuthenticatedUser,
    provider: IntegrationProvider,
  ): Promise<IntegrationConnectionDetail> {
    return toIntegrationConnectionDetail(await this.require(actor, provider));
  }

  /**
   * Stores a credential and immediately checks it against the provider. A credential that does
   * not work is still stored (so the administrator can see and correct it) but the connection is
   * left in ERROR rather than being reported as connected.
   */
  async connect(
    actor: AuthenticatedUser,
    provider: IntegrationProvider,
    dto: ConnectIntegrationDto,
  ): Promise<IntegrationConnectionDetail> {
    const adapter = this.adapterFor(provider);
    const settings = (dto.settings ?? {}) as ProviderSettings;
    const result = await this.runValidation(adapter, dto.credential, settings);

    const row = await this.repository.upsert(actor.organizationId, provider, actor.userId, {
      encryptedCredentials: this.cipher.encrypt(dto.credential),
      webhookSecretEncrypted: dto.webhookSecret ? this.cipher.encrypt(dto.webhookSecret) : null,
      displayName: dto.displayName ?? result.accountLabel ?? null,
      externalAccountId: result.accountLabel ?? null,
      scopes: result.scopes ?? [],
      settings,
      status: result.ok ? 'CONNECTED' : 'ERROR',
      enabled: true,
      lastErrorAt: result.ok ? null : new Date(),
      lastErrorMessage: result.ok ? null : redactMessage(result.message),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.INTEGRATION_CONNECTED,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      // The credential is deliberately absent: an audit entry is not a place to keep a token.
      after: { provider, status: row.status, displayName: row.displayName },
    });

    return toIntegrationConnectionDetail(row);
  }

  async update(
    actor: AuthenticatedUser,
    provider: IntegrationProvider,
    dto: UpdateIntegrationDto,
  ): Promise<IntegrationConnectionDetail> {
    const existing = await this.require(actor, provider);
    const row = await this.repository.update(existing.id, {
      ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }),
      ...(dto.displayName === undefined ? {} : { displayName: dto.displayName }),
      ...(dto.settings === undefined ? {} : { settings: dto.settings }),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.INTEGRATION_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      before: { enabled: existing.enabled, displayName: existing.displayName },
      after: { enabled: row.enabled, displayName: row.displayName },
    });

    return toIntegrationConnectionDetail(row);
  }

  /** Re-checks the stored credential and records the outcome on the connection. */
  async validate(
    actor: AuthenticatedUser,
    provider: IntegrationProvider,
  ): Promise<ValidationResult> {
    const existing = await this.require(actor, provider);
    if (!existing.encryptedCredentials) {
      throw new BadRequestException('This integration has no stored credentials yet');
    }
    const adapter = this.adapterFor(provider);
    const result = await this.runValidation(
      adapter,
      this.cipher.decrypt(existing.encryptedCredentials),
      (existing.settings ?? {}) as ProviderSettings,
    );

    await this.repository.update(existing.id, {
      status: result.ok ? 'CONNECTED' : 'ERROR',
      lastErrorAt: result.ok ? null : new Date(),
      lastErrorMessage: result.ok ? null : redactMessage(result.message),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.INTEGRATION_VALIDATED,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: existing.id,
      organizationId: actor.organizationId,
      after: { provider, ok: result.ok },
    });

    return result;
  }

  /**
   * Removes the credentials but keeps the row, so the audit trail and anything linked to this
   * connection survive and a later reconnect does not lose their history.
   */
  async disconnect(actor: AuthenticatedUser, provider: IntegrationProvider): Promise<void> {
    const existing = await this.require(actor, provider);
    await this.repository.clearCredentials(existing.id);
    await this.auditLog.record({
      action: AUDIT_ACTION.INTEGRATION_DISCONNECTED,
      entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
      entityId: existing.id,
      organizationId: actor.organizationId,
      before: { provider, status: existing.status },
    });
  }

  async listEvents(
    actor: AuthenticatedUser,
    provider?: IntegrationProvider,
  ): Promise<IntegrationEventSummary[]> {
    const rows = await this.repository.listEvents(actor.organizationId, MAX_EVENTS, provider);
    return rows.map(toIntegrationEventSummary);
  }

  // -------------------------------------------------------------------------------------------
  // For provider code inside the API. Not reachable from a controller.
  // -------------------------------------------------------------------------------------------

  /**
   * The stored credential in the clear, for a provider adapter about to call out.
   * Returns null when the connection is missing, disabled or has no credential — callers treat
   * that as "this integration is not available" rather than as an error.
   */
  async credentialFor(
    organizationId: string,
    provider: IntegrationProvider,
  ): Promise<{ credential: string; settings: ProviderSettings; connectionId: string } | null> {
    const row = await this.repository.findByProvider(organizationId, provider);
    if (!row || !row.enabled || !row.encryptedCredentials) {
      return null;
    }
    return {
      credential: this.cipher.decrypt(row.encryptedCredentials),
      settings: (row.settings ?? {}) as ProviderSettings,
      connectionId: row.id,
    };
  }

  /**
   * Like `credentialFor`, but for a provider whose credential is genuinely optional.
   *
   * An SMTP relay on a private network may accept mail with no authentication at all, and
   * `credentialFor` would report such a connection as unavailable because it has no stored
   * secret. Callers of this method must cope with `secret` being null.
   */
  async channelConfigFor(
    organizationId: string,
    provider: IntegrationProvider,
  ): Promise<{ secret: string | null; settings: ProviderSettings; connectionId: string } | null> {
    const row = await this.repository.findByProvider(organizationId, provider);
    if (!row || !row.enabled) {
      return null;
    }
    return {
      secret: row.encryptedCredentials ? this.cipher.decrypt(row.encryptedCredentials) : null,
      settings: (row.settings ?? {}) as ProviderSettings,
      connectionId: row.id,
    };
  }

  /** The webhook signing secret for a connection, or null when none is configured. */
  async webhookSecretFor(
    organizationId: string,
    provider: IntegrationProvider,
  ): Promise<string | null> {
    const row = await this.repository.findByProvider(organizationId, provider);
    // `enabled` is checked here as it is in `credentialFor` and `channelConfigFor`. Pausing an
    // integration has to stop inbound traffic too; without this, a paused Git connection kept
    // verifying webhooks and writing code activity.
    if (!row?.enabled || !row.webhookSecretEncrypted) {
      return null;
    }
    return this.cipher.decrypt(row.webhookSecretEncrypted);
  }

  /**
   * Records a verified inbound event against a connection.
   *
   * Returns null when the unique index rejects it, which is how a provider redelivery is
   * recognised. Callers should treat null as "already handled" and answer the provider
   * successfully, so it stops retrying.
   */
  recordEventFor(
    connection: IntegrationConnectionRow,
    event: {
      externalEventId: string;
      eventType: string;
      signatureVerified: boolean;
      payloadDigest: string;
    },
  ): Promise<IntegrationEventRow | null> {
    return this.repository.recordEvent({
      organizationId: connection.organizationId,
      connectionId: connection.id,
      provider: connection.provider,
      status: event.signatureVerified ? 'RECEIVED' : 'REJECTED',
      ...event,
    });
  }

  /** Records the outcome of a background sync against the connection. */
  async recordSync(
    connectionId: string,
    outcome: { ok: boolean; partial?: boolean; error?: unknown },
  ): Promise<void> {
    const message = outcome.ok ? null : redactMessage(outcome.error);
    const syncStatus = syncStatusFor(outcome);
    await this.repository.update(connectionId, {
      lastSyncAt: new Date(),
      lastSyncStatus: syncStatus,
      ...(outcome.ok
        ? {}
        : { status: 'ERROR', lastErrorAt: new Date(), lastErrorMessage: message }),
    });
    if (!outcome.ok) {
      await this.auditLog.record({
        action: AUDIT_ACTION.INTEGRATION_SYNC_FAILED,
        entityType: AUDIT_ENTITY_TYPE.INTEGRATION,
        entityId: connectionId,
        after: { error: message },
      });
    }
  }

  // -------------------------------------------------------------------------------------------

  private async require(
    actor: AuthenticatedUser,
    provider: IntegrationProvider,
  ): Promise<IntegrationConnectionRow> {
    const row = await this.repository.findByProvider(actor.organizationId, provider);
    if (!row) {
      throw new NotFoundException('This integration has not been set up yet');
    }
    return row;
  }

  private adapterFor(provider: IntegrationProvider): IntegrationProviderAdapter {
    const adapter = this.adapters.find((entry) => entry.provider === provider);
    if (!adapter) {
      throw new ServiceUnavailableException(`No adapter is registered for ${provider}`);
    }
    if (!adapter.isConfigured()) {
      throw new ServiceUnavailableException(
        `${provider} is not configured on this deployment. Set its environment variables first.`,
      );
    }
    return adapter;
  }

  /**
   * An adapter should return `{ ok: false }` rather than throw, but a provider SDK may throw
   * anyway. Catching here means one badly behaved adapter cannot turn a validation into a 500 —
   * and the message is redacted before it goes anywhere.
   */
  private async runValidation(
    adapter: IntegrationProviderAdapter,
    credential: string,
    settings: ProviderSettings,
  ): Promise<ValidationResult> {
    try {
      return await adapter.validate(credential, settings);
    } catch (error) {
      const message = redactMessage(error);
      this.logger.warn({ provider: adapter.provider, message }, 'Integration validation failed');
      return { ok: false, message };
    }
  }
}
