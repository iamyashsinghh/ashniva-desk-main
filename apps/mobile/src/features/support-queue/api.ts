import type {
  AvailabilityStatus,
  AvailabilitySummary,
  OnCallEntrySummary,
  ProjectSummary,
  ProjectSupportConfig,
  TicketRoutingDetail,
  UnassignedTicketSummary,
  WorkScheduleSummary,
} from '@ashniva/types';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';

/**
 * The support-routing endpoints the web's queue and routing cards use — no others.
 *
 * Keys follow the web's grouping so one invalidation reaches every view of the same record:
 * anything that changes a rota, an availability or on-call refetches the whole project
 * configuration, and anything that moves a ticket refetches the queue and every ticket read
 * (the ticket detail's routing card lives under `['tickets', id, 'routing']`).
 */

export const QUEUE_KEY = ['ticket-routing', 'queue'] as const;
const SUPPORT_ROUTING_KEY = ['support-routing'] as const;
const TICKETS_KEY = ['tickets'] as const;

const AFTER_ROUTING_CHANGE = [SUPPORT_ROUTING_KEY] as const;
const AFTER_TICKET_MOVE = [QUEUE_KEY, TICKETS_KEY] as const;

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

export function useSupportQueue(enabled: boolean) {
  return useResource<UnassignedTicketSummary[]>(QUEUE_KEY, '/tickets/queue/unassigned', {
    enabled,
  });
}

/** Active projects, as the web's configuration picker lists them. */
export function useActiveProjects(enabled: boolean) {
  return useResource<ProjectSummary[]>(['projects', { status: 'ACTIVE' }], '/projects', {
    enabled,
    query: { status: 'ACTIVE' },
  });
}

export function useSupportConfig(projectId: string | null, enabled: boolean) {
  return useResource<ProjectSupportConfig>(
    ['support-routing', 'config', projectId ?? ''],
    `/projects/${projectId ?? ''}/support-config`,
    { enabled: enabled && Boolean(projectId) },
  );
}

export function useTicketRouting(ticketId: string) {
  return useResource<TicketRoutingDetail>(
    ['tickets', ticketId, 'routing'],
    `/tickets/${ticketId}/routing`,
  );
}

export function useSaveSchedule(onSuccess: () => void) {
  return useApiMutation<{ userId: string; input: WorkScheduleInput }, WorkScheduleSummary>({
    path: ({ userId }) => `/users/${userId}/work-schedule`,
    method: 'PUT',
    body: ({ input }) => input,
    invalidate: AFTER_ROUTING_CHANGE,
    onSuccess,
  });
}

export function useSetAvailability(onSuccess: () => void) {
  return useApiMutation<{ userId: string; input: AvailabilityInput }, AvailabilitySummary>({
    path: ({ userId }) => `/users/${userId}/availability`,
    method: 'PATCH',
    body: ({ input }) => input,
    invalidate: AFTER_ROUTING_CHANGE,
    onSuccess,
  });
}

export function useSetOnCall(projectId: string, onSuccess: () => void) {
  return useApiMutation<OnCallInput, OnCallEntrySummary>({
    path: `/projects/${projectId}/on-call`,
    method: 'PUT',
    body: (input) => input,
    invalidate: AFTER_ROUTING_CHANGE,
    onSuccess,
  });
}

export function useClearOnCall(projectId: string) {
  return useApiMutation<string, void>({
    path: (onDate) => `/projects/${projectId}/on-call/${onDate}`,
    method: 'DELETE',
    invalidate: AFTER_ROUTING_CHANGE,
  });
}

export function useReassign(ticketId: string, onSuccess: () => void) {
  return useApiMutation<{ assignedToId: string; reason: string }, TicketRoutingDetail>({
    path: `/tickets/${ticketId}/reassign`,
    body: (input) => input,
    invalidate: AFTER_TICKET_MOVE,
    onSuccess,
  });
}

export function useReroute(ticketId: string) {
  return useApiMutation<boolean, TicketRoutingDetail>({
    path: `/tickets/${ticketId}/route`,
    body: (force) => ({ force }),
    invalidate: AFTER_TICKET_MOVE,
  });
}
