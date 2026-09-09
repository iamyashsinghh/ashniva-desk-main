export const TESTING_ASSIGNMENT_KIND = {
  QA: 'QA',
  RETEST: 'RETEST',
  LIVE_VERIFICATION: 'LIVE_VERIFICATION',
  UAT: 'UAT',
} as const;

export type TestingAssignmentKind =
  (typeof TESTING_ASSIGNMENT_KIND)[keyof typeof TESTING_ASSIGNMENT_KIND];

export const TESTING_ASSIGNMENT_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CLARIFICATION: 'CLARIFICATION',
  CANCELLED: 'CANCELLED',
} as const;

export type TestingAssignmentStatus =
  (typeof TESTING_ASSIGNMENT_STATUS)[keyof typeof TESTING_ASSIGNMENT_STATUS];

export const TEST_RESULT = {
  PASS: 'PASS',
  FAIL: 'FAIL',
} as const;

export type TestResult = (typeof TEST_RESULT)[keyof typeof TEST_RESULT];

export const TEST_ENVIRONMENT = {
  DEVELOPMENT: 'DEVELOPMENT',
  STAGING: 'STAGING',
  PRODUCTION: 'PRODUCTION',
} as const;

export type TestEnvironment = (typeof TEST_ENVIRONMENT)[keyof typeof TEST_ENVIRONMENT];

/** Automated check (GitHub Actions) outcome as shown inside Ashniva Desk. */
export const CHECK_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type CheckStatus = (typeof CHECK_STATUS)[keyof typeof CHECK_STATUS];
