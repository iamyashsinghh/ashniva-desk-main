import type {
  AvailabilityStatus,
  AvailabilitySummary,
  OnCallEntrySummary,
  ProjectSupportConfig,
  SupportOwnershipSummary,
  WorkScheduleSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export interface SupportOwnershipInput {
  primaryDeveloperId?: string | null;
  backupDeveloperId?: string | null;
  seniorId?: string | null;
  testerId?: string | null;
  supportExecutiveId?: string | null;
  moduleOwners?: Record<string, string>;
  workloadLimit?: number | null;
  ackMinutes?: number;
  escalationMinutes?: number;
  directTypes?: string[];
  autoRouteEnabled?: boolean;
  fallbackUserId?: string | null;
}

export interface WorkScheduleInput {
  workingDays: number[];
  startTime: string;
  endTime: string;
  timezone?: string;
  workloadLimit?: number | null;
}

export interface AvailabilityInput {
  status: AvailabilityStatus;
  until?: string | null;
  note?: string | null;
}

export interface OnCallInput {
  onDate: string;
  userId: string;
  backupUserId?: string | null;
  note?: string | null;
}

export const supportRoutingKeys = {
  all: ['support-routing'] as const,
  config: (projectId: string) => ['support-routing', 'config', projectId] as const,
  mySchedule: ['support-routing', 'my-schedule'] as const,
};

export function useSupportConfigQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: supportRoutingKeys.config(projectId ?? ''),
    queryFn: () => apiRequest<ProjectSupportConfig>(`/projects/${projectId}/support-config`),
    enabled: enabled && Boolean(projectId),
  });
}

/**
 * Your own working week.
 *
 * A separate endpoint rather than a filter on the configuration screen: a developer holds no
 * support-routing permission, and reading their own shift must not be a way to reach the team's.
 */
export function useMyWorkScheduleQuery(enabled = true) {
  return useQuery({
    queryKey: supportRoutingKeys.mySchedule,
    queryFn: () => apiRequest<WorkScheduleSummary | null>('/me/work-schedule'),
    enabled,
  });
}

export function useSupportRoutingMutations(projectId: string | undefined) {
  const client = useQueryClient();
  // Every write changes what the team table shows — a rota moves somebody in or out of hours —
  // so the whole configuration is refetched rather than patched field by field.
  const refresh = () => client.invalidateQueries({ queryKey: supportRoutingKeys.all });

  return {
    saveOwnership: useMutation({
      mutationFn: (input: SupportOwnershipInput) =>
        apiRequest<SupportOwnershipSummary>(`/projects/${projectId}/support-ownership`, {
          method: 'PUT',
          body: input,
        }),
      onSuccess: refresh,
    }),
    saveSchedule: useMutation({
      mutationFn: ({ userId, input }: { userId: string; input: WorkScheduleInput }) =>
        apiRequest<WorkScheduleSummary>(`/users/${userId}/work-schedule`, {
          method: 'PUT',
          body: input,
        }),
      onSuccess: refresh,
    }),
    setAvailability: useMutation({
      mutationFn: ({ userId, input }: { userId: string; input: AvailabilityInput }) =>
        apiRequest<AvailabilitySummary>(`/users/${userId}/availability`, {
          method: 'PATCH',
          body: input,
        }),
      onSuccess: refresh,
    }),
    setOnCall: useMutation({
      mutationFn: (input: OnCallInput) =>
        apiRequest<OnCallEntrySummary>(`/projects/${projectId}/on-call`, {
          method: 'PUT',
          body: input,
        }),
      onSuccess: refresh,
    }),
    clearOnCall: useMutation({
      mutationFn: (onDate: string) =>
        apiRequest<void>(`/projects/${projectId}/on-call/${onDate}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
