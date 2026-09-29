import type {
  CreatedProductCredential,
  IvrPolicyInput,
  IvrPolicySummary,
  IvrReadiness,
  Priority,
  ProductCallbackEndpointSummary,
  ProductCallbackEndpointWithSecret,
  ProductCredentialSummary,
  ProductDetail,
  ProductSummary,
  SupportCallbackDeliverySummary,
  SupportCallbackEvent,
  SupportTier,
  SupportTierPolicySummary,
  TicketType,
} from '@ashniva/types';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';

/**
 * The product registry and everything hung off one product: its credentials, status callbacks,
 * IVR policy, and the organization-wide support tiers.
 *
 * Keys match the web's so the two invalidate the same things. The two responses that carry a
 * secret — a credential issued or rotated, a callback signing secret minted — are handed to the
 * caller once and never written to the cache: there is nothing to refetch them from afterwards.
 */

export interface ProductInput {
  code?: string;
  name?: string;
  projectId?: string | null;
  isActive?: boolean;
  supportEnabled?: boolean;
  autoRouteEnabled?: boolean;
  ivrEnabled?: boolean;
  supportTier?: SupportTier;
  allowedWorkAreas?: string[];
  allowedOrigins?: string[];
  defaultPriority?: Priority;
  defaultType?: TicketType;
}

export interface CallbackInput {
  url: string;
  events: SupportCallbackEvent[];
  enabled: boolean;
}

/** The first save mints a signing secret; later ones do not. */
export type CallbackSaveResult =
  ProductCallbackEndpointWithSecret | { endpoint: ProductCallbackEndpointSummary };

export const productKeys = {
  all: ['products'] as const,
  list: ['products', 'list'] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
};
const CALLBACKS = ['product-callbacks'] as const;
const TIERS = ['support-tiers'] as const;
const CALLS = ['calls'] as const;

export function useProducts(enabled: boolean) {
  return useResource<ProductSummary[]>(productKeys.list, '/products', { enabled });
}

export function useProduct(id: string, enabled: boolean) {
  return useResource<ProductDetail>(productKeys.detail(id), `/products/${id}`, { enabled });
}

export function useCreateProduct(onSuccess: (product: ProductDetail) => void) {
  return useApiMutation<ProductInput, ProductDetail>({
    path: '/products',
    body: (input) => input,
    invalidate: [productKeys.all],
    onSuccess,
  });
}

export function useUpdateProduct(id: string, onSuccess: () => void) {
  return useApiMutation<ProductInput, ProductDetail>({
    path: `/products/${id}`,
    method: 'PATCH',
    body: (input) => input,
    invalidate: [productKeys.all],
    onSuccess,
  });
}

export function useIssueCredential(productId: string) {
  return useApiMutation<string, CreatedProductCredential>({
    path: `/products/${productId}/credentials`,
    body: (label) => ({ label }),
    invalidate: [productKeys.all],
  });
}

export function useRotateCredential(productId: string) {
  return useApiMutation<string, CreatedProductCredential>({
    path: (credentialId) => `/products/${productId}/credentials/${credentialId}/rotate`,
    invalidate: [productKeys.all],
  });
}

export function useRevokeCredential(productId: string) {
  return useApiMutation<string, ProductCredentialSummary>({
    path: (credentialId) => `/products/${productId}/credentials/${credentialId}`,
    method: 'DELETE',
    invalidate: [productKeys.all],
  });
}

export function useCallbackEndpoint(productId: string, enabled: boolean) {
  return useResource<ProductCallbackEndpointSummary | null>(
    [...CALLBACKS, 'endpoint', productId],
    `/products/${productId}/callbacks`,
    { enabled },
  );
}

export function useCallbackDeliveries(productId: string, enabled: boolean) {
  return useResource<SupportCallbackDeliverySummary[]>(
    [...CALLBACKS, 'deliveries', productId],
    `/products/${productId}/callbacks/deliveries`,
    { enabled, query: { limit: 25 } },
  );
}

export function useSaveCallback(productId: string) {
  return useApiMutation<CallbackInput, CallbackSaveResult>({
    path: `/products/${productId}/callbacks`,
    method: 'PUT',
    body: (input) => input,
    invalidate: [CALLBACKS],
  });
}

export function useRotateCallbackSecret(productId: string) {
  return useApiMutation<void, ProductCallbackEndpointWithSecret>({
    path: `/products/${productId}/callbacks/secret`,
    invalidate: [CALLBACKS],
  });
}

export function useRedeliver(productId: string) {
  return useApiMutation<string, SupportCallbackDeliverySummary>({
    path: (deliveryId) => `/products/${productId}/callbacks/deliveries/${deliveryId}/redeliver`,
    invalidate: [CALLBACKS],
  });
}

export function useIvrPolicy(productId: string, enabled: boolean) {
  return useResource<IvrPolicySummary>(
    [...CALLS, 'ivr-policy', productId],
    `/products/${productId}/ivr-policy`,
    { enabled },
  );
}

export function useSaveIvrPolicy(productId: string, onSuccess: () => void) {
  return useApiMutation<IvrPolicyInput, IvrPolicySummary>({
    path: `/products/${productId}/ivr-policy`,
    method: 'PUT',
    body: (input) => input,
    invalidate: [CALLS, productKeys.all],
    onSuccess,
  });
}

export function useIvrReadiness(enabled: boolean) {
  return useResource<IvrReadiness>([...CALLS, 'ivr-readiness'], '/ivr/health', { enabled });
}

export function useSupportTiers(enabled: boolean) {
  return useResource<SupportTierPolicySummary[]>(TIERS, '/support-tiers', { enabled });
}

export type TierInput = Partial<
  Pick<
    SupportTierPolicySummary,
    | 'admissionEnabled'
    | 'callsEnabled'
    | 'requesterInitiatedCalls'
    | 'dedicatedOwnership'
    | 'minimumPriority'
    | 'ackMinutes'
    | 'escalationMinutes'
    | 'fallbackStrategy'
    | 'availabilityWindow'
  >
>;

export function useSaveTier(tier: SupportTier, onSuccess: () => void) {
  return useApiMutation<TierInput, SupportTierPolicySummary>({
    path: `/support-tiers/${tier}`,
    method: 'PUT',
    body: (input) => input,
    invalidate: [TIERS],
    onSuccess,
  });
}
