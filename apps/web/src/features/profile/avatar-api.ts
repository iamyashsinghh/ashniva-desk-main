import type { AvatarPreset, SetAvatarPresetInput, UserAvatar } from '@ashniva/types';

import { apiRequest } from '../../shared/lib/api-client';

export function uploadAvatarPhoto(photo: Blob, fileName: string): Promise<UserAvatar> {
  const formData = new FormData();
  formData.append('file', photo, fileName);
  return apiRequest<UserAvatar>('/users/me/avatar', { method: 'POST', formData });
}

export function chooseAvatarPreset(preset: AvatarPreset): Promise<UserAvatar> {
  const body: SetAvatarPresetInput = { preset };
  return apiRequest<UserAvatar>('/users/me/avatar', { method: 'PUT', body });
}

export function removeAvatar(): Promise<void> {
  return apiRequest<void>('/users/me/avatar', { method: 'DELETE' });
}
