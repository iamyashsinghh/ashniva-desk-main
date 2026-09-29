import type { AdminBrandingView, BrandingUpdate } from '@ashniva/types';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import {
  uploadAttachment,
  UNPARENTED,
  type PickedFile,
} from '../../../shared/attachments/attachments';

/**
 * Admin → Branding, behind `branding:manage`.
 *
 * Every write invalidates the whole `['branding']` family: that is both this screen's view and the
 * public branding the app itself is painted with, so a saved colour reaches the phone's own theme
 * without a restart.
 */

export const ADMIN_BRANDING_KEY = ['branding', 'admin'] as const;

export function useAdminBranding(enabled: boolean) {
  return useResource<AdminBrandingView>(ADMIN_BRANDING_KEY, '/admin/branding', { enabled });
}

export function useSaveBranding() {
  return useApiMutation<BrandingUpdate, AdminBrandingView>({
    path: '/admin/branding',
    method: 'PATCH',
    body: (update) => update,
    invalidate: [['branding']],
  });
}

/**
 * Uploads a logo through the ordinary attachment endpoint and returns its id, for a PATCH to
 * reference — the web's two steps, so there is one upload path with one set of size and type rules.
 * Throws with a sentence worth showing when the file is refused.
 */
export async function uploadLogoFile(file: PickedFile): Promise<string> {
  const uploaded = await uploadAttachment(file, UNPARENTED);
  return uploaded.id;
}
