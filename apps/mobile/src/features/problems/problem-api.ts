import type { IncidentDetail, ProblemDetail } from '@ashniva/types';

import { useApiMutation, type ApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';

/**
 * Reading and writing problems and incidents.
 *
 * Both aggregates share the `problems` root key, as on the web: an incident opened against a
 * problem changes the problem's screen, and a ticket linked into a problem changes the recurring
 * report, so one invalidation after any write keeps every screen in this area honest.
 */

export const problemKeys = {
  list: (params: object) => ['problems', 'list', params] as const,
  detail: (id: string) => ['problems', 'detail', id] as const,
  recurring: (params: object) => ['problems', 'recurring', params] as const,
  incidents: (params: object) => ['problems', 'incidents', params] as const,
  incident: (id: string) => ['problems', 'incident', id] as const,
};

/** Linking tickets also changes the ticket screens, which show the problem a ticket is in. */
const PROBLEM_INVALIDATES = [['problems'], ['tickets']] as const;

export function useProblem(id: string) {
  return useResource<ProblemDetail>(problemKeys.detail(id), `/problems/${id}`);
}

export function useIncident(id: string) {
  return useResource<IncidentDetail>(problemKeys.incident(id), `/incidents/${id}`);
}

interface WriteOptions<TVariables, TResult> {
  path: string | ((variables: TVariables) => string);
  body?: (variables: TVariables) => unknown;
  method?: 'POST' | 'PATCH';
  onDone?: (result: TResult) => void;
}

/**
 * One write on a problem — or on its RCA, which answers with the whole problem too.
 *
 * Every route here answers with the problem, closure decision and all, so the refetch the
 * invalidation triggers is what moves the Close button and the sentence under it together.
 */
export function useProblemWrite<TVariables = void>(
  options: WriteOptions<TVariables, ProblemDetail>,
): ApiMutation<TVariables, ProblemDetail> {
  return useApiMutation<TVariables, ProblemDetail>({
    path: options.path,
    method: options.method ?? 'POST',
    ...(options.body ? { body: options.body } : {}),
    invalidate: PROBLEM_INVALIDATES,
    ...(options.onDone ? { onSuccess: options.onDone } : {}),
  });
}

/** One write on an incident. Publishing the client summary is one of them, never a side effect. */
export function useIncidentWrite<TVariables = void>(
  options: WriteOptions<TVariables, IncidentDetail>,
): ApiMutation<TVariables, IncidentDetail> {
  return useApiMutation<TVariables, IncidentDetail>({
    path: options.path,
    method: options.method ?? 'POST',
    ...(options.body ? { body: options.body } : {}),
    invalidate: PROBLEM_INVALIDATES,
    ...(options.onDone ? { onSuccess: options.onDone } : {}),
  });
}
