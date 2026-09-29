import {
  TICKET_LIST_VIEW,
  type PaginatedResponse,
  type ReleaseSummary,
  type TaskSummary,
  type TicketSummary,
} from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../../shared/api/queries';
import type { SelectOption } from '../../../shared/components/SelectSheet';

/**
 * The tickets, tasks and releases a problem or incident can point at.
 *
 * They come from the ordinary `/tickets`, `/tasks` and `/releases` reads narrowed to the record's
 * project, exactly as the web's dialogs do — there is no picker endpoint of its own. The server
 * checks every id belongs to this organization whatever is sent. Each list is only fetched while
 * the sheet asking for it is open.
 */

const PICKER_LIMIT = 50;

interface PickerQuery {
  projectId?: string | null | undefined;
  search?: string;
  enabled: boolean;
}

function params({ projectId, search }: PickerQuery) {
  return {
    ...(projectId ? { projectId } : {}),
    ...(search ? { search } : {}),
    limit: PICKER_LIMIT,
  };
}

export function useTicketOptions(query: PickerQuery) {
  const request = { view: TICKET_LIST_VIEW.ALL, ...params(query) };
  const result = useResource<PaginatedResponse<TicketSummary>>(
    ['tickets', 'picker', request],
    '/tickets',
    { query: request, enabled: query.enabled },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (result.data?.items ?? []).map((ticket) => ({
        value: ticket.id,
        label: `${ticket.key} · ${ticket.title}`,
        description: ticket.clientOrganization.name,
        icon: 'ticket-outline',
        iconTone: 'orange',
      })),
    [result.data],
  );
  return { options, isLoading: result.isLoading };
}

export function useTaskOptions(query: PickerQuery) {
  const request = params(query);
  const result = useResource<PaginatedResponse<TaskSummary>>(
    ['tasks', 'picker', request],
    '/tasks',
    { query: request, enabled: query.enabled },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (result.data?.items ?? []).map((task) => ({
        value: task.id,
        label: `${task.key} · ${task.title}`,
        description: task.project.name,
        icon: 'checkbox-outline',
        iconTone: 'info',
      })),
    [result.data],
  );
  return { options, isLoading: result.isLoading };
}

export function useReleaseOptions(query: PickerQuery) {
  const request = params(query);
  const result = useResource<PaginatedResponse<ReleaseSummary>>(
    ['releases', 'picker', request],
    '/releases',
    { query: request, enabled: query.enabled },
  );
  const options = useMemo<SelectOption[]>(
    () =>
      (result.data?.items ?? []).map((release) => ({
        value: release.id,
        label: `${release.version} · ${release.title}`,
        description: release.projectName,
        icon: 'rocket-outline',
        iconTone: 'violet',
      })),
    [result.data],
  );
  return { options, isLoading: result.isLoading };
}
