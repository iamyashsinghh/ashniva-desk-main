import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { apiRoutes, callsWith } from '../reports/report-test-data';
import { AiSummariesScreen } from './AiSummariesScreen';
import { providerStatus, summaryDetail, summaryRow } from './summary-test-data';

/**
 * The progress summary list.
 *
 * Which summaries a view holds is the server's filter; the screen's part is asking for the right
 * statuses, offering "New summary" only to somebody who may generate, and making both calls when
 * a summary is created.
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

function listPaths(): string[] {
  return requestedPaths(fetchMock)
    .filter((path) => /\/ai-summaries\?/.test(path))
    .map((path) => decodeURIComponent(path));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    apiRoutes({
      '/ai-summaries/provider-status': providerStatus(),
      'POST /ai-summaries/s9/generate': summaryDetail({ id: 's9', status: 'GENERATING' }),
      'POST /ai-summaries': summaryDetail({ id: 's9', status: 'DRAFT' }),
      '/ai-summaries': { items: [summaryRow()], nextCursor: null },
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('lists the summaries still in progress and opens one', async () => {
  signIn([PERMISSIONS.AI_SUMMARY_READ]);
  const onOpen = jest.fn();
  const view = await renderScreen(<AiSummariesScreen onOpen={onOpen} onOpenUsage={jest.fn()} />);

  await fireEvent.press(
    await view.findByRole('button', { name: 'Acme portal — week 39, In review' }),
  );
  expect(onOpen).toHaveBeenCalledWith('s1');
  expect(listPaths()[0]).toContain('status=DRAFT,GENERATING,GENERATION_FAILED,CHANGES_REQUESTED');
  expect(view.queryByRole('button', { name: 'New summary' })).toBeNull();
});

it('asks for the statuses of the view that is picked', async () => {
  signIn([PERMISSIONS.AI_SUMMARY_READ]);
  const view = await renderScreen(<AiSummariesScreen onOpen={jest.fn()} onOpenUsage={jest.fn()} />);
  await view.findByText('Acme portal — week 39');

  await fireEvent.press(view.getByRole('tab', { name: 'Waiting on review' }));

  await waitFor(() =>
    expect(listPaths().some((path) => path.includes('status=IN_REVIEW,APPROVED'))).toBe(true),
  );
});

it('creates a summary, queues its generation and opens it', async () => {
  signIn([PERMISSIONS.AI_SUMMARY_READ, PERMISSIONS.AI_SUMMARY_GENERATE]);
  const onOpen = jest.fn();
  const view = await renderScreen(<AiSummariesScreen onOpen={onOpen} onOpenUsage={jest.fn()} />);
  await view.findByText('Acme portal — week 39');

  await fireEvent.press(view.getByRole('button', { name: 'New summary' }));
  await fireEvent.press(
    view.getByRole('button', { name: 'What kind of summary: Team lead daily summary' }),
  );
  await fireEvent.press(
    await view.findByRole('radio', { name: 'Ticket resolution summary, Internal only' }),
  );
  await fireEvent.press(view.getByRole('button', { name: 'Create and generate' }));

  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('s9'));
  const posts = callsWith(fetchMock, 'POST');
  expect(posts[0]?.[0]).toMatch(/\/ai-summaries$/);
  expect(posts[0]?.[1]).toMatchObject({ type: 'TICKET_RESOLUTION' });
  expect(posts[1]?.[0]).toMatch(/\/ai-summaries\/s9\/generate$/);
});

it('turns "New summary" off when no provider is configured', async () => {
  signIn([PERMISSIONS.AI_SUMMARY_READ, PERMISSIONS.AI_SUMMARY_GENERATE]);
  fetchMock.mockImplementation(
    apiRoutes({
      '/ai-summaries/provider-status': providerStatus({ configured: false }),
      '/ai-summaries': { items: [], nextCursor: null },
    }),
  );
  const view = await renderScreen(<AiSummariesScreen onOpen={jest.fn()} onOpenUsage={jest.fn()} />);

  expect(await view.findByText('No AI provider is configured')).toBeTruthy();
  expect(view.getByRole('button', { name: 'New summary' })).toBeDisabled();
});
