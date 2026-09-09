import type {
  ProductCallbackEndpointSummary,
  ProductCallbackEndpointWithSecret,
  SupportCallbackDeliverySummary,
  SupportCallbackEvent,
  SupportTierPolicySummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface CallbackEndpointInput {
  url: string;
  events?: SupportCallbackEvent[];
  enabled?: boolean;
}

/**
 * A save that may or may not carry a secret.
 *
 * The first save mints one; every later one does not, because reissuing a signing secret whenever
 * somebody corrects a typo in the URL would break the receiver. The screen copies the one-shot
 * handling that `api.ts` uses for machine credentials: the value is shown once and never cached.
 */
export type CallbackSaveResult =
  ProductCallbackEndpointWithSecret | { endpoint: ProductCallbackEndpointSummary };

export const callbackKeys = {
  all: ['product-callbacks'] as const,
  endpoint: (productId: string) => ['product-callbacks', 'endpoint', productId] as const,
  deliveries: (productId: string) => ['product-callbacks', 'deliveries', productId] as const,
};

export function useCallbackEndpointQuery(productId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: callbackKeys.endpoint(productId ?? ''),
    queryFn: () =>
      apiRequest<ProductCallbackEndpointSummary | null>(`/products/${productId}/callbacks`),
    enabled: Boolean(productId) && enabled,
  });
}

export function useCallbackDeliveriesQuery(productId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: callbackKeys.deliveries(productId ?? ''),
    queryFn: () =>
      apiRequest<SupportCallbackDeliverySummary[]>(
        `/products/${productId}/callbacks/deliveries?limit=25`,
      ),
    enabled: Boolean(productId) && enabled,
  });
}

export function useCallbackMutations(productId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: callbackKeys.all });

  return {
    save: useMutation({
      mutationFn: (input: CallbackEndpointInput) =>
        apiRequest<CallbackSaveResult>(`/products/${productId}/callbacks`, {
          method: 'PUT',
          body: input,
        }),
      onSuccess: refresh,
    }),
    /** The response carries a secret. The caller shows it once and does not cache it. */
    rotateSecret: useMutation({
      mutationFn: () =>
        apiRequest<ProductCallbackEndpointWithSecret>(`/products/${productId}/callbacks/secret`, {
          method: 'POST',
        }),
      onSuccess: refresh,
    }),
    redeliver: useMutation({
      mutationFn: (deliveryId: string) =>
        apiRequest<SupportCallbackDeliverySummary>(
          `/products/${productId}/callbacks/deliveries/${deliveryId}/redeliver`,
          { method: 'POST' },
        ),
      onSuccess: refresh,
    }),
  };
}

export const tierKeys = { all: ['support-tiers'] as const };

export function useSupportTiersQuery(enabled = true) {
  return useQuery({
    queryKey: tierKeys.all,
    queryFn: () => apiRequest<SupportTierPolicySummary[]>('/support-tiers'),
    enabled,
  });
}

export function useSupportTierMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ tier, input }: { tier: string; input: Record<string, unknown> }) =>
      apiRequest<SupportTierPolicySummary>(`/support-tiers/${tier}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: tierKeys.all }),
  });
}
