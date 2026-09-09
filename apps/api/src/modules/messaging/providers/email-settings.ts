import { EMAIL_ENCRYPTION, type EmailEncryption } from '@ashniva/types';

/**
 * Reading the tenant's email settings out of the connection's `settings` JSON.
 *
 * The column is untyped, and its contents were written by an earlier version of the settings
 * form, so every field is read defensively and nothing is trusted to be the right shape.
 */

export interface EmailConfig {
  senderName: string;
  senderEmail: string;
  replyTo: string | null;
  host: string;
  port: number;
  encryption: EmailEncryption;
  username: string | null;
}

const ENCRYPTIONS = new Set<string>(Object.values(EMAIL_ENCRYPTION));

export function readEmailConfig(settings: Record<string, unknown>): EmailConfig | null {
  const host = str(settings.host);
  const senderEmail = str(settings.senderEmail);
  const port = num(settings.port);

  // Without a host, a sender and a port there is nothing to attempt; the caller reports the
  // channel as unconfigured rather than failing on the first send.
  if (!host || !senderEmail || port === null) {
    return null;
  }

  return {
    senderName: str(settings.senderName) ?? senderEmail,
    senderEmail,
    replyTo: str(settings.replyTo),
    host,
    port,
    encryption: encryptionOf(settings.encryption, port),
    username: str(settings.username),
  };
}

/**
 * Whether the socket itself is TLS from the start.
 *
 * STARTTLS is *not* implicit TLS: the connection opens in the clear and is upgraded, which
 * nodemailer expresses as `secure: false` plus `requireTLS`. Conflating the two is how a mail
 * setup ends up sending credentials unencrypted.
 */
export function transportSecurity(encryption: EmailEncryption): {
  secure: boolean;
  requireTLS: boolean;
} {
  switch (encryption) {
    case 'TLS':
      return { secure: true, requireTLS: false };
    case 'STARTTLS':
      return { secure: false, requireTLS: true };
    default:
      return { secure: false, requireTLS: false };
  }
}

function encryptionOf(value: unknown, port: number): EmailEncryption {
  if (typeof value === 'string' && ENCRYPTIONS.has(value)) {
    return value as EmailEncryption;
  }
  // A setting written before the field existed: infer from the port rather than fall back to
  // NONE, which would silently downgrade an encrypted connection.
  return port === 465 ? 'TLS' : 'STARTTLS';
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : null;
}
