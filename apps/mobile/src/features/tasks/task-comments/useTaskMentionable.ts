import { DEFAULT_MENTIONABLE_LIMIT, type MentionablePage } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../../shared/api/client';
import { shouldRetry } from '../../../shared/api/queries';
import { useDebounced } from '../../../shared/components/FilterSheet';

const MENTION_DEBOUNCE_MS = 200;

/**
 * Who can be @mentioned on this task: `GET /tasks/:id/mentionable`, the task's own audience as
 * the API computes it. The picker never builds a list of its own — a name it offers has to be one
 * the comment's notification will reach.
 *
 * Enabled only while an `@` is being typed, so an idle comment box costs no request.
 */
export function useTaskMentionable(taskId: string, term: string | null, open: boolean) {
  const debounced = useDebounced(term, MENTION_DEBOUNCE_MS);
  const query = useQuery<MentionablePage>({
    queryKey: ['tasks', taskId, 'mentionable', debounced ?? ''],
    queryFn: () =>
      apiRequest<MentionablePage>(`/tasks/${taskId}/mentionable`, {
        query: { limit: DEFAULT_MENTIONABLE_LIMIT, ...(debounced ? { q: debounced } : {}) },
      }),
    enabled: open,
    retry: shouldRetry,
  });
  return { items: query.data?.items ?? [], isLoading: query.isLoading && open };
}
