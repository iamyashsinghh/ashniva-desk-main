// ---------------------------------------------------------------------------------------------
// Integrations — the shared framework every Phase 3 provider sits behind.
//
// Nothing here carries a credential. Tokens, webhook secrets and provider passwords live
// encrypted in the database and never appear in an API response; the client only ever learns
// whether a connection is configured and how its last sync went.
// ---------------------------------------------------------------------------------------------

export const INTEGRATION_PROVIDER = {
  GITHUB: 'GITHUB',
  GITLAB: 'GITLAB',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  AI: 'AI',
  /**
   * Ashniva IVR.
   *
   * An IVR account is an integration connection like any other: encrypted credentials, an enable
   * switch, an external account id that attributes an unauthenticated delivery to a tenant, and
   * the idempotency index on integration events. A parallel table for telephony would be a second
   * copy of all four to keep right.
   */
  IVR: 'IVR',
  /**
   * Ashniva Theme Manager.
   *
   * A separate product that publishes design tokens. It is a connection like any other for the
   * same reasons the IVR one is: encrypted credentials, an enable switch, a base URL in
   * non-secret settings, and a webhook secret already sitting there for the day the direction is
   * decided to be push rather than pull. See `docs/theme-manager-integration.md` — the vendor
   * half of that contract does not exist yet, and nothing here guesses at it.
   */
  THEME_MANAGER: 'THEME_MANAGER',
} as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDER)[keyof typeof INTEGRATION_PROVIDER];

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  GITHUB: 'GitHub',
  GITLAB: 'GitLab',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  AI: 'AI provider',
  IVR: 'IVR and support calls',
  THEME_MANAGER: 'Theme Manager',
};

export const INTEGRATION_STATUS = {
  /** No credentials stored yet. */
  DISCONNECTED: 'DISCONNECTED',
  /** Credentials stored and last validated successfully. */
  CONNECTED: 'CONNECTED',
  /** Stored credentials were rejected, or the last sync failed permanently. */
  ERROR: 'ERROR',
  /** The stored token passed its expiry and could not be refreshed. */
  EXPIRED: 'EXPIRED',
} as const;

export type IntegrationStatus = (typeof INTEGRATION_STATUS)[keyof typeof INTEGRATION_STATUS];

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  DISCONNECTED: 'Not connected',
  CONNECTED: 'Connected',
  ERROR: 'Needs attention',
  EXPIRED: 'Sign-in expired',
};

