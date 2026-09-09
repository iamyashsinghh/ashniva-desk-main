import { healthResponseSchema, type HealthResponse } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { ApiError, apiRequest } from '../../shared/lib/api-client';

export const healthQueryKey = ['system', 'health'] as const;

/** The health endpoint answers 503 with the same body when a component is down; keep that body. */
export async function fetchHealth(): Promise<HealthResponse> {
  try {
    return healthResponseSchema.parse(await apiRequest<unknown>('/health'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      const parsed = healthResponseSchema.safeParse(error.rawBody);
      if (parsed.success) {
        return parsed.data;
      }
    }
    throw error;
  }
}

export function useHealthQuery() {
  return useQuery({ queryKey: healthQueryKey, queryFn: fetchHealth, refetchInterval: 30 * 1000 });
}
