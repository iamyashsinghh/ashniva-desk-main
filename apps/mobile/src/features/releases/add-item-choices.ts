import {
  RELEASE_ITEM_KIND,
  type ChangeRequestSummary,
  type PaginatedResponse,
  type ReleaseDetail,
  type ReleaseItemKind,
  type TaskSummary,
  type TicketSummary,
} from '@ashniva/types';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';

export interface ItemChoice {
  id: string;
  reference: string;
  title: string;
}

/**
 * The work that can still be added: everything on the release's project of the chosen kind, less
 * what is already in it. The API scopes the lookup to the project as well — a release must not be
 * made to carry another client's work — so this only saves the operator a refusal. Only the chosen
 * kind is fetched.
 */
export function useItemChoices(
  kind: ReleaseItemKind,
  release: ReleaseDetail,
): { loading: boolean; error: string | null; choices: ItemChoice[] } {
  const query = { projectId: release.projectId, limit: 100 };
  const tasks = useResource<PaginatedResponse<TaskSummary>>(['tasks', 'list', query], '/tasks', {
    query,
    enabled: kind === RELEASE_ITEM_KIND.TASK,
  });
  const tickets = useResource<PaginatedResponse<TicketSummary>>(
    ['tickets', 'list', query],
    '/tickets',
    { query, enabled: kind === RELEASE_ITEM_KIND.TICKET },
  );
  const changes = useResource<PaginatedResponse<ChangeRequestSummary>>(
    ['change-requests', 'list', query],
    '/change-requests',
    { query, enabled: kind === RELEASE_ITEM_KIND.CHANGE_REQUEST },
  );

  const taken = new Set(
    release.items.map((item) => item.taskId ?? item.ticketId ?? item.changeRequestId),
  );
  const keep = (choice: ItemChoice) => !taken.has(choice.id);

  if (kind === RELEASE_ITEM_KIND.TASK) {
    return {
      loading: tasks.isLoading,
      error: tasks.error ? errorMessage(tasks.error) : null,
      choices: (tasks.data?.items ?? [])
        .map((task) => ({ id: task.id, reference: task.key, title: task.title }))
        .filter(keep),
    };
  }
  if (kind === RELEASE_ITEM_KIND.TICKET) {
    return {
      loading: tickets.isLoading,
      error: tickets.error ? errorMessage(tickets.error) : null,
      choices: (tickets.data?.items ?? [])
        .map((ticket) => ({ id: ticket.id, reference: ticket.key, title: ticket.title }))
        .filter(keep),
    };
  }
  return {
    loading: changes.isLoading,
    error: changes.error ? errorMessage(changes.error) : null,
    choices: (changes.data?.items ?? [])
      .map((change) => ({ id: change.id, reference: change.number, title: change.title }))
      .filter(keep),
  };
}

export function itemBody(kind: ReleaseItemKind, id: string) {
  if (kind === RELEASE_ITEM_KIND.TASK) {
    return { kind, taskId: id };
  }
  return kind === RELEASE_ITEM_KIND.TICKET ? { kind, ticketId: id } : { kind, changeRequestId: id };
}
