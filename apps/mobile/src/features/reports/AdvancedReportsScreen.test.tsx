import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { projectSummary } from '../projects/project-test-data';
import { AdvancedReportsScreen } from './AdvancedReportsScreen';
import { apiRoutes, projectProgressReport } from './report-test-data';

/**
 * The advanced reports.
 *
 * Which reports exist is the API's answer, and so is every figure; the screen's job is to ask for
 * the right report with the right filters and lay out what comes back. Those are what is asserted.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: ROLE_KEYS.PROJECT_MANAGER, permissions }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      '/reports/advanced/project-progress': projectProgressReport(),
      '/reports/advanced': [
        { type: 'project-progress', label: 'Project progress' },
        { type: 'team-workload', label: 'Team workload' },
      ],
      '/organizations/options': [{ id: 'org-1', name: 'Acme Ltd', isServiceProvider: false }],
      '/projects': [projectSummary()],
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('runs the chosen report and lays out its totals, breakdown and rows', async () => {
  signIn([PERMISSIONS.REPORT_READ_OWN, PERMISSIONS.REPORT_READ_ALL, PERMISSIONS.PROJECT_READ]);
  const view = await renderScreen(<AdvancedReportsScreen />);

  await fireEvent.press(await view.findByRole('button', { name: 'Project progress' }));

  expect(await view.findByLabelText('Overall progress: 50%')).toBeTruthy();
  expect(view.getByLabelText('BLU · Blue app: 75%')).toBeTruthy();
  expect(view.getByText('On hold')).toBeTruthy();
  expect(view.getAllByText('ACM · Acme portal').length).toBeGreaterThan(0);
});

it('narrows the report by project and shows the filter as a removable chip', async () => {
  signIn([PERMISSIONS.REPORT_READ_OWN, PERMISSIONS.REPORT_READ_ALL, PERMISSIONS.PROJECT_READ]);
  const view = await renderScreen(<AdvancedReportsScreen />);
  await fireEvent.press(await view.findByRole('button', { name: 'Project progress' }));
  await view.findByLabelText('Overall progress: 50%');

  await fireEvent.press(view.getByRole('button', { name: 'Filters' }));
  await fireEvent.press(view.getByRole('button', { name: 'Project: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Acme portal, Acme Ltd' }));

  await waitFor(() =>
    expect(
      requestedPaths(fetchMock).some(
        (path) =>
          path.includes('/reports/advanced/project-progress') && path.includes('projectId=p1'),
      ),
    ).toBe(true),
  );
  expect(await view.findByRole('button', { name: 'Remove filter: Acme portal' })).toBeTruthy();
  expect(await view.findByLabelText('Overall progress: 50%')).toBeTruthy();
});

it('offers no project filter to somebody who cannot list projects', async () => {
  signIn([PERMISSIONS.REPORT_READ_OWN]);
  const view = await renderScreen(<AdvancedReportsScreen />);
  await fireEvent.press(await view.findByRole('button', { name: 'Project progress' }));
  await view.findByLabelText('Overall progress: 50%');

  await fireEvent.press(view.getByRole('button', { name: 'Filters' }));
  expect(view.queryByRole('button', { name: 'Project: not set' })).toBeNull();
  expect(requestedPaths(fetchMock).some((path) => path.endsWith('/projects'))).toBe(false);
});
