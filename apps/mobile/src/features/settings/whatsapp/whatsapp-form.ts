import type { MessageTemplate, WhatsAppSettings } from '@ashniva/types';

import type { WhatsAppSettingsInput } from '../messaging/api';

export interface WhatsAppForm {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  apiVersion: string;
  templateLanguage: string;
  templateNames: Partial<Record<MessageTemplate, string>>;
  /** The three secrets always start blank: none can be read back, and blank keeps each. */
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  enabled: boolean;
}

export function whatsAppFormFrom(settings: WhatsAppSettings | null): WhatsAppForm {
  return {
    businessAccountId: settings?.businessAccountId ?? '',
    phoneNumberId: settings?.phoneNumberId ?? '',
    displayPhoneNumber: settings?.displayPhoneNumber ?? '',
    apiVersion: settings?.apiVersion ?? 'v21.0',
    templateLanguage: settings?.templateLanguage ?? 'en',
    templateNames: settings?.templateNames ?? {},
    accessToken: '',
    appSecret: '',
    verifyToken: '',
    enabled: settings?.enabled ?? true,
  };
}

const META_ID = /^\d{5,25}$/;

export function whatsAppFormValid(form: WhatsAppForm): boolean {
  return META_ID.test(form.businessAccountId.trim()) && META_ID.test(form.phoneNumberId.trim());
}

/** What is sent. A blank optional field is left out — above all a secret, which keeps it. */
export function whatsAppInput(form: WhatsAppForm): WhatsAppSettingsInput {
  const optional = {
    displayPhoneNumber: form.displayPhoneNumber.trim(),
    apiVersion: form.apiVersion.trim(),
    templateLanguage: form.templateLanguage.trim(),
    accessToken: form.accessToken,
    appSecret: form.appSecret,
    verifyToken: form.verifyToken,
  };
  return {
    businessAccountId: form.businessAccountId.trim(),
    phoneNumberId: form.phoneNumberId.trim(),
    templateNames: form.templateNames,
    enabled: form.enabled,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== '')),
  };
}
