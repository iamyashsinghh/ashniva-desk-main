import {
  CREDENTIAL_ROTATION_POLICY,
  PERMISSIONS,
  TEST_ENVIRONMENT,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type PermissionKey,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { LIVE_CHECKS } from './LiveVerificationSection';
import { QaAssignmentScreen } from './QaAssignmentScreen';

/**
 * One testing assignment on a phone: start it, record a result, sign off production, and read the
 * test login through a grant — the last without the password ever passing through a cache.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();
const ME = '11111111-1111-4111-8111-111111111111';

function assignment(overrides: Partial<TestingAssignmentDetail> = {}): TestingAssignmentDetail {
  return {
    id: 'qa1',
    kind: TESTING_ASSIGNMENT_KIND.QA,
    status: TESTING_ASSIGNMENT_STATUS.IN_PROGRESS,
    environment: TEST_ENVIRONMENT.STAGING,
    projectId: 'p1',
    projectName: 'Northwind portal',
    subjectLabel: 'Saved cards at checkout',
    taskId: 't1',
    ticketId: null,
    releaseId: null,
    assignedToUserId: ME,
    assignedToName: 'Sam Patel',
    dueAt: null,
    isOverdue: false,
    startedAt: '2026-09-01T10:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    stagingUrl: 'https://staging.northwind.test',
    whatDeveloped: 'Cards can be saved',
    whatToTest: 'Pay with a saved card',
    acceptanceCriteria: null,
    developerNotes: null,
    browserDevice: [],
    checksStatus: null,
    clarificationQuestion: null,
    clarificationAnswer: null,
    assignedByName: 'Priya Rao',
    testAccount: null,
    results: [],
    createdAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

const ACCOUNT = {
  id: 'ta1',
  projectId: 'p1',
  environment: TEST_ENVIRONMENT.STAGING,
  environmentId: null,
  label: 'Test Admin',
  username: 'admin@test',
  notes: null,
  rotationPolicy: CREDENTIAL_ROTATION_POLICY.AFTER_TEST,
  isActive: true,
  rotatedAt: null,
  hasActiveGrant: false,
  createdAt: '2026-09-01T09:00:00.000Z',
};

/** Answers each request by its path; the assignment itself for anything unrecognised. */
function serve(detail: TestingAssignmentDetail) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/test-accounts/ta1/grant')) {
      return jsonResponse({
        id: 'g1',
        grantedToUserId: ME,
        expiresAt: '2026-09-28T18:00:00.000Z',
        reason: 'QA',
      });
    }
    if (url.includes('/grants/g1/reveal')) {
      return jsonResponse({
        username: 'admin@test',
        secret: 'correct horse battery',
        visibleForSeconds: 30,
        expiresAt: '2026-09-28T18:00:00.000Z',
      });
    }
    return jsonResponse(detail);
  });
}

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({ status: 'signed-in', user: sessionUser({ permissions }) });
}

/** The request sent to a path ending in `suffix`, with its parsed body. */
function sent(suffix: string): { method: string; body: unknown } | null {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(suffix));
  if (!call) {
    return null;
  }
  const init = call[1] as RequestInit;
  return {
    method: init.method ?? 'GET',
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('starts a pending assignment', async () => {
  signIn([PERMISSIONS.QA_RECORD_RESULT]);
  serve(assignment({ status: TESTING_ASSIGNMENT_STATUS.PENDING }));
  const view = await renderScreen(<QaAssignmentScreen assignmentId="qa1" />);

  await fireEvent.press(await view.findByRole('button', { name: 'Start testing' }));
  expect(sent('/qa/assignments/qa1/start')?.method).toBe('POST');
});

it('turns the controls off on somebody else’s assignment and says whose it is', async () => {
  signIn([PERMISSIONS.QA_RECORD_RESULT]);
  serve(assignment({ assignedToUserId: 'u2', assignedToName: 'Asha Iyer' }));
  const view = await renderScreen(<QaAssignmentScreen assignmentId="qa1" />);

  expect(await view.findByText('Only Asha Iyer can do this')).toBeTruthy();
  const record = view.getByRole('button', { name: 'Record pass / fail' });
  expect(record.props.accessibilityState.disabled).toBe(true);
});

it('records a failure with its severity from the result sheet', async () => {
  signIn([PERMISSIONS.QA_RECORD_RESULT]);
  serve(assignment());
  const view = await renderScreen(<QaAssignmentScreen assignmentId="qa1" />);

  await fireEvent.press(await view.findByRole('button', { name: 'Record pass / fail' }));
  await fireEvent.press(view.getByRole('tab', { name: 'Failed' }));
  await fireEvent.changeText(view.getByLabelText('What actually happened'), 'Card declined');
  await fireEvent.changeText(view.getByLabelText('What is broken'), 'Saved card is rejected');
  await fireEvent.press(view.getByRole('button', { name: 'Severity: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'High — the feature is unusable' }));
  await fireEvent.press(view.getByRole('button', { name: 'Record failure' }));

  expect(sent('/qa/assignments/qa1/result')?.body).toMatchObject({
    result: 'FAIL',
    whatTested: 'Pay with a saved card',
    actualResult: 'Card declined',
    failureDescription: 'Saved card is rejected',
    severity: 'HIGH',
  });
});

it('keeps "Verify live" off until every production check is ticked', async () => {
  signIn([PERMISSIONS.QA_RECORD_RESULT, PERMISSIONS.QA_VERIFY_LIVE]);
  serve(assignment({ kind: TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION }));
  const view = await renderScreen(<QaAssignmentScreen assignmentId="qa1" />);

  const verify = await view.findByRole('button', { name: 'Verify live' });
  expect(verify.props.accessibilityState.disabled).toBe(true);
  for (const check of LIVE_CHECKS) {
    await fireEvent.press(view.getByRole('checkbox', { name: check }));
  }
  await fireEvent.press(view.getByRole('button', { name: 'Verify live' }));
  expect(sent('/qa/assignments/qa1/verify-live')?.method).toBe('POST');
  expect(view.queryByRole('button', { name: 'Record pass / fail' })).toBeNull();
});

it('says so when no test login is attached', async () => {
  signIn([PERMISSIONS.QA_RECORD_RESULT]);
  serve(assignment());
  const view = await renderScreen(<QaAssignmentScreen assignmentId="qa1" />);

  expect(await view.findByText('No test login attached')).toBeTruthy();
});

it('grants the tester access, reveals the password for a while, and hides it on request', async () => {
  signIn([
    PERMISSIONS.QA_RECORD_RESULT,
    PERMISSIONS.TEST_ACCOUNT_MANAGE,
    PERMISSIONS.TEST_CREDENTIAL_REVEAL,
  ]);
  serve(assignment({ testAccount: ACCOUNT }));
  const view = await renderScreen(<QaAssignmentScreen assignmentId="qa1" />);

  const grant = await view.findByRole('button', { name: 'Grant myself access' });
  expect(
    view.getByRole('button', { name: 'Reveal password' }).props.accessibilityState.disabled,
  ).toBe(true);

  await fireEvent.press(grant);
  expect(sent('/test-accounts/ta1/grant')?.body).toEqual({
    grantedToUserId: ME,
    reason: 'QA of Saved cards at checkout',
    assignmentId: 'qa1',
  });

  await fireEvent.press(await view.findByRole('button', { name: 'Reveal password' }));
  expect(sent('/grants/g1/reveal')?.method).toBe('POST');
  expect(await view.findByText('correct horse battery')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Hide it now' }));
  expect(view.queryByText('correct horse battery')).toBeNull();
});
