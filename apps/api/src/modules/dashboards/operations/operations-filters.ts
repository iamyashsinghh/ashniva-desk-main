import type { Prisma } from '../../../generated/prisma/client';
import type { ResolvedOperationsScope } from './operations-scope';

/**
 * The two narrowings every operational query applies, built once per request.
 *
 * `people` narrows by assignee and answers "what are my people doing", which is what Today and
 * Time ask. `tickets` narrows the support desk by project. Both are `{}` for an organization-wide
 * caller — an *absent* filter, never an empty `in` list, which would silently select nothing.
 *
 * There is deliberately **no** task-level project filter here. There was one, unused, and it
 * asserted something untrue: Today and Time are narrowed by assignee, so a lead's counts include
 * their people's work on projects the lead is not a member of. That is the intended reading of
 * "my team's day" — but a field named `projects` sitting unused next to it said the opposite to
 * anybody reading the file.
 */
export interface OperationsFilters {
  people: Prisma.TaskWhereInput;
  tickets: Prisma.TicketWhereInput;
  /** The scope's project ids, for the tables that are only ever reached through a project. */
  projectIds: string[];
  /** True when the scope covers the whole organization rather than a named set of projects. */
  organizationWide: boolean;
}

export function operationsFilters(resolved: ResolvedOperationsScope): OperationsFilters {
  const { memberIds, scope } = resolved;
  const organizationWide = memberIds === undefined;
  return {
    people: memberIds ? { assignedToId: { in: memberIds } } : {},
    tickets: organizationWide ? {} : { projectId: { in: scope.projectIds } },
    projectIds: scope.projectIds,
    organizationWide,
  };
}
