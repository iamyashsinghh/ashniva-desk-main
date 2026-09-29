import {
  PERMISSIONS,
  ROLE_KEYS,
  WORK_PLAN_POINT_STATUS,
  type ProjectWorkPlan,
} from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../../shared/testing/harness';
import { ProjectSummaryScreen } from './ProjectSummaryScreen';
import { testPlan, testPoint } from './test-data';

/**
 * Summary, rendered against a fetch double.
 *
 * The helpers prove which buttons a point would show; this proves the screen actually wires them:
 * a step button posts to its own endpoint, and a changed assignment reaches the assignments
 * endpoint only after the "my words" question is answered.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();
const DEVELOPER = { id: 'dev-1', name: 'Asha Dev', email: 'asha@example.com' };

function serve(plan: ProjectWorkPlan) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = String(url).split('?')[0] ?? '';
    if (path.endsWith('/projects/p1')) return jsonResponse({ id: 'p1', name: 'Acme portal' });
    if (path.includes('/projects/p1/work-plan')) return jsonResponse(plan);
    return jsonResponse({ message: 'Not found' }, 404);
  });
}

function call(pathEnd: string): [string, RequestInit] | undefined {
  return fetchMock.mock.calls.find(([url]) => String(url).endsWith(pathEnd)) as
    [string, RequestInit] | undefined;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.PROJECT_MANAGER,
      permissions: [PERMISSIONS.PROJECT_READ],
    }),
  });
});

it('sends a started step to the tester from its own button', async () => {
  serve(
    testPlan(
      [
        testPoint({
          status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
          startedAt: '2026-09-28T09:00:00.000Z',
          timerPaused: true,
          pausedRemainingSeconds: 600,
          canSubmitTest: true,
        }),
      ],
      { canWork: true },
    ),
  );
  const onOpenEditor = jest.fn();
  const view = await renderScreen(
    <ProjectSummaryScreen projectId="p1" onOpenEditor={onOpenEditor} />,
  );

  await view.findByText('Build the login form');
  expect(view.queryByRole('button', { name: 'Edit plan' })).toBeNull();

  await fireEvent.press(view.getByRole('button', { name: 'Send to tester' }));

  await waitFor(() => expect(call('/work-plan/points/pt1/submit-test')).toBeDefined());
  expect(call('/work-plan/points/pt1/submit-test')?.[1].method).toBe('POST');
});

it('saves a changed topic developer after "use my words"', async () => {
  serve(
    testPlan([testPoint()], {
      canAssign: true,
      canManage: true,
      canExplainWithAi: true,
      developers: [DEVELOPER],
    }),
  );
  const onOpenEditor = jest.fn();
  const view = await renderScreen(
    <ProjectSummaryScreen projectId="p1" onOpenEditor={onOpenEditor} />,
  );
  await view.findByText('Build the login form');

  await fireEvent.press(view.getByRole('button', { name: 'Edit plan' }));
  expect(onOpenEditor).toHaveBeenCalledWith('p1');

  await fireEvent.press(view.getByRole('button', { name: 'Topic developer: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Asha Dev' }));
  await fireEvent.press(await view.findByRole('button', { name: 'Save assignments' }));
  await fireEvent.press(await view.findByRole('button', { name: 'No — use my words' }));

  await waitFor(() => expect(call('/work-plan/assignments')).toBeDefined());
  const [, init] = call('/work-plan/assignments') ?? ['', {}];
  expect(init.method).toBe('PUT');
  expect(JSON.parse(String(init.body))).toMatchObject({
    titles: [expect.objectContaining({ id: 't1', assignedToId: 'dev-1' })],
  });
  expect(call('/work-plan/explain-preview')).toBeUndefined();
});
