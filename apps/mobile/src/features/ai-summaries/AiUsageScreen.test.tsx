import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { apiRoutes } from '../reports/report-test-data';
import { AiUsageScreen } from './AiUsageScreen';
import { providerStatus, usageTotals } from './summary-test-data';

/** AI usage: the server's totals for the period, and whether a provider is connected. */

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
    user: sessionUser({ roleKey: ROLE_KEYS.SUPER_ADMIN, permissions }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      '/ai-summaries/provider-status': providerStatus(),
      '/ai-summaries/usage': usageTotals(),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the runs, tokens, success rate and the connected provider', async () => {
  signIn([PERMISSIONS.AI_SUMMARY_READ]);
  const view = await renderScreen(<AiUsageScreen />);

  expect(await view.findByLabelText('Runs: 20')).toBeTruthy();
  expect(view.getByLabelText('Failed: 2')).toBeTruthy();
  expect(view.getByLabelText('Input tokens: 42,000')).toBeTruthy();
  expect(view.getByText('90% of runs succeeded')).toBeTruthy();
  expect(await view.findByText('Configured')).toBeTruthy();
});

it('reads nothing without the permission', async () => {
  signIn([]);
  const view = await renderScreen(<AiUsageScreen />);

  expect(await view.findByText('Not available')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('/ai-summaries'))).toBe(false);
});
