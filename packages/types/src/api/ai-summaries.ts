// ---------------------------------------------------------------------------------------------
// AI-generated progress summaries
//
// Nothing here names an AI company. The provider is configuration; the domain is "a summary that
// was generated, reviewed by a person, and only then shown to anyone outside the team".
//
// The internal and client shapes are separate interfaces rather than one shape with optional
// fields, for the same reason as release notes: a mapper cannot leak a field that the type it is
// building does not have.
// ---------------------------------------------------------------------------------------------

/** What the summary is about. Decides which sources are read and which prompt is used. */
export const AI_SUMMARY_TYPE = {
  DEVELOPER_DAILY: 'DEVELOPER_DAILY',
  LEAD_DAILY: 'LEAD_DAILY',
  PROJECT_PROGRESS: 'PROJECT_PROGRESS',
  CLIENT_WEEKLY: 'CLIENT_WEEKLY',
  RELEASE_NOTE_DRAFT: 'RELEASE_NOTE_DRAFT',
  TICKET_RESOLUTION: 'TICKET_RESOLUTION',
} as const;

export type AiSummaryType = (typeof AI_SUMMARY_TYPE)[keyof typeof AI_SUMMARY_TYPE];

export const AI_SUMMARY_TYPE_LABELS: Record<AiSummaryType, string> = {
  DEVELOPER_DAILY: 'Developer daily summary',
  LEAD_DAILY: 'Team lead daily summary',
  PROJECT_PROGRESS: 'Project progress summary',
  CLIENT_WEEKLY: 'Weekly client summary',
  RELEASE_NOTE_DRAFT: 'Release note draft',
  TICKET_RESOLUTION: 'Ticket resolution summary',
};

/**
 * The types whose output may ever reach a client.
 *
 * A developer's daily summary is an internal document. It is not "a client summary that happens
 * to be unpublished" — publishing it is not an action the workflow offers at all.
 */
export const CLIENT_FACING_SUMMARY_TYPES: readonly AiSummaryType[] = [
  'CLIENT_WEEKLY',
  'PROJECT_PROGRESS',
  'RELEASE_NOTE_DRAFT',
];

export function isClientFacingSummary(type: AiSummaryType): boolean {
  return CLIENT_FACING_SUMMARY_TYPES.includes(type);
}

