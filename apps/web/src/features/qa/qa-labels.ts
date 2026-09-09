import {
  CHECK_STATUS,
  CREDENTIAL_ROTATION_POLICY,
  TESTER_VIEW,
  TEST_ENVIRONMENT,
  TEST_ENVIRONMENT_STATUS,
  TEST_SEVERITY,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type CheckStatus,
  type CredentialRotationPolicy,
  type TestEnvironment,
  type TestEnvironmentStatus,
  type TesterView,
  type TestingAssignmentKind,
  type TestingAssignmentStatus,
  type TestSeverity,
} from '@ashniva/types';
import type { Tone } from '@ashniva/ui';

/**
 * Wording and tones for the QA screens.
 *
 * The enums themselves live in `@ashniva/types` (they are the contract); how a tester reads them
 * is a web concern, and keeping it here means the queue, the assignment and the credential screens
 * cannot label the same status two different ways.
 */

export const ASSIGNMENT_KIND_LABELS: Record<TestingAssignmentKind, string> = {
  [TESTING_ASSIGNMENT_KIND.QA]: 'QA',
  [TESTING_ASSIGNMENT_KIND.RETEST]: 'Retest',
  [TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION]: 'Live verification',
  [TESTING_ASSIGNMENT_KIND.UAT]: 'Client UAT',
};

export const ASSIGNMENT_STATUS_LABELS: Record<TestingAssignmentStatus, string> = {
  [TESTING_ASSIGNMENT_STATUS.PENDING]: 'Pending',
  [TESTING_ASSIGNMENT_STATUS.IN_PROGRESS]: 'In progress',
  [TESTING_ASSIGNMENT_STATUS.PASSED]: 'Passed',
  [TESTING_ASSIGNMENT_STATUS.FAILED]: 'Failed',
  [TESTING_ASSIGNMENT_STATUS.CLARIFICATION]: 'Waiting on the developer',
  [TESTING_ASSIGNMENT_STATUS.CANCELLED]: 'Cancelled',
};

export const ASSIGNMENT_STATUS_TONES: Record<TestingAssignmentStatus, Tone> = {
  [TESTING_ASSIGNMENT_STATUS.PENDING]: 'neutral',
  [TESTING_ASSIGNMENT_STATUS.IN_PROGRESS]: 'progress',
  [TESTING_ASSIGNMENT_STATUS.PASSED]: 'success',
  [TESTING_ASSIGNMENT_STATUS.FAILED]: 'danger',
  [TESTING_ASSIGNMENT_STATUS.CLARIFICATION]: 'warning',
  [TESTING_ASSIGNMENT_STATUS.CANCELLED]: 'neutral',
};

/**
 * The three statuses an assignment can still be worked from.
 *
 * This decides what the page *draws*, never what is allowed: the transition rules live in the
 * API's `testing-assignment-workflow.ts` and every refusal comes back from the server and is shown
 * as it was written there.
 */
export const OPEN_ASSIGNMENT_STATUSES: readonly TestingAssignmentStatus[] = [
  TESTING_ASSIGNMENT_STATUS.PENDING,
  TESTING_ASSIGNMENT_STATUS.IN_PROGRESS,
  TESTING_ASSIGNMENT_STATUS.CLARIFICATION,
];

export const ENVIRONMENT_LABELS: Record<TestEnvironment, string> = {
  [TEST_ENVIRONMENT.DEVELOPMENT]: 'Development',
  [TEST_ENVIRONMENT.STAGING]: 'Staging',
  [TEST_ENVIRONMENT.PRODUCTION]: 'Production',
};

export const ENVIRONMENT_STATUS_LABELS: Record<TestEnvironmentStatus, string> = {
  [TEST_ENVIRONMENT_STATUS.UP]: 'Up',
  [TEST_ENVIRONMENT_STATUS.DOWN]: 'Down',
  [TEST_ENVIRONMENT_STATUS.DEPLOYING]: 'Deploying',
  [TEST_ENVIRONMENT_STATUS.UNKNOWN]: 'Unknown',
};

export const ENVIRONMENT_STATUS_TONES: Record<TestEnvironmentStatus, Tone> = {
  [TEST_ENVIRONMENT_STATUS.UP]: 'success',
  [TEST_ENVIRONMENT_STATUS.DOWN]: 'danger',
  [TEST_ENVIRONMENT_STATUS.DEPLOYING]: 'progress',
  [TEST_ENVIRONMENT_STATUS.UNKNOWN]: 'neutral',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  [CHECK_STATUS.PENDING]: 'Checks queued',
  [CHECK_STATUS.RUNNING]: 'Checks running',
  [CHECK_STATUS.PASSED]: 'Checks passed',
  [CHECK_STATUS.FAILED]: 'Checks failed',
  [CHECK_STATUS.CANCELLED]: 'Checks cancelled',
};

export const CHECK_STATUS_TONES: Record<CheckStatus, Tone> = {
  [CHECK_STATUS.PENDING]: 'neutral',
  [CHECK_STATUS.RUNNING]: 'progress',
  [CHECK_STATUS.PASSED]: 'success',
  [CHECK_STATUS.FAILED]: 'danger',
  [CHECK_STATUS.CANCELLED]: 'neutral',
};

export const SEVERITY_LABELS: Record<TestSeverity, string> = {
  [TEST_SEVERITY.LOW]: 'Low — cosmetic',
  [TEST_SEVERITY.MEDIUM]: 'Medium — works, but wrongly',
  [TEST_SEVERITY.HIGH]: 'High — the feature is unusable',
  [TEST_SEVERITY.CRITICAL]: 'Critical — blocks the release',
};

export const SEVERITY_TONES: Record<TestSeverity, Tone> = {
  [TEST_SEVERITY.LOW]: 'neutral',
  [TEST_SEVERITY.MEDIUM]: 'warning',
  [TEST_SEVERITY.HIGH]: 'danger',
  [TEST_SEVERITY.CRITICAL]: 'danger',
};

export const ROTATION_POLICY_LABELS: Record<CredentialRotationPolicy, string> = {
  [CREDENTIAL_ROTATION_POLICY.AFTER_TEST]: 'After every test',
  [CREDENTIAL_ROTATION_POLICY.DAILY]: 'Daily',
  [CREDENTIAL_ROTATION_POLICY.MANUAL]: 'Manually',
};

export const TESTER_VIEW_LABELS: Record<TesterView, string> = {
  [TESTER_VIEW.MINE]: 'Assigned to me',
  [TESTER_VIEW.READY]: 'Ready for testing',
  [TESTER_VIEW.TODAY]: 'Testing today',
  [TESTER_VIEW.FAILED]: 'Failed & returned',
  [TESTER_VIEW.RETEST]: 'Waiting for retest',
  [TESTER_VIEW.PASSED_TODAY]: 'Passed today',
  [TESTER_VIEW.UAT]: 'Client UAT pending',
  [TESTER_VIEW.LIVE]: 'Live verification',
  [TESTER_VIEW.OVERDUE]: 'Overdue',
};

export const TESTER_VIEW_ORDER: TesterView[] = [
  TESTER_VIEW.MINE,
  TESTER_VIEW.READY,
  TESTER_VIEW.TODAY,
  TESTER_VIEW.FAILED,
  TESTER_VIEW.RETEST,
  TESTER_VIEW.PASSED_TODAY,
  TESTER_VIEW.UAT,
  TESTER_VIEW.LIVE,
  TESTER_VIEW.OVERDUE,
];
