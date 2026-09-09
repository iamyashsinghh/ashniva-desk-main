import type {
  CheckStatus,
  TestEnvironment,
  TestingAssignmentKind,
  TestingAssignmentStatus,
} from '../workflow/qa-status';

/**
 * Testing, test environments and test credentials.
 *
 * Two rules shape every type here. A test account's password never appears in a list or detail
 * response — only `reveal` returns it, once, against a live grant. And a UAT assignment is the
 * only kind a client may see, so nothing on the client-facing shapes carries a staging URL, a
 * pull request, a credential or another client's work.
 */

export const TESTER_VIEW = {
  MINE: 'mine',
  READY: 'ready',
  TODAY: 'today',
  FAILED: 'failed',
  RETEST: 'retest',
  PASSED_TODAY: 'passed_today',
  UAT: 'uat',
  LIVE: 'live',
  OVERDUE: 'overdue',
} as const;

export type TesterView = (typeof TESTER_VIEW)[keyof typeof TESTER_VIEW];

export const TEST_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type TestSeverity = (typeof TEST_SEVERITY)[keyof typeof TEST_SEVERITY];

export const CREDENTIAL_ROTATION_POLICY = {
  AFTER_TEST: 'AFTER_TEST',
  DAILY: 'DAILY',
  MANUAL: 'MANUAL',
} as const;

export type CredentialRotationPolicy =
  (typeof CREDENTIAL_ROTATION_POLICY)[keyof typeof CREDENTIAL_ROTATION_POLICY];

export const CREDENTIAL_ACTION = {
  GENERATE: 'GENERATE',
  REVEAL: 'REVEAL',
  ROTATE: 'ROTATE',
  REVOKE: 'REVOKE',
} as const;

export type CredentialAction = (typeof CREDENTIAL_ACTION)[keyof typeof CREDENTIAL_ACTION];

export const TEST_ENVIRONMENT_STATUS = {
  UP: 'UP',
  DOWN: 'DOWN',
  DEPLOYING: 'DEPLOYING',
  UNKNOWN: 'UNKNOWN',
} as const;

export type TestEnvironmentStatus =
  (typeof TEST_ENVIRONMENT_STATUS)[keyof typeof TEST_ENVIRONMENT_STATUS];

export interface TestingAssignmentSummary {
  id: string;
  kind: TestingAssignmentKind;
  status: TestingAssignmentStatus;
  environment: TestEnvironment;
  projectId: string;
  projectName: string;
  subjectLabel: string;
  taskId: string | null;
  ticketId: string | null;
  releaseId: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  dueAt: string | null;
  isOverdue: boolean;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

/** Everything a tester needs in order to start, without asking the developer. */
export interface TestingAssignmentDetail extends TestingAssignmentSummary {
  stagingUrl: string | null;
  whatDeveloped: string | null;
  whatToTest: string | null;
  acceptanceCriteria: string | null;
  developerNotes: string | null;
  browserDevice: string[];
  checksStatus: CheckStatus | null;
  clarificationQuestion: string | null;
  clarificationAnswer: string | null;
  assignedByName: string;
  /** The login to use, if one is attached. Never carries the password. */
  testAccount: TestAccountSummary | null;
  results: TestResultRow[];
  createdAt: string;
}

export interface TestResultRow {
  id: string;
  outcome: 'PASS' | 'FAIL';
  environment: TestEnvironment;
  whatTested: string;
  actualResult: string;
  failureDescription: string | null;
  severity: TestSeverity | null;
  browserDevice: string | null;
  commentForDeveloper: string | null;
  retestRequired: boolean;
  evidenceFileId: string | null;
  recordedByName: string;
  createdAt: string;
}

/** A test login as anyone but the revealer sees it: no secret, ever. */
export interface TestAccountSummary {
  id: string;
  projectId: string;
  environment: TestEnvironment;
  environmentId: string | null;
  label: string;
  username: string;
  notes: string | null;
  rotationPolicy: CredentialRotationPolicy;
  isActive: boolean;
  rotatedAt: string | null;
  /** Whether the caller currently holds a live grant for this account. */
  hasActiveGrant: boolean;
  createdAt: string;
}

export interface CredentialGrantSummary {
  id: string;
  testAccountId: string;
  testAccountLabel: string;
  grantedToUserId: string;
  grantedToName: string;
  grantedByName: string;
  assignmentId: string | null;
  reason: string;
  expiresAt: string;
  revealedAt: string | null;
  revokedAt: string | null;
  isLive: boolean;
  createdAt: string;
}

/** The one response that carries a secret. Returned once, logged before it is sent. */
export interface RevealedCredential {
  username: string;
  secret: string;
  /** How long the UI should keep it on screen. */
  visibleForSeconds: number;
  expiresAt: string;
}

export interface CredentialAccessLogRow {
  id: string;
  testAccountId: string;
  testAccountLabel: string;
  grantId: string | null;
  userId: string;
  userName: string;
  action: CredentialAction;
  revealedAt: string;
  ipAddress: string | null;
}

export interface TestEnvironmentRow {
  id: string;
  projectId: string;
  kind: TestEnvironment;
  url: string;
  status: TestEnvironmentStatus;
  deployedVersion: string | null;
  deployedAt: string | null;
  githubEnvironmentName: string | null;
}

/** Counts behind the nine tester views, so the dashboard needs one request. */
export type TesterViewCounts = Record<TesterView, number>;

/**
 * The QA workspace at /qa.
 *
 * Distinct from `TesterDashboard` in `api/dashboards`, which is the Phase 1 role dashboard on the
 * home screen. That one answers "how is testing going"; this one is the queue a tester works.
 */
export interface TesterQueue {
  counts: TesterViewCounts;
  /** What to work through, soonest deadline first. */
  queue: TestingAssignmentSummary[];
}

export const UAT_DECISION = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
} as const;

export type UatDecision = (typeof UAT_DECISION)[keyof typeof UAT_DECISION];

/**
 * What a client is asked to sign off.
 *
 * Every field here is one a client may read. There is deliberately no staging URL, no pull
 * request, no test account and no internal note — the shape is the guarantee, so a field added to
 * the row later cannot reach a client by being spread into this.
 */
export interface UatRequestSummary {
  id: string;
  releaseId: string | null;
  taskId: string | null;
  /** No jargon. This is the whole of what the client is shown about the change. */
  summaryPlain: string;
  previewUrl: string | null;
  checklist: string[];
  status: UatDecision;
  note: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
}

/** The provider's view: the same request, plus who it went to and which release it gates. */
export interface UatRequestDetail extends UatRequestSummary {
  clientOrganizationId: string;
  clientName: string;
  releaseVersion: string | null;
  createdByName: string;
  comments: UatCommentRow[];
  updatedAt: string;
}

export interface UatCommentRow {
  id: string;
  body: string;
  authorName: string;
  /** True when the comment came from the client rather than the provider. */
  fromClient: boolean;
  createdAt: string;
}