export const AI_SUMMARY_STATUS = {
  DRAFT: 'DRAFT',
  GENERATING: 'GENERATING',
  GENERATION_FAILED: 'GENERATION_FAILED',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type AiSummaryStatus = (typeof AI_SUMMARY_STATUS)[keyof typeof AI_SUMMARY_STATUS];

export const AI_SUMMARY_STATUS_LABELS: Record<AiSummaryStatus, string> = {
  DRAFT: 'Draft',
  GENERATING: 'Generating',
  GENERATION_FAILED: 'Generation failed',
  IN_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
};

/**
 * The transitions the API allows.
 *
 * `GENERATING` is a real state rather than a flag, because a run that dies leaves a row that has
 * to be recoverable: `GENERATION_FAILED` is reachable from it, and returns to `DRAFT` on a retry.
 */
export const AI_SUMMARY_TRANSITIONS: Record<AiSummaryStatus, readonly AiSummaryStatus[]> = {
  DRAFT: ['GENERATING', 'IN_REVIEW', 'CANCELLED'],
  GENERATING: ['DRAFT', 'GENERATION_FAILED'],
  GENERATION_FAILED: ['GENERATING', 'DRAFT', 'CANCELLED'],
  IN_REVIEW: ['APPROVED', 'CHANGES_REQUESTED', 'CANCELLED'],
  CHANGES_REQUESTED: ['DRAFT', 'GENERATING', 'IN_REVIEW', 'CANCELLED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'CANCELLED'],
  PUBLISHED: [],
  CANCELLED: ['DRAFT'],
};

export function canTransitionAiSummary(from: AiSummaryStatus, to: AiSummaryStatus): boolean {
  return AI_SUMMARY_TRANSITIONS[from].includes(to);
}

/** Only a published summary is ever readable in the client portal. */
export const CLIENT_VISIBLE_AI_SUMMARY_STATUSES: readonly AiSummaryStatus[] = ['PUBLISHED'];

/** Where a fact in a summary came from. Only these record types may ever be read as a source. */
export const AI_SOURCE_KIND = {
  TASK: 'TASK',
  TASK_STATUS_CHANGE: 'TASK_STATUS_CHANGE',
  WORK_LOG: 'WORK_LOG',
  TICKET: 'TICKET',
  CLIENT_UPDATE: 'CLIENT_UPDATE',
  MILESTONE: 'MILESTONE',
  CODE_ACTIVITY: 'CODE_ACTIVITY',
  RELEASE_NOTE: 'RELEASE_NOTE',
} as const;

export type AiSourceKind = (typeof AI_SOURCE_KIND)[keyof typeof AI_SOURCE_KIND];

export const AI_SOURCE_KIND_LABELS: Record<AiSourceKind, string> = {
  TASK: 'Task',
  TASK_STATUS_CHANGE: 'Status change',
  WORK_LOG: 'Work log',
  TICKET: 'Ticket',
  CLIENT_UPDATE: 'Client update',
  MILESTONE: 'Milestone',
  CODE_ACTIVITY: 'Development activity',
  RELEASE_NOTE: 'Release note',
};

/** How a generation run ended. Anything other than SUCCEEDED leaves the summary editable. */
export const AI_GENERATION_STATUS = {
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NO_SOURCES: 'NO_SOURCES',
} as const;

export type AiGenerationStatus = (typeof AI_GENERATION_STATUS)[keyof typeof AI_GENERATION_STATUS];

export const AI_GENERATION_STATUS_LABELS: Record<AiGenerationStatus, string> = {
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  TIMED_OUT: 'Timed out',
  RATE_LIMITED: 'Rate limited',
  INVALID_RESPONSE: 'Unusable response',
  NO_SOURCES: 'Nothing to summarise',
};

export interface AiSummarySourceRef {
  id: string;
  kind: AiSourceKind;
  refId: string | null;
  label: string;
  occurredAt: string | null;
  clientVisible: boolean;
}

export interface AiSummaryVersionRef {
  id: string;
  version: number;
  status: AiSummaryStatus;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

export interface AiGenerationRunSummary {
  id: string;
  status: AiGenerationStatus;
  providerName: string;
  model: string | null;
  promptVersion: string;
  outputVersion: string;
  attempt: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AiSummaryListRow {
  id: string;
  type: AiSummaryType;
  status: AiSummaryStatus;
  title: string;
  projectId: string | null;
  projectCode: string | null;
  subjectUserId: string | null;
  subjectUserName: string | null;
  periodStart: string;
  periodEnd: string;
  sourceCount: number;
  version: number;
  generatedAt: string | null;
  updatedAt: string;
}

/**
 * The internal view.
 *
 * `internalContent` is what the team reads; `clientContent` is the text that would be published.
 * Both exist here because a reviewer has to see the two side by side to judge whether the client
 * version says anything it should not.
 */
export interface AiSummaryDetail extends AiSummaryListRow {
  clientOrganizationId: string | null;
  clientOrganizationName: string | null;
  ticketId: string | null;
  internalContent: string | null;
  clientContent: string | null;
  missingDataNote: string | null;
  reviewNote: string | null;
  cancelReason: string | null;
  isDraftOutput: boolean;
  providerName: string | null;
  model: string | null;
  promptVersion: string | null;
  outputVersion: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
  sources: AiSummarySourceRef[];
  versions: AiSummaryVersionRef[];
  runs: AiGenerationRunSummary[];
  createdAt: string;
}

/** One stored version's text, for reading back what an earlier draft said. */
export interface AiSummaryVersionDetail extends AiSummaryVersionRef {
  internalContent: string | null;
  clientContent: string | null;
}

/**
 * What a client sees. A separate interface with no internal content, no sources, no runs, no
 * review trail and no provider details — there is nothing here for a mapper to forget to strip.
 */
export interface PortalAiSummary {
  id: string;
  type: AiSummaryType;
  title: string;
  projectId: string | null;
  periodStart: string;
  periodEnd: string;
  content: string;
  publishedAt: string;
}

/** Token and call counts for a period, for the usage screen. */
export interface AiUsageTotals {
  from: string;
  to: string;
  runs: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  averageLatencyMs: number | null;
  byProvider: { providerName: string; runs: number; inputTokens: number; outputTokens: number }[];
}

/** Whether a provider is configured, without ever saying what its credential is. */
export interface AiProviderStatus {
  providerName: string;
  configured: boolean;
  model: string | null;
  promptVersion: string;
  outputVersion: string;
}
