/**
 * Global search: `GET /search`.
 *
 * The endpoint is a fan-out over the list endpoints that already exist, not a new query surface.
 * Each group in the response is produced by one module's own list service, called with the same
 * search term the module's own list endpoint accepts, so a group can never hold a row that
 * module's list would refuse the same caller.
 */

/** The entity kinds a person can find from the search box. */
export const SEARCH_ENTITY_TYPE = {
  TASK: 'task',
  TICKET: 'ticket',
  PROJECT: 'project',
  CONTRACT: 'contract',
  INVOICE: 'invoice',
  CHANGE_REQUEST: 'change-request',
  PROBLEM: 'problem',
  INCIDENT: 'incident',
  APPROVAL: 'approval',
  RELEASE: 'release',
  USER: 'user',
} as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPE)[keyof typeof SEARCH_ENTITY_TYPE];

export const SEARCH_ENTITY_TYPES: readonly SearchEntityType[] = Object.values(SEARCH_ENTITY_TYPE);

/** Heading shown above a group, in the order the response returns them. */
export const SEARCH_ENTITY_LABELS: Record<SearchEntityType, string> = {
  task: 'Tasks',
  ticket: 'Tickets',
  project: 'Projects',
  contract: 'Contracts',
  invoice: 'Invoices',
  'change-request': 'Change requests',
  problem: 'Problems',
  incident: 'Incidents',
  approval: 'Approvals',
  release: 'Releases',
  user: 'People',
};

/**
 * Shortest term the endpoint accepts.
 *
 * Three characters is not a taste decision. Every module compiles `search` to `ILIKE '%term%'`,
 * and the trigram indexes that make those queries indexable cannot serve a pattern with fewer
 * than three characters — below the floor PostgreSQL goes back to reading the whole table. A
 * two-letter global search is therefore thirteen sequential scans per keystroke.
 */
export const SEARCH_MIN_QUERY_LENGTH = 3;

/** Longest term accepted, so a caller cannot send a megabyte of pattern to thirteen tables. */
export const SEARCH_MAX_QUERY_LENGTH = 100;

/** Rows per module in the quick results the topbar shows. */
export const SEARCH_DEFAULT_GROUP_LIMIT = 5;

/** Rows per module on the results page: the most any single module may return. */
export const SEARCH_MAX_GROUP_LIMIT = 20;

/**
 * Ceiling on the whole response, whatever the per-module limit multiplies out to.
 *
 * Groups are filled in the order of SEARCH_ENTITY_TYPES and the cap is applied as they are, so a
 * response is a prefix of the same list every time rather than an arbitrary subset.
 */
export const SEARCH_MAX_RESULTS = 100;

/** One match. Everything here is already visible to the caller on the module's own list screen. */
export interface SearchHit {
  type: SearchEntityType;
  id: string;
  /** Human-facing identifier: "ACM-14", "T-31", "CT-2026-0007". Null where the entity has none. */
  reference: string | null;
  title: string;
  /** One line of context — project, client, module. Never money, estimates or internal notes. */
  subtitle: string | null;
  /** The status as the caller's own list screen shows it (client-visible statuses for clients). */
  status: string | null;
  /** Where the caller's own app opens it: an internal route, or a portal one for a client. */
  href: string;
}

export interface SearchGroup {
  type: SearchEntityType;
  label: string;
  hits: SearchHit[];
  /** True when the module matched more rows than the limit returned. */
  hasMore: boolean;
}

export interface SearchResponse {
  /** The trimmed term that was actually run. */
  query: string;
  groups: SearchGroup[];
  /** Hits returned, summed over the groups. */
  total: number;
  /** True when the overall cap cut the response short. */
  truncated: boolean;
}
