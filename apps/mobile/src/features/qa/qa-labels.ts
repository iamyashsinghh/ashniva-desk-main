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
  type TesterViewCounts,
  type TestingAssignmentKind,
  type TestingAssignmentStatus,
  type TestSeverity,
} from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import type { SegmentOption } from '../../shared/components/navigation-list';
import type { PillTone } from '../../shared/components/primitives';
import type { SelectOption } from '../../shared/components/SelectSheet';
import type { TabOption } from '../../shared/components/TabBar';

/**
 * How a tester reads the QA enums — the web app's wording, so a status is called the same thing
 * on a phone and at a desk. The enums themselves are the contract in `@ashniva/types`.
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

export const ASSIGNMENT_STATUS_TONES: Record<TestingAssignmentStatus, PillTone> = {
  [TESTING_ASSIGNMENT_STATUS.PENDING]: 'neutral',
  [TESTING_ASSIGNMENT_STATUS.IN_PROGRESS]: 'progress',
  [TESTING_ASSIGNMENT_STATUS.PASSED]: 'success',
  [TESTING_ASSIGNMENT_STATUS.FAILED]: 'danger',
  [TESTING_ASSIGNMENT_STATUS.CLARIFICATION]: 'warning',
  [TESTING_ASSIGNMENT_STATUS.CANCELLED]: 'neutral',
};

export const ENVIRONMENT_LABELS: Record<TestEnvironment, string> = {
  [TEST_ENVIRONMENT.DEVELOPMENT]: 'Development',
  [TEST_ENVIRONMENT.STAGING]: 'Staging',
  [TEST_ENVIRONMENT.PRODUCTION]: 'Production',
};

/** Staging first: it is where almost all testing happens, so it is the first thing offered. */
export const ENVIRONMENT_OPTIONS: readonly SegmentOption<TestEnvironment>[] = [
  { value: TEST_ENVIRONMENT.STAGING, label: 'Staging' },
  { value: TEST_ENVIRONMENT.DEVELOPMENT, label: 'Development' },
  { value: TEST_ENVIRONMENT.PRODUCTION, label: 'Production' },
];

export const ENVIRONMENT_STATUS_LABELS: Record<TestEnvironmentStatus, string> = {
  [TEST_ENVIRONMENT_STATUS.UP]: 'Up',
  [TEST_ENVIRONMENT_STATUS.DOWN]: 'Down',
  [TEST_ENVIRONMENT_STATUS.DEPLOYING]: 'Deploying',
  [TEST_ENVIRONMENT_STATUS.UNKNOWN]: 'Unknown',
};

export const ENVIRONMENT_STATUS_TONES: Record<TestEnvironmentStatus, PillTone> = {
  [TEST_ENVIRONMENT_STATUS.UP]: 'success',
  [TEST_ENVIRONMENT_STATUS.DOWN]: 'danger',
  [TEST_ENVIRONMENT_STATUS.DEPLOYING]: 'progress',
  [TEST_ENVIRONMENT_STATUS.UNKNOWN]: 'neutral',
};

export const ENVIRONMENT_STATUS_OPTIONS: readonly SelectOption<TestEnvironmentStatus>[] =
  Object.values(TEST_ENVIRONMENT_STATUS).map((status) => ({
    value: status,
    label: ENVIRONMENT_STATUS_LABELS[status],
  }));

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  [CHECK_STATUS.PENDING]: 'Checks queued',
  [CHECK_STATUS.RUNNING]: 'Checks running',
  [CHECK_STATUS.PASSED]: 'Checks passed',
  [CHECK_STATUS.FAILED]: 'Checks failed',
  [CHECK_STATUS.CANCELLED]: 'Checks cancelled',
};

export const CHECK_STATUS_TONES: Record<CheckStatus, PillTone> = {
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

export const SEVERITY_TONES: Record<TestSeverity, PillTone> = {
  [TEST_SEVERITY.LOW]: 'neutral',
  [TEST_SEVERITY.MEDIUM]: 'warning',
  [TEST_SEVERITY.HIGH]: 'danger',
  [TEST_SEVERITY.CRITICAL]: 'danger',
};

export const SEVERITY_OPTIONS: readonly SelectOption<TestSeverity>[] = Object.values(
  TEST_SEVERITY,
).map((severity) => ({ value: severity, label: SEVERITY_LABELS[severity] }));

export const ROTATION_POLICY_LABELS: Record<CredentialRotationPolicy, string> = {
  [CREDENTIAL_ROTATION_POLICY.AFTER_TEST]: 'After every test',
  [CREDENTIAL_ROTATION_POLICY.DAILY]: 'Daily',
  [CREDENTIAL_ROTATION_POLICY.MANUAL]: 'Manually',
};

export const ROTATION_POLICY_OPTIONS: readonly SelectOption<CredentialRotationPolicy>[] =
  Object.values(CREDENTIAL_ROTATION_POLICY).map((policy) => ({
    value: policy,
    label: ROTATION_POLICY_LABELS[policy],
  }));

const TESTER_VIEWS: ReadonlyArray<{ value: TesterView; label: string; icon: IconName }> = [
  { value: TESTER_VIEW.MINE, label: 'Assigned to me', icon: 'person-outline' },
  { value: TESTER_VIEW.READY, label: 'Ready for testing', icon: 'rocket-outline' },
  { value: TESTER_VIEW.TODAY, label: 'Testing today', icon: 'today-outline' },
  { value: TESTER_VIEW.FAILED, label: 'Failed & returned', icon: 'bug-outline' },
  { value: TESTER_VIEW.RETEST, label: 'Waiting for retest', icon: 'repeat-outline' },
  { value: TESTER_VIEW.PASSED_TODAY, label: 'Passed today', icon: 'checkmark-done-outline' },
  { value: TESTER_VIEW.UAT, label: 'Client UAT pending', icon: 'people-outline' },
  { value: TESTER_VIEW.LIVE, label: 'Live verification', icon: 'pulse-outline' },
  { value: TESTER_VIEW.OVERDUE, label: 'Overdue', icon: 'alarm-outline' },
];

export function testerViewLabel(view: TesterView): string {
  return TESTER_VIEWS.find((entry) => entry.value === view)?.label ?? view;
}

/** All nine views, in the web app's order, with the counts that came back with the queue. */
export function testerViewTabs(counts: TesterViewCounts | null): TabOption<TesterView>[] {
  return TESTER_VIEWS.map((entry) => (counts ? { ...entry, count: counts[entry.value] } : entry));
}
