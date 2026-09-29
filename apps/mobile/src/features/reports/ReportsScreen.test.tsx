import { PERMISSIONS, ROLE_KEYS, type PermissionKey, type RoleKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { apiRoutes, dailyReport } from './report-test-data';
import { ReportsScreen } from './ReportsScreen';

/**
 * Daily reports.
 *
 * The report is the server's; what is asserted is which report was asked for and that a task in
 * it opens. The team view only exists for somebody who may read the team's reports.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function signIn(roleKey: RoleKey, permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey, permissions }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      '/reports/daily/team': [dailyReport(), dailyReport({ userId: 'u2', userName: 'Lee Lead' })],
      '/reports/daily/history': [dailyReport()],
      '/reports/daily': dailyReport(),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it("shows the person's day and opens a task from it", async () => {
  signIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.REPORT_READ_OWN]);
  const onOpenTask = jest.fn();
  const view = await renderScreen(<ReportsScreen onOpenTask={onOpenTask} />);

  expect(await view.findByText('Asha Dev')).toBeTruthy();
  expect(view.getByLabelText('Completed: 1')).toBeTruthy();
  expect(view.queryByRole('tab', { name: 'Team' })).toBeNull();

  await fireEvent.press(view.getByRole('button', { name: 'ACM-12 Checkout page, 1 h 30 min' }));
  expect(onOpenTask).toHaveBeenCalledWith('t1');
});

it("lets a lead read the whole team's day", async () => {
  signIn(ROLE_KEYS.TEAM_LEAD, [
    PERMISSIONS.REPORT_READ_OWN,
    PERMISSIONS.REPORT_READ_TEAM,
    PERMISSIONS.TASK_READ,
  ]);
  const view = await renderScreen(<ReportsScreen onOpenTask={jest.fn()} />);
  await view.findByText('Asha Dev');
  expect(view.getByRole('button', { name: 'Person: not set' })).toBeTruthy();

  await fireEvent.press(view.getByRole('tab', { name: 'Team' }));

  expect(await view.findByText('Lee Lead')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('/reports/daily/team'))).toBe(true);
});

it('reads the last fourteen days of snapshots', async () => {
  signIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.REPORT_READ_OWN]);
  const view = await renderScreen(<ReportsScreen onOpenTask={jest.fn()} />);
  await view.findByText('Asha Dev');

  await fireEvent.press(view.getByRole('tab', { name: 'Last 14 days' }));

  await waitFor(() =>
    expect(
      requestedPaths(fetchMock).some(
        (path) => path.includes('/reports/daily/history') && path.includes('from='),
      ),
    ).toBe(true),
  );
});
