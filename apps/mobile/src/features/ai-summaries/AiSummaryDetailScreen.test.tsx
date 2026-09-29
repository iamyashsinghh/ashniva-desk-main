import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { apiRoutes, callsWith } from '../reports/report-test-data';
import { AiSummaryDetailScreen } from './AiSummaryDetailScreen';
import { providerStatus, summaryDetail } from './summary-test-data';

/**
 * Reviewing a progress summary.
 *
 * The reviewer reads both versions side by side and signs one off or sends it back with a reason.
 * The buttons follow the permissions, so somebody who may only read sees none.
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

const reviewer = [PERMISSIONS.AI_SUMMARY_READ, PERMISSIONS.AI_SUMMARY_APPROVE];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      '/ai-summaries/provider-status': providerStatus(),
      '/ai-summaries/s1/sources': [],
      'POST /ai-summaries/s1/': summaryDetail({ status: 'APPROVED' }),
      '/ai-summaries/s1': summaryDetail(),
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the internal and client versions and lets a reviewer approve', async () => {
  signIn(reviewer);
  const view = await renderScreen(<AiSummaryDetailScreen summaryId="s1" />);

  expect(await view.findByText(/payment provider sandbox was down/)).toBeTruthy();
  expect(view.getByText(/on track for the October release/)).toBeTruthy();
  expect(view.getByText('Draft — not approved by a person')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Approve' }));

  await waitFor(() =>
    expect(callsWith(fetchMock, 'POST').map(([url]) => url)).toEqual([
      expect.stringMatching(/\/ai-summaries\/s1\/approve$/),
    ]),
  );
});

it('sends a summary back only with a reason', async () => {
  signIn(reviewer);
  const view = await renderScreen(<AiSummaryDetailScreen summaryId="s1" />);
  await view.findByText(/payment provider sandbox was down/);

  await fireEvent.press(view.getByRole('button', { name: 'Request changes' }));
  expect(view.getByRole('button', { name: 'Send back' })).toBeDisabled();

  await fireEvent.changeText(view.getByLabelText('Reason'), 'Say why checkout slipped');
  await fireEvent.press(view.getByRole('button', { name: 'Send back' }));

  await waitFor(() =>
    expect(callsWith(fetchMock, 'POST')).toEqual([
      [
        expect.stringMatching(/\/ai-summaries\/s1\/request-changes$/),
        { note: 'Say why checkout slipped' },
      ],
    ]),
  );
});

it('offers no review buttons to somebody who may only read', async () => {
  signIn([PERMISSIONS.AI_SUMMARY_READ]);
  const view = await renderScreen(<AiSummaryDetailScreen summaryId="s1" />);
  await view.findByText(/payment provider sandbox was down/);

  expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Request changes' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Cancel summary' })).toBeNull();
});
