import type { ConnectionTestResult, MessageTemplate } from '@ashniva/types';

/**
 * What sending a message needs from a provider, and nothing more.
 *
 * The point of the seam is the same as for the Git integration: `MessageSenderService` never
 * imports a provider SDK, never knows what STARTTLS or a phone number id is, and never branches
 * on the provider name. Adding a provider means adding an adapter and registering it.
 */

/** Resolved tenant configuration, secrets already decrypted. Never logged, never returned. */
export interface ResolvedChannelConfig {
  organizationId: string;
  /** Non-secret settings from `integration_connections.settings`. */
  settings: Record<string, unknown>;
  /** The decrypted password or access token. */
  secret: string | null;
}

export interface OutboundPayload {
  template: MessageTemplate;
  /** Email address or phone number. */
  destination: string;
  recipientName: string;
  organizationName: string;
  /** The one-line headline. Email uses it in the subject; WhatsApp passes it as a parameter. */
  title: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendOutcome {
  /** Provider-side id, kept so a delivery receipt can be matched to the row. */
  providerMessageId: string | null;
}

export interface MessageProvider {
  readonly channel: 'EMAIL' | 'WHATSAPP';

  /** True when the tenant's stored settings are complete enough to attempt a send. */
  isConfigured(config: ResolvedChannelConfig): boolean;

  /**
   * Confirms the stored settings work, without sending anything to a real recipient.
   * Must never throw for an ordinary failure — a bad password is `{ ok: false }` — and must
   * never put the credential into the message it returns.
   */
  verify(config: ResolvedChannelConfig): Promise<ConnectionTestResult>;

  /**
   * Sends one message. May throw: the caller classifies the error to decide whether to retry,
   * which needs the provider's own error object rather than a flattened result.
   */
  send(config: ResolvedChannelConfig, payload: OutboundPayload): Promise<SendOutcome>;
}

/** Injection token for the array of registered message providers. */
export const MESSAGE_PROVIDERS = Symbol('MESSAGE_PROVIDERS');
