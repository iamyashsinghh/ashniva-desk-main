import type { SessionLogResponse } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface SessionLogParams {
  userId?: string;
  from?: string;
  to?: string;
}

export function useSessionLogsQuery(params: SessionLogParams) {
  return useQuery({
    queryKey: ['session-logs', params],
    queryFn: () =>
      apiRequest<SessionLogResponse>('/session-logs', {
        query: {
          userId: params.userId,
          from: params.from,
          to: params.to,
        },
      }),
  });
}
