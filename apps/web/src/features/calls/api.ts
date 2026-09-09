import type {
  CallAvailability,
  CallRecordingAccess,
  CallSummary,
  IvrPolicyInput,
  IvrPolicySummary,
  IvrReadiness,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const callKeys = {
  all: ['calls'] as const,
  forTicket: (ticketId: string) => ['calls', 'ticket', ticketId] as const,
  availability: (ticketId: string) => ['calls', 'availability', ticketId] as const,
  policy: (productId: string) => ['calls', 'ivr-policy', productId] as const,
  readiness: ['calls', 'ivr-readiness'] as const,
};

/**
 * Whether the configured IVR adapter can place a real call.
 *
 * Read once and not refetched on focus: the answer changes when somebody edits an integration
 * connection, not while an administrator reads it, and this screen already invalidates on that.
 */
export function useIvrReadinessQuery(enabled = true) {
  return useQuery({
    queryKey: callKeys.readiness,
    queryFn: () => apiRequest<IvrReadiness>('/ivr/health'),
    enabled,
    refetchOnWindowFocus: false,
  });
}

/**
 * Whether the Call Support action should be offered.
 *
 * Asked of the server rather than worked out here. The answer depends on the product's policy,
 * the support tier and who the caller is, and a second copy of those rules in the browser would
 * be a second thing to keep in step — and the one that gets it wrong in the client's favour.
 */
export function useCallAvailabilityQuery(ticketId: string | undefined) {
  return useQuery({
    queryKey: callKeys.availability(ticketId ?? ''),
    queryFn: () => apiRequest<CallAvailability>(`/tickets/${ticketId}/calls/availability`),
    enabled: Boolean(ticketId),
  });
}

/** The internal call history on a ticket. Needs `call:read-internal`; the caller checks first. */
export function useTicketCallsQuery(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: callKeys.forTicket(ticketId ?? ''),
    queryFn: () => apiRequest<CallSummary[]>(`/tickets/${ticketId}/calls`),
    enabled: enabled && Boolean(ticketId),
  });
}

export function useCallMutations(ticketId?: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: callKeys.all });

  return {
    initiate: useMutation({
      mutationFn: (input: { recordingConsent?: boolean }) =>
        apiRequest<CallSummary>(`/tickets/${ticketId}/calls`, { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (callId: string) =>
        apiRequest<CallSummary>(`/calls/${callId}/cancel`, { method: 'POST' }),
      onSuccess: refresh,
    }),
    /**
     * Asking for a playable recording.
     *
     * Not a query: fetching one is an audited access, and a cached query would replay it on every
     * remount. It happens when somebody presses play, once, deliberately.
     */
    playRecording: useMutation({
      mutationFn: (callId: string) => apiRequest<CallRecordingAccess>(`/calls/${callId}/recording`),
    }),
  };
}

export function useIvrPolicyQuery(productId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: callKeys.policy(productId ?? ''),
    queryFn: () => apiRequest<IvrPolicySummary>(`/products/${productId}/ivr-policy`),
    enabled: enabled && Boolean(productId),
  });
}

export function useIvrPolicyMutation(productId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: IvrPolicyInput) =>
      apiRequest<IvrPolicySummary>(`/products/${productId}/ivr-policy`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: callKeys.all });
      void client.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
