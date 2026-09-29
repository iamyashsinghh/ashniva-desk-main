import type { AvatarPreset, UserAvatar } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage } from '../../shared/lib/api-client';
import { refreshSessionUser } from '../auth/api';
import { getSessionState, setSessionUser } from '../auth/session-store';
import { conversationKeys } from '../communication/api';
import { chooseAvatarPreset, removeAvatar, uploadAvatarPhoto } from './avatar-api';
import { prepareAvatar } from './avatar-image';

export type AvatarAction = 'upload' | 'preset' | 'remove';

/**
 * Changing your own picture, and making every screen show the change.
 *
 * The answer to each call is applied to the session at once, so the header does not wait on a
 * second request; `GET /auth/me` is then asked for the authoritative copy. The conversation caches
 * are dropped too, because the viewer's own picture is embedded in every thread they are in.
 */
export function useAvatarChange() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<AvatarAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: AvatarAction, work: () => Promise<UserAvatar | null>) {
    setBusy(action);
    setError(null);
    try {
      const avatar = await work();
      const { user } = getSessionState();
      if (user) {
        setSessionUser({ ...user, avatar });
      }
      // The change itself landed; a failed re-read only means the copy above stays until the next.
      await refreshSessionUser().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    error,
    clearError: () => setError(null),
    upload: (file: File) =>
      run('upload', async () => {
        const prepared = await prepareAvatar(file);
        if (!prepared.ok) {
          throw new Error(prepared.message);
        }
        return uploadAvatarPhoto(prepared.photo, prepared.fileName);
      }),
    choosePreset: (preset: AvatarPreset) => run('preset', () => chooseAvatarPreset(preset)),
    remove: () => run('remove', () => removeAvatar().then(() => null)),
  };
}
