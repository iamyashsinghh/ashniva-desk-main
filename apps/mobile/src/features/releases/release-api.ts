import type { ProjectReleasePolicySummary, ReleaseDetail } from '@ashniva/types';

import { useApiMutation, type ApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';

/**
 * Reads and writes for releases.
 *
 * Every write answers with the whole release, readiness included, and invalidates the release
 * keys so the checklist and the Publish button move with the action. Release notes are
 * invalidated too: publishing a release is what links it to the note the client reads.
 */

export const releaseKeys = {
  all: ['releases'] as const,
  detail: (id: string) => ['releases', 'detail', id] as const,
  policy: (projectId: string) => ['releases', 'policy', projectId] as const,
  signOffs: (releaseId: string) => ['uat', 'internal', releaseId] as const,
};

export const RELEASE_INVALIDATES = [['releases'], ['release-notes']] as const;

export function useRelease(id: string) {
  return useResource<ReleaseDetail>(releaseKeys.detail(id), `/releases/${id}`);
}

export function useReleasePolicy(projectId: string, enabled = true) {
  return useResource<ProjectReleasePolicySummary>(
    releaseKeys.policy(projectId),
    `/projects/${projectId}/release-policy`,
    { enabled },
  );
}

/**
 * One `POST /releases/:id/<action>`. The body is a function of the variables so a sheet can pass
 * what the operator typed; `onDone` runs after the caches have been refreshed.
 */
export function useReleaseAction<V = void>(
  releaseId: string,
  action: string,
  body?: (variables: V) => unknown,
  onDone?: (release: ReleaseDetail) => void,
): ApiMutation<V, ReleaseDetail> {
  return useApiMutation<V, ReleaseDetail>({
    path: `/releases/${releaseId}/${action}`,
    ...(body ? { body } : {}),
    invalidate: RELEASE_INVALIDATES,
    ...(onDone ? { onSuccess: onDone } : {}),
  });
}
