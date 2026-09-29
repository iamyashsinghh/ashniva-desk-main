import type { ReleaseNoteDetail } from '@ashniva/types';

import {
  useApiMutation,
  type ApiMutation,
  type ApiMutationOptions,
} from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';

/**
 * Reads and writes for release notes.
 *
 * Every write answers with the whole note and invalidates both the internal keys and the portal's:
 * publishing is exactly the moment the client's copy changes.
 */

export const releaseNoteKeys = {
  all: ['release-notes'] as const,
  detail: (id: string) => ['release-notes', 'detail', id] as const,
};

export const RELEASE_NOTE_INVALIDATES = [['release-notes'], ['portal']] as const;

export function useReleaseNote(id: string) {
  return useResource<ReleaseNoteDetail>(releaseNoteKeys.detail(id), `/release-notes/${id}`);
}

/** One write on a note, by path suffix: `submit`, `items`, `items/order` and so on. */
export function useReleaseNoteWrite<V = void>(
  noteId: string,
  suffix: string | ((variables: V) => string),
  options: Pick<ApiMutationOptions<V, ReleaseNoteDetail>, 'method' | 'body' | 'onSuccess'> = {},
): ApiMutation<V, ReleaseNoteDetail> {
  return useApiMutation<V, ReleaseNoteDetail>({
    path:
      typeof suffix === 'function'
        ? (variables) => `/release-notes/${noteId}/${suffix(variables)}`
        : `/release-notes/${noteId}/${suffix}`,
    invalidate: RELEASE_NOTE_INVALIDATES,
    ...options,
  });
}
