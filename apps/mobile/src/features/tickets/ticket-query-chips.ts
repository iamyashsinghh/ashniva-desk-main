import {
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  type OrganizationRef,
  type ProjectRef,
  type UserRef,
} from '@ashniva/types';

import { TICKET_VIEW_LABELS } from './ticket-views';

/** What a list row carries that can name a filter's id. Both ticket shapes satisfy it. */
export interface NamedRefs {
  project: ProjectRef | null;
  assignedTo?: UserRef | null;
  clientOrganization?: OrganizationRef;
}

export interface QueryChip {
  key: string;
  label: string;
}

function labelOf<T extends string>(labels: Record<T, string>, value: string): string {
  return value in labels ? labels[value as T] : value;
}

/**
 * The filters a dashboard tile put on a list, as chips a person can read.
 *
 * The query arrives as ids — a project, an assignee, a company — and the screen has no second
 * request to spend on turning them into names. The rows already returned name them, so a chip
 * borrows the name from the first row that matches, and says "One project" when none does.
 */
export function queryChips(
  query: Readonly<Record<string, string>>,
  rows: readonly NamedRefs[],
): QueryChip[] {
  const chips: QueryChip[] = [];
  const add = (key: string, label: string) => chips.push({ key, label });

  if (query.view) {
    add('view', labelOf(TICKET_VIEW_LABELS, query.view));
  }
  if (query.status) {
    const statuses = query.status.split(',').filter(Boolean);
    add('status', statuses.map((status) => labelOf(TICKET_STATUS_LABELS, status)).join(', '));
  }
  if (query.priority) {
    add('priority', `${labelOf(PRIORITY_LABELS, query.priority)} priority`);
  }
  if (query.type) {
    add('type', labelOf(TICKET_TYPE_LABELS, query.type));
  }
  if (query.projectId) {
    const project = rows.find((row) => row.project?.id === query.projectId)?.project;
    add('projectId', project?.name ?? 'One project');
  }
  if (query.assignedToId) {
    const person = rows.find((row) => row.assignedTo?.id === query.assignedToId)?.assignedTo;
    add('assignedToId', person ? `Assigned to ${person.name}` : 'One assignee');
  }
  if (query.clientOrganizationId) {
    const company = rows.find(
      (row) => row.clientOrganization?.id === query.clientOrganizationId,
    )?.clientOrganization;
    add('clientOrganizationId', company?.name ?? 'One company');
  }
  if (query.resolvedToday === 'true') {
    add('resolvedToday', 'Resolved today');
  }
  if (query.search) {
    add('search', `“${query.search}”`);
  }
  return chips;
}
