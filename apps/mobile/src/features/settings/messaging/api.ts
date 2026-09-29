import type {
  ConnectionTestResult,
  EmailEncryption,
  EmailSettings,
  MessageTemplate,
  OutboundMessageSummary,
  PaginatedResponse,
  WhatsAppSettings,
} from '@ashniva/types';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';

/**
 * Outbound email and WhatsApp settings. Reading needs `integration:read`; saving and both test
 * actions need `integration:manage`. Keys match the web's, and every write invalidates the whole
 * family because a test updates the channel's last success or last error.
 */

export type MessageChannel = 'EMAIL' | 'WHATSAPP';

const MESSAGING = [['messaging']] as const;
const BASE: Record<MessageChannel, string> = {
  EMAIL: '/settings/email',
  WHATSAPP: '/settings/whatsapp',
};

export interface EmailSettingsInput {
  senderName: string;
  senderEmail: string;
  replyTo?: string;
  host: string;
  port: number;
  encryption: EmailEncryption;
  username?: string;
  /** Left out to keep the stored password. */
  password?: string;
  enabled: boolean;
}

export interface WhatsAppSettingsInput {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  apiVersion?: string;
  templateLanguage?: string;
  templateNames: Partial<Record<MessageTemplate, string>>;
  /** Each left out to keep what is stored. */
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
  enabled: boolean;
}

export interface TestSendResult {
  queued: boolean;
  message: string;
}

export function useEmailSettings(enabled: boolean) {
  return useResource<EmailSettings | null>(['messaging', 'email', 'settings'], BASE.EMAIL, {
    enabled,
  });
}

export function useWhatsAppSettings(enabled: boolean) {
  return useResource<WhatsAppSettings | null>(
    ['messaging', 'whatsapp', 'settings'],
    BASE.WHATSAPP,
    { enabled },
  );
}

export function useMessageHistory(channel: MessageChannel, enabled: boolean) {
  return useResource<PaginatedResponse<OutboundMessageSummary>>(
    ['messaging', channel, 'history'],
    `${BASE[channel]}/history`,
    { enabled, query: { limit: 50 } },
  );
}

export function useSaveEmailSettings() {
  return useApiMutation<EmailSettingsInput, EmailSettings>({
    path: BASE.EMAIL,
    method: 'PUT',
    body: (input) => input,
    invalidate: MESSAGING,
  });
}

export function useSaveWhatsAppSettings() {
  return useApiMutation<WhatsAppSettingsInput, WhatsAppSettings>({
    path: BASE.WHATSAPP,
    method: 'PUT',
    body: (input) => input,
    invalidate: MESSAGING,
  });
}

export function useTestConnection(channel: MessageChannel) {
  return useApiMutation<void, ConnectionTestResult>({
    path: `${BASE[channel]}/test-connection`,
    invalidate: MESSAGING,
  });
}

/** Email sends to the caller's own address; WhatsApp sends one template to a number given here. */
export function useSendEmailTest() {
  return useApiMutation<void, TestSendResult>({
    path: `${BASE.EMAIL}/test-message`,
    invalidate: MESSAGING,
  });
}

export function useSendWhatsAppTest() {
  return useApiMutation<{ template: MessageTemplate; toPhone: string }, TestSendResult>({
    path: `${BASE.WHATSAPP}/test-message`,
    body: (input) => input,
    invalidate: MESSAGING,
  });
}
