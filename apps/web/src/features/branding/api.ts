import {
  brandingSchema,
  type AdminBrandingView,
  type Branding,
  type BrandingUpdate,
  type FileSummary,
  type ThemeSourceReadiness,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { webEnv } from '../../config/env';
import { apiRequest } from '../../shared/lib/api-client';

export const brandingQueryKey = ['branding'] as const;
export const adminBrandingQueryKey = ['branding', 'admin'] as const;

export async function fetchBranding(): Promise<Branding> {
  const response = await apiRequest<unknown>('/branding');
  return brandingSchema.parse(response);
}

export function useBrandingQuery() {
  return useQuery({
    queryKey: brandingQueryKey,
    queryFn: fetchBranding,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Where to load the logo image from.
 *
 * An uploaded logo wins over an externally hosted URL, because uploading one is the more
 * deliberate act. The uploaded one is fetched from `/branding/logo` rather than
 * `/files/:id/download`: this runs on the sign-in page, which has no bearer token to send.
 */
export function brandingLogoSrc(branding: Branding): string | null {
  if (branding.logoFileId) {
    return `${webEnv.apiBaseUrl}/branding/logo`;
  }
  return branding.logoUrl;
}

export function useAdminBrandingQuery() {
  return useQuery({
    queryKey: adminBrandingQueryKey,
    queryFn: () => apiRequest<AdminBrandingView>('/admin/branding'),
  });
}

export function useThemeSourceQuery(enabled: boolean) {
  return useQuery({
    queryKey: [...adminBrandingQueryKey, 'theme-source'] as const,
    queryFn: () => apiRequest<ThemeSourceReadiness>('/admin/branding/theme-source'),
    enabled,
  });
}

export function useBrandingMutations() {
  const queryClient = useQueryClient();
  // Both keys: the screen shows the overrides, and the app shell is rendering the effect of them.
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: brandingQueryKey });
  };

  return {
    save: useMutation({
      mutationFn: (body: BrandingUpdate) =>
        apiRequest<AdminBrandingView>('/admin/branding', { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    /**
     * Uploads through the ordinary attachment endpoint and then references the id.
     *
     * Two steps rather than one multipart branding endpoint, so there is exactly one upload path
     * in the product with one set of size and content-type rules.
     */
    uploadLogo: useMutation({
      mutationFn: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await apiRequest<FileSummary>('/files', { method: 'POST', formData });
        return apiRequest<AdminBrandingView>('/admin/branding', {
          method: 'PATCH',
          body: { logoFileId: uploaded.id } satisfies BrandingUpdate,
        });
      },
      onSuccess: invalidate,
    }),
  };
}
