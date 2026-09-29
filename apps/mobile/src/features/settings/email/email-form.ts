import { EMAIL_ENCRYPTION, type EmailEncryption, type EmailSettings } from '@ashniva/types';

import type { EmailSettingsInput } from '../messaging/api';

export interface EmailForm {
  host: string;
  /** Kept as text so the field can be cleared while typing. */
  port: string;
  encryption: EmailEncryption;
  username: string;
  /** Always starts blank: the stored password cannot be read back, and blank keeps it. */
  password: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  enabled: boolean;
}

export function emailFormFrom(settings: EmailSettings | null): EmailForm {
  return {
    host: settings?.host ?? '',
    port: String(settings?.port ?? 587),
    encryption: settings?.encryption ?? EMAIL_ENCRYPTION.STARTTLS,
    username: settings?.username ?? '',
    password: '',
    senderName: settings?.senderName ?? '',
    senderEmail: settings?.senderEmail ?? '',
    replyTo: settings?.replyTo ?? '',
    enabled: settings?.enabled ?? true,
  };
}

export function emailFormValid(form: EmailForm): boolean {
  return form.senderEmail.includes('@') && form.host.trim().length > 0 && Number(form.port) > 0;
}

/** What is sent. Optional fields left blank are left out — above all the password, which keeps it. */
export function emailInput(form: EmailForm): EmailSettingsInput {
  const replyTo = form.replyTo.trim();
  const username = form.username.trim();
  return {
    senderName: form.senderName.trim(),
    senderEmail: form.senderEmail.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    encryption: form.encryption,
    enabled: form.enabled,
    ...(replyTo ? { replyTo } : {}),
    ...(username ? { username } : {}),
    ...(form.password ? { password: form.password } : {}),
  };
}
