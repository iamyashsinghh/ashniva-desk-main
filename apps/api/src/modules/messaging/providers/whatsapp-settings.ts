import type { MessageTemplate } from '@ashniva/types';

/**
 * Reading the tenant's WhatsApp settings out of the connection's `settings` JSON.
 *
 * As with email, the column is untyped and may have been written by an older version of the
 * form, so nothing is trusted to be the right shape.
 */

export interface WhatsAppConfig {
  businessAccountId: string;
  phoneNumberId: string;
  /** The number as customers see it. Display only; the API addresses by `phoneNumberId`. */
  displayPhoneNumber: string | null;
  /** Echoed back during Meta's GET verification handshake. */
  verifyToken: string | null;
  /** Signs inbound webhooks. Stored separately from the access token, as Meta issues both. */
  appSecret: string | null;
  /** Graph API version, e.g. `v21.0`. */
  apiVersion: string;
  /** Our template key to the name approved in the WhatsApp Business account. */
  templateNames: Partial<Record<MessageTemplate, string>>;
  /** Language code the approved templates were submitted in. */
  templateLanguage: string;
}

const DEFAULT_API_VERSION = 'v21.0';
const API_VERSION_PATTERN = /^v\d{1,3}\.\d{1,3}$/;

export function readWhatsAppConfig(settings: Record<string, unknown>): WhatsAppConfig | null {
  const businessAccountId = str(settings.businessAccountId);
  const phoneNumberId = str(settings.phoneNumberId);

  // Without both ids there is nothing to send through; the caller reports the channel as
  // unconfigured rather than failing on the first message.
  if (!businessAccountId || !phoneNumberId) {
    return null;
  }

  return {
    businessAccountId,
    phoneNumberId,
    displayPhoneNumber: str(settings.displayPhoneNumber),
    verifyToken: str(settings.verifyToken),
    appSecret: str(settings.appSecret),
    apiVersion: apiVersionOf(settings.apiVersion),
    templateNames: templateNamesOf(settings.templateNames),
    templateLanguage: str(settings.templateLanguage) ?? 'en',
  };
}

/**
 * The approved template name for one of our message types.
 *
 * WhatsApp will not deliver free-form text to someone who has not messaged recently; everything
 * we send is a template the business had approved in advance. A type with no mapping cannot be
 * sent at all, which is why this returns null rather than inventing a name.
 */
export function approvedTemplateName(
  config: WhatsAppConfig,
  template: MessageTemplate,
): string | null {
  return config.templateNames[template] ?? null;
}

/**
 * Pinned to a known-good shape so a typo in the settings cannot build a URL that reaches some
 * other path on the Graph host.
 */
function apiVersionOf(value: unknown): string {
  const candidate = str(value);
  return candidate && API_VERSION_PATTERN.test(candidate) ? candidate : DEFAULT_API_VERSION;
}

function templateNamesOf(value: unknown): Partial<Record<MessageTemplate, string>> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const result: Partial<Record<MessageTemplate, string>> = {};
  for (const [key, name] of Object.entries(value as Record<string, unknown>)) {
    const trimmed = str(name);
    if (trimmed) {
      result[key as MessageTemplate] = trimmed;
    }
  }
  return result;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
