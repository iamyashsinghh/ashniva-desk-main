import type { SupportOwnershipSummary } from '@ashniva/types';

import { useApiMutation } from '../../../shared/api/mutations';
import type { SupportOwnershipInput } from './ownership-form';

/**
 * The one support-routing write the queue screen does not already have: who owns a project's
 * support. It refetches the whole project configuration, like every other routing change.
 */
export function useSaveOwnership(projectId: string, onSuccess: () => void) {
  return useApiMutation<SupportOwnershipInput, SupportOwnershipSummary>({
    path: `/projects/${projectId}/support-ownership`,
    method: 'PUT',
    body: (input) => input,
    invalidate: [['support-routing']],
    onSuccess,
  });
}
