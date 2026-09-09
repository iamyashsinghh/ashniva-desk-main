import {
  PERMISSIONS,
  SEARCH_ENTITY_TYPE,
  type AuthenticatedUser,
  type PermissionKey,
  type SearchEntityType,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';

/** Which app the source's rows belong to: the internal desk, or the client portal. */
export type SearchAudience = 'internal' | 'client';

/**
 * The gate on one source of search results.
 *
 * It is a copy of the decorators on the list route the source calls — `requires` mirrors
 * `@RequirePermissions`, `requiresAny` mirrors `@RequireAnyPermission` — and
 * `search-gates.spec.ts` reads the real routes' Nest metadata and fails if the two ever differ.
 * That is what stops search from becoming a second, looser authorization path: the gate cannot be
 * widened here without the spec noticing, and the rows themselves come from the list service the
 * route calls, not from a query written in this module.
 */
export interface SearchGate {
  type: SearchEntityType;
  audience: SearchAudience;
  /** Every one of these is required, exactly as `@RequirePermissions(...)` requires them. */
  requires?: readonly PermissionKey[];
  /** At least one of these, exactly as `@RequireAnyPermission(...)` requires one. */
  requiresAny?: readonly PermissionKey[];
}

/**
 * What each audience may search.
 *
 * **Internal staff** search the eleven modules whose list screens they already have.
 *
 * **Clients** search their tickets and their change requests, and nothing else. Those are the two
 * modules whose list *services* already take a client actor end to end — `TicketsService.list`
 * pins `clientOrganizationId` to the caller's own organization whatever the query says, and
 * `ChangeRequestsService.list` does the same and hides other people's drafts — and whose portal
 * controllers project the result through the portal allow-list mappers. A client's portal
 * projects, invoices and updates are read by portal-only queries that have never carried a
 * `search` term; giving them one would mean writing a new query shape for search alone, which is
 * exactly the second authorization path this file exists to prevent. They stay out until their
 * own list endpoints can search.
 *
 * Contracts and invoices are internal-only here for a second reason as well: both match on the
 * *client organization's name*, so a client-reachable version of either would answer "which of
 * your competitors is a customer of this company" one letter at a time.
 */
export const SEARCH_GATES: readonly SearchGate[] = [
  {
    type: SEARCH_ENTITY_TYPE.TASK,
    audience: 'internal',
    requires: [PERMISSIONS.TASK_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.TICKET,
    audience: 'internal',
    requires: [PERMISSIONS.TICKET_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.TICKET,
    audience: 'client',
    requires: [PERMISSIONS.TICKET_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.PROJECT,
    audience: 'internal',
    requires: [PERMISSIONS.PROJECT_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.CONTRACT,
    audience: 'internal',
    requires: [PERMISSIONS.CONTRACT_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.INVOICE,
    audience: 'internal',
    requires: [PERMISSIONS.INVOICE_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.CHANGE_REQUEST,
    audience: 'internal',
    requires: [PERMISSIONS.CHANGE_REQUEST_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.CHANGE_REQUEST,
    audience: 'client',
    requires: [PERMISSIONS.CHANGE_REQUEST_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.PROBLEM,
    audience: 'internal',
    requires: [PERMISSIONS.PROBLEM_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.INCIDENT,
    audience: 'internal',
    requires: [PERMISSIONS.INCIDENT_READ],
  },
  {
    type: SEARCH_ENTITY_TYPE.APPROVAL,
    audience: 'internal',
    requiresAny: [PERMISSIONS.APPROVAL_MANAGE, PERMISSIONS.APPROVAL_DECIDE],
  },
  {
    type: SEARCH_ENTITY_TYPE.RELEASE,
    audience: 'internal',
    requires: [PERMISSIONS.RELEASE_MANAGE],
  },
  {
    type: SEARCH_ENTITY_TYPE.USER,
    audience: 'internal',
    requires: [PERMISSIONS.USER_MANAGE],
  },
];

/**
 * Whether this caller may be shown this source at all.
 *
 * The audience test comes first and is not a permission: a client holding `ticket:read` reaches
 * the portal source, never the internal one, because the two return different projections of the
 * same rows and only one of them is client-safe.
 */
export function allowsSource(actor: AuthenticatedUser, gate: SearchGate): boolean {
  const audience: SearchAudience = isInternalUser(actor) ? 'internal' : 'client';
  if (gate.audience !== audience) {
    return false;
  }
  const hasAllRequired = (gate.requires ?? []).every((permission) =>
    actor.permissions.includes(permission),
  );
  const hasOneAlternative =
    !gate.requiresAny?.length ||
    gate.requiresAny.some((permission) => actor.permissions.includes(permission));
  return hasAllRequired && hasOneAlternative;
}
