import type { AvatarPreset, SessionUser, UserAvatar } from '@ashniva/types';
import { useCallback, useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { useSession } from '../auth/SessionProvider';
import { avatarForm, choosePhoto, type PhotoChoice, type PickedPhoto } from './profile-picture';

const AVATAR_PATH = '/users/me/avatar';

/**
 * The three ways of changing your picture, and what the sheet needs to draw them.
 *
 * Each write updates the session as soon as the API accepts it, so the header — and anything else
 * drawing the signed-in person — shows the new picture without waiting for `/auth/me`.
 * Every action resolves true when it worked, so the sheet knows when to close.
 */
export function useProfilePicture() {
  const { updateUser } = useSession();
  const [pickError, setPickError] = useState<string | null>(null);

  const applyAvatar = useCallback(
    (avatar: UserAvatar | null) => updateUser((user: SessionUser) => ({ ...user, avatar })),
    [updateUser],
  );

  const upload = useApiMutation<PickedPhoto, UserAvatar>({
    path: AVATAR_PATH,
    method: 'POST',
    body: avatarForm,
    onSuccess: applyAvatar,
  });
  const preset = useApiMutation<AvatarPreset, UserAvatar>({
    path: AVATAR_PATH,
    method: 'PUT',
    body: (value) => ({ preset: value }),
    onSuccess: applyAvatar,
  });
  const remove = useApiMutation<void, void>({
    path: AVATAR_PATH,
    method: 'DELETE',
    onSuccess: () => applyAvatar(null),
  });

  const { reset: resetUpload } = upload;
  const { reset: resetPreset } = preset;
  const { reset: resetRemove } = remove;
  const clearErrors = useCallback(() => {
    setPickError(null);
    resetUpload();
    resetPreset();
    resetRemove();
  }, [resetUpload, resetPreset, resetRemove]);

  const setPhoto = async (source: 'camera' | 'library'): Promise<boolean> => {
    clearErrors();
    let choice: PhotoChoice;
    try {
      choice = await choosePhoto(source);
    } catch {
      // Expo Go on a simulator has no camera, and the picker says so by throwing.
      setPickError(
        source === 'camera' ? 'The camera is not available here.' : 'Could not open your photos.',
      );
      return false;
    }
    if (choice.kind === 'refused') {
      setPickError(choice.message);
      return false;
    }
    if (choice.kind === 'cancelled') {
      return false;
    }
    return (await upload.run(choice.photo)) !== null;
  };

  const choosePreset = async (value: AvatarPreset): Promise<boolean> => {
    clearErrors();
    return (await preset.run(value)) !== null;
  };

  // A 204 resolves `run` with undefined; only a failure resolves it with null.
  const removePicture = async (): Promise<boolean> => {
    clearErrors();
    return (await remove.run()) !== null;
  };

  return {
    setPhoto,
    choosePreset,
    removePicture,
    clearErrors,
    busy: upload.busy || preset.busy || remove.busy,
    error: pickError ?? upload.error ?? preset.error ?? remove.error,
  };
}
