import type {
  CreatedProductCredential,
  Priority,
  ProductCredentialSummary,
  ProductDetail,
  ProductSummary,
  SupportTier,
  TicketSource,
  TicketType,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface ProductInput {
  code?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  projectId?: string | null;
  supportRequesterId?: string | null;
  supportEnabled?: boolean;
  autoRouteEnabled?: boolean;
  ivrEnabled?: boolean;
  supportTier?: SupportTier;
  allowedSources?: TicketSource[];
  allowedWorkAreas?: string[];
  allowedOrigins?: string[];
  defaultPriority?: Priority;
  defaultType?: TicketType;
}

export const productKeys = {
  all: ['products'] as const,
  list: ['products', 'list'] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
};

export function useProductsQuery(enabled = true) {
  return useQuery({
    queryKey: productKeys.list,
    queryFn: () => apiRequest<ProductSummary[]>('/products'),
    enabled,
  });
}

export function useProductQuery(id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ProductDetail>(`/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useProductMutations(productId?: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: productKeys.all });

  return {
    create: useMutation({
      mutationFn: (input: ProductInput) =>
        apiRequest<ProductDetail>('/products', { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: ProductInput }) =>
        apiRequest<ProductDetail>(`/products/${id}`, { method: 'PATCH', body: input }),
      onSuccess: refresh,
    }),
    /**
     * The one call whose response carries a secret. The caller shows it once and does not put it
     * in the query cache — there is nothing to refetch it from afterwards.
     */
    issueCredential: useMutation({
      mutationFn: (label: string) =>
        apiRequest<CreatedProductCredential>(`/products/${productId}/credentials`, {
          method: 'POST',
          body: { label },
        }),
      onSuccess: refresh,
    }),
    rotateCredential: useMutation({
      mutationFn: (credentialId: string) =>
        apiRequest<CreatedProductCredential>(
          `/products/${productId}/credentials/${credentialId}/rotate`,
          { method: 'POST' },
        ),
      onSuccess: refresh,
    }),
    revokeCredential: useMutation({
      mutationFn: (credentialId: string) =>
        apiRequest<ProductCredentialSummary>(`/products/${productId}/credentials/${credentialId}`, {
          method: 'DELETE',
        }),
      onSuccess: refresh,
    }),
  };
}
