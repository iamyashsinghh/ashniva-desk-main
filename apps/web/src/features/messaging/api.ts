import type {
  ConnectionTestResult,
  EmailEncryption,
  EmailSettings,
  MessageTemplate,
  OutboundMessageSummary,
  PaginatedResponse,
  WhatsAppSettings,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const messagingKeys = {
  all: ['messaging'] as const,
  emailSettings: () => ['messaging', 'email', 'settings'] as const,
  whatsappSettings: () => ['messaging', 'whatsapp', 'settings'] as const,
  history: (channel: MessageChannel) => ['messaging', channel, 'history'] as const,
};

export type MessageChannel = 'EMAIL' | 'WHATSAPP';

/** One hook for both channels: the shape is identical, only the path differs. */
export function useMessageHistoryQuery(channel: MessageChannel) {
  const path = channel === 'EMAIL' ? '/settings/email/history' : '/settings/whatsapp/history';
  return useQuery({
    queryKey: messagingKeys.history(channel),
    queryFn: () =>
      apiRequest<PaginatedResponse<OutboundMessageSummary>>(path, { query: { limit: 50 } }),
  });
}

export function useEmailSettingsQuery() {
  return useQuery({
    queryKey: messagingKeys.emailSettings(),
    queryFn: () => apiRequest<EmailSettings | null>('/settings/email'),
  });
}

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
  enabled?: boolean;
}

export function useEmailMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: messagingKeys.all });

  return {
    save: useMutation({
      mutationFn: (body: EmailSettingsInput) =>
        apiRequest<EmailSettings>('/settings/email', { method: 'PUT', body }),
      onSuccess: invalidate,
    }),
    testConnection: useMutation({
      mutationFn: () =>
        apiRequest<ConnectionTestResult>('/settings/email/test-connection', { method: 'POST' }),
      onSuccess: invalidate,
    }),
    sendTest: useMutation({
      mutationFn: () =>
        apiRequest<{ queued: boolean; message: string }>('/settings/email/test-message', {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
  };
}

export interface WhatsAppSettingsInput {
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifyToken?: string;
  appSecret?: string;
  apiVersion?: string;
  templateNames?: Partial<Record<MessageTemplate, string>>;
  templateLanguage?: string;
  /** Left out to keep the stored token. */
  accessToken?: string;
  enabled?: boolean;
}

export function useWhatsAppSettingsQuery() {
  return useQuery({
    queryKey: messagingKeys.whatsappSettings(),
    queryFn: () => apiRequest<WhatsAppSettings | null>('/settings/whatsapp'),
  });
}

export function useWhatsAppMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: messagingKeys.all });

  return {
    save: useMutation({
      mutationFn: (body: WhatsAppSettingsInput) =>
        apiRequest<WhatsAppSettings>('/settings/whatsapp', { method: 'PUT', body }),
      onSuccess: invalidate,
    }),
    testConnection: useMutation({
      mutationFn: () =>
        apiRequest<ConnectionTestResult>('/settings/whatsapp/test-connection', { method: 'POST' }),
      onSuccess: invalidate,
    }),
    sendTest: useMutation({
      mutationFn: (body: { template: MessageTemplate; toPhone: string }) =>
        apiRequest<{ queued: boolean; message: string }>('/settings/whatsapp/test-message', {
          method: 'POST',
          body,
        }),
      onSuccess: invalidate,
    }),
  };
}
