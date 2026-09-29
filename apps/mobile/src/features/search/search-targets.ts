import { SEARCH_ENTITY_TYPE, type SearchEntityType, type SearchHit } from '@ashniva/types';
import type { NavigationProp } from '@react-navigation/native';

import type { IconName, IconTone } from '../../shared/components/Icon';
import type { RootStackParamList } from '../../navigation/param-lists';

/**
 * Where a search result opens on the phone.
 *
 * The API writes each hit's `href` as a web route. Rather than parse that path, the phone maps the
 * hit's *type* to its own detail route: the type is part of the contract, a path is a web detail
 * that could be reshaped without anybody thinking of the app.
 *
 * Two types exist twice, once per audience, because the internal and portal detail screens read
 * different endpoints. The API has already chosen the audience — a client only ever gets portal
 * rows — so the choice here only has to agree with it.
 */

type DetailRoute = {
  [K in keyof RootStackParamList]: RootStackParamList[K] extends { id: string } ? K : never;
}[keyof RootStackParamList];

export interface SearchTarget {
  screen: DetailRoute;
  id: string;
}

const INTERNAL_ROUTES: Record<SearchEntityType, DetailRoute> = {
  [SEARCH_ENTITY_TYPE.TASK]: 'TaskDetail',
  [SEARCH_ENTITY_TYPE.TICKET]: 'TicketDetail',
  [SEARCH_ENTITY_TYPE.PROJECT]: 'ProjectDetail',
  [SEARCH_ENTITY_TYPE.CONTRACT]: 'ContractDetail',
  [SEARCH_ENTITY_TYPE.INVOICE]: 'BillingInvoiceDetail',
  [SEARCH_ENTITY_TYPE.CHANGE_REQUEST]: 'ChangeRequestDetail',
  [SEARCH_ENTITY_TYPE.PROBLEM]: 'ProblemDetail',
  [SEARCH_ENTITY_TYPE.INCIDENT]: 'IncidentDetail',
  [SEARCH_ENTITY_TYPE.APPROVAL]: 'ApprovalDetail',
  [SEARCH_ENTITY_TYPE.RELEASE]: 'ReleaseDetail',
  [SEARCH_ENTITY_TYPE.USER]: 'AdminUserDetail',
};

/**
 * What a client can be shown: their tickets and their change requests, and nothing else — the
 * API's own `SEARCH_GATES`. `TicketDetail` serves both audiences; it reads the portal endpoint
 * for a client. Anything else arriving for a client has no portal screen and stays untappable.
 */
const CLIENT_ROUTES: Partial<Record<SearchEntityType, DetailRoute>> = {
  [SEARCH_ENTITY_TYPE.TICKET]: 'TicketDetail',
  [SEARCH_ENTITY_TYPE.CHANGE_REQUEST]: 'PortalChangeRequestDetail',
};

/** Null for a type this app does not know yet: the row is still shown, just not tappable. */
export function targetForHit(hit: SearchHit, client: boolean): SearchTarget | null {
  const routes: Partial<Record<string, DetailRoute>> = client ? CLIENT_ROUTES : INTERNAL_ROUTES;
  const screen = routes[hit.type];
  return screen ? { screen, id: hit.id } : null;
}

/**
 * `navigate` for a detail route. The cast is only about the compiler: TypeScript does not match a
 * union of route names against `navigate`'s overloads, and every name `DetailRoute` admits is
 * typed as taking exactly `{ id }`.
 */
export function openSearchTarget(
  navigation: NavigationProp<RootStackParamList>,
  target: SearchTarget,
): void {
  (
    navigation.navigate as (
      this: NavigationProp<RootStackParamList>,
      name: DetailRoute,
      params: { id: string },
    ) => void
  ).call(navigation, target.screen, { id: target.id });
}

/** The picture beside each group, matching the side menu's icons for the same modules. */
export const SEARCH_TYPE_ICONS: Record<SearchEntityType, { icon: IconName; tone: IconTone }> = {
  [SEARCH_ENTITY_TYPE.TASK]: { icon: 'checkbox-outline', tone: 'primary' },
  [SEARCH_ENTITY_TYPE.TICKET]: { icon: 'ticket-outline', tone: 'info' },
  [SEARCH_ENTITY_TYPE.PROJECT]: { icon: 'folder-open-outline', tone: 'teal' },
  [SEARCH_ENTITY_TYPE.CONTRACT]: { icon: 'document-text-outline', tone: 'violet' },
  [SEARCH_ENTITY_TYPE.INVOICE]: { icon: 'receipt-outline', tone: 'success' },
  [SEARCH_ENTITY_TYPE.CHANGE_REQUEST]: { icon: 'git-pull-request-outline', tone: 'orange' },
  [SEARCH_ENTITY_TYPE.PROBLEM]: { icon: 'bug-outline', tone: 'danger' },
  [SEARCH_ENTITY_TYPE.INCIDENT]: { icon: 'flame-outline', tone: 'warning' },
  [SEARCH_ENTITY_TYPE.APPROVAL]: { icon: 'checkmark-done-outline', tone: 'success' },
  [SEARCH_ENTITY_TYPE.RELEASE]: { icon: 'rocket-outline', tone: 'pink' },
  [SEARCH_ENTITY_TYPE.USER]: { icon: 'people-outline', tone: 'neutral' },
};

const FALLBACK_ICON = { icon: 'search-outline', tone: 'neutral' } as const;

export function iconForType(type: string): { icon: IconName; tone: IconTone } {
  return (
    (SEARCH_TYPE_ICONS as Partial<Record<string, { icon: IconName; tone: IconTone }>>)[type] ??
    FALLBACK_ICON
  );
}

/** `IN_PROGRESS` → "In progress". Statuses differ per module; the API sends the raw value. */
export function statusLabel(status: string): string {
  const words = status.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
