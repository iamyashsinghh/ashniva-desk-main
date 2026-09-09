import type { IntegrationProvider, ValidationResult } from '@ashniva/types';

/**
 * What the framework needs from any provider, and nothing more.
 *
 * The point of this seam is that `IntegrationsService` never imports a provider SDK, never knows
 * what a "personal access token" is, and never branches on the provider name. Adding a provider
 * means adding an adapter and registering it — no change to the controller, the service, the
 * repository or the credential handling.
 */
export interface IntegrationProviderAdapter {
  readonly provider: IntegrationProvider;

  /**
   * True when the deployment has the environment variables this provider needs. A provider that
   * is not configured is reported as unavailable rather than failing on first use.
   */
  isConfigured(): boolean;

  /**
   * Calls the provider with the stored credential to confirm it still works. Must never throw for
   * an ordinary rejection — an invalid credential is `{ ok: false }`, not an exception — and must
   * never put the credential into the message it returns.
   */
  validate(credential: string, settings: ProviderSettings): Promise<ValidationResult>;
}

/** Non-secret provider configuration, as stored in `integration_connections.settings`. */
export type ProviderSettings = Record<string, string | number | boolean | null>;

/** Injection token for the array of registered adapters. */
export const INTEGRATION_PROVIDERS = Symbol('INTEGRATION_PROVIDERS');