/** How the last synchronisation ended. */
export const SYNC_STATUS = {
  NEVER: 'NEVER',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

export interface IntegrationConnectionSummary {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  enabled: boolean;
  /** What to call this connection in the UI, e.g. the GitHub organization name. */
  displayName: string | null;
  /** True when credentials are stored. The credentials themselves are never returned. */
  hasCredentials: boolean;
  /** Null when the provider issues non-expiring credentials. */
  credentialsExpireAt: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  /** Already redacted server-side; safe to show to an administrator. */
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  /** True when a webhook endpoint is registered for this connection. */
  webhookConfigured: boolean;
  updatedAt: string;
}

export interface IntegrationConnectionDetail extends IntegrationConnectionSummary {
  /** Non-secret provider settings only (base URL, default branch policy, …). */
  settings: Record<string, string | number | boolean | null>;
  externalAccountId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------------------------

export const INTEGRATION_EVENT_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  /** Seen before — the unique (provider, externalEventId) constraint caught it. */
  DUPLICATE: 'DUPLICATE',
  /** Signature verification failed; nothing was processed. */
  REJECTED: 'REJECTED',
} as const;

export type IntegrationEventStatus =
  (typeof INTEGRATION_EVENT_STATUS)[keyof typeof INTEGRATION_EVENT_STATUS];

/**
 * An inbound webhook, as an administrator may see it. The payload itself is never stored or
 * returned — only a digest, so a replay can be recognised without keeping customer data.
 */
export interface IntegrationEventSummary {
  id: string;
  provider: IntegrationProvider;
  eventType: string;
  status: IntegrationEventStatus;
  signatureVerified: boolean;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface ValidationResult {
  ok: boolean;
  /** Safe to show: no token, no signature, no personal data. */
  message: string;
  /** Provider account this connection resolves to, when the provider reports one. */
  accountLabel?: string;
  scopes?: string[];
}

// ---------------------------------------------------------------------------------------------
// Git integration
//
// Development activity is internal. None of these types has a client-portal counterpart, and no
// portal endpoint returns them: commit messages, branch names, PR titles and reviewer names stay
// inside the provider organization.
// ---------------------------------------------------------------------------------------------

export const CODE_ACTIVITY_KIND = {
  COMMIT: 'COMMIT',
  BRANCH_PUSH: 'BRANCH_PUSH',
  PULL_REQUEST: 'PULL_REQUEST',
  REVIEW: 'REVIEW',
  MERGE: 'MERGE',
  RELEASE: 'RELEASE',
  TAG: 'TAG',
} as const;

export type CodeActivityKind = (typeof CODE_ACTIVITY_KIND)[keyof typeof CODE_ACTIVITY_KIND];

export const CODE_ACTIVITY_KIND_LABELS: Record<CodeActivityKind, string> = {
  COMMIT: 'Commit',
  BRANCH_PUSH: 'Branch push',
  PULL_REQUEST: 'Pull request',
  REVIEW: 'Review',
  MERGE: 'Merged',
  RELEASE: 'Release',
  TAG: 'Tag',
};

export interface RepositoryLinkSummary {
  id: string;
  provider: IntegrationProvider;
  projectId: string;
  projectCode: string;
  externalRepoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  createdAt: string;
}

export interface CodeActivitySummary {
  id: string;
  kind: CodeActivityKind;
  externalId: string;
  title: string;
  authorName: string | null;
  url: string | null;
  branch: string | null;
  state: string | null;
  occurredAt: string;
  taskId: string | null;
}

// ---------------------------------------------------------------------------------------------
// Release notes
//
// The one Phase 3 artefact that crosses the internal/client boundary. `internalNotes` and the
// approval trail have no counterpart in the portal types below, by construction.
// ---------------------------------------------------------------------------------------------

export const RELEASE_NOTE_STATUS = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReleaseNoteStatus = (typeof RELEASE_NOTE_STATUS)[keyof typeof RELEASE_NOTE_STATUS];

export const RELEASE_NOTE_STATUS_LABELS: Record<ReleaseNoteStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
};

/** Only a published note is ever readable in the client portal. */
export const CLIENT_VISIBLE_RELEASE_NOTE_STATUSES: readonly ReleaseNoteStatus[] = ['PUBLISHED'];

export const RELEASE_NOTE_ITEM_KIND = {
  TASK: 'TASK',
  TICKET: 'TICKET',
  CLIENT_UPDATE: 'CLIENT_UPDATE',
  CODE_ACTIVITY: 'CODE_ACTIVITY',
  MANUAL: 'MANUAL',
} as const;

export type ReleaseNoteItemKind =
  (typeof RELEASE_NOTE_ITEM_KIND)[keyof typeof RELEASE_NOTE_ITEM_KIND];

export const RELEASE_NOTE_ITEM_KIND_LABELS: Record<ReleaseNoteItemKind, string> = {
  TASK: 'Task',
  TICKET: 'Ticket',
  CLIENT_UPDATE: 'Client update',
  CODE_ACTIVITY: 'Development',
  MANUAL: 'Added manually',
};

/**
 * The transitions the API allows. Anything not listed is refused by the service, so a client of
 * the API cannot move a note sideways into a state the workflow does not have an edge to.
 */
export const RELEASE_NOTE_TRANSITIONS: Record<ReleaseNoteStatus, readonly ReleaseNoteStatus[]> = {
  DRAFT: ['IN_REVIEW', 'CANCELLED'],
  IN_REVIEW: ['APPROVED', 'CHANGES_REQUESTED', 'CANCELLED'],
  CHANGES_REQUESTED: ['DRAFT', 'IN_REVIEW', 'CANCELLED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'CANCELLED'],
  PUBLISHED: [],
  CANCELLED: ['DRAFT'],
};

export function canTransitionReleaseNote(from: ReleaseNoteStatus, to: ReleaseNoteStatus): boolean {
  return RELEASE_NOTE_TRANSITIONS[from].includes(to);
}

export interface ReleaseNoteItemSummary {
  id: string;
  kind: ReleaseNoteItemKind;
  source: 'GENERATED' | 'MANUAL';
  refId: string | null;
  externalRef: string | null;
  label: string;
  clientLabel: string | null;
  clientVisible: boolean;
  sortOrder: number;
}

export interface ReleaseNoteSummary {
  id: string;
  projectId: string;
  projectCode: string;
  clientOrganizationId: string;
  version: string;
  releaseDate: string;
  status: ReleaseNoteStatus;
  itemCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

/** Internal view. Carries `internalNotes` and the approval trail; never sent to a client. */
export interface ReleaseNoteDetail extends ReleaseNoteSummary {
  periodStart: string | null;
  periodEnd: string | null;
  internalNotes: string | null;
  clientSummary: string | null;
  generatedAt: string | null;
  items: ReleaseNoteItemSummary[];
  history: ReleaseNoteHistoryEntry[];
  createdAt: string;
}

export interface ReleaseNoteHistoryEntry {
  id: string;
  fromStatus: ReleaseNoteStatus | null;
  toStatus: ReleaseNoteStatus;
  note: string | null;
  changedByName: string;
  createdAt: string;
}

/**
 * What the client portal receives. Deliberately a separate interface rather than a Partial of the
 * detail: there is no `internalNotes`, no history, and no non-client-visible item to omit, so a
 * mapper cannot leak one by forgetting a field.
 */
/** Row in the portal's release-note list. No status: everything listed is published. */
export interface PortalReleaseNoteSummary {
  id: string;
  projectId: string;
  version: string;
  releaseDate: string;
  publishedAt: string | null;
}

export interface PortalReleaseNote {
  id: string;
  projectId: string;
  version: string;
  releaseDate: string;
  summary: string | null;
  publishedAt: string;
  items: { label: string; kind: ReleaseNoteItemKind }[];
}
