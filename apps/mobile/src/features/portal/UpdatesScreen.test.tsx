import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { UpdatesScreen } from './UpdatesScreen';

/**
 * What a client's team has published.
 *
 * The screen used to read one page of each list and stack them, which meant it could only ever
 * show the first ten of each: scrolling to the bottom of the summaries reached the top of the
 * releases, not the eleventh summary. So the shape changed — one list at a time, each paging —
 * and these are the assertions that keep it that way.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const CLIENT = sessionUser({
  roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
  roleName: 'Client Employee',
  permissions: [PERMISSIONS.PROJECT_READ],
  organization: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Northwind',
    slug: 'northwind',
    isServiceProvider: false,
  },
});

function summary(id: string, title: string) {
  return {
    id,
    type: 'WEEKLY',
    title,
    projectId: null,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-07',
    content: 'A quiet week.',
    publishedAt: '2026-09-08T09:00:00.000Z',
  };
}

/** Answers each list from its own path, so a test does not depend on which is fetched first. */
function routeByPath(pages: Record<string, unknown>) {
  return (url: string) => {
    const match = Object.keys(pages).find((path) => String(url).includes(path));
    return Promise.resolve(jsonResponse(match ? pages[match] : { items: [], nextCursor: null }));
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: CLIENT });
});

describe('the progress list', () => {
  it('shows what has been published', async () => {
    fetchMock.mockImplementation(
      routeByPath({
        '/portal/ai-summaries': { items: [summary('s1', 'Week one')], nextCursor: null },
      }),
    );
    const view = await renderScreen(<UpdatesScreen onOpenRelease={jest.fn()} />);

    expect(await view.findByText('Week one')).toBeTruthy();
  });

  it('reads it as a page rather than in one go', async () => {
    // The paging itself is proved in `shared/api/queries.test.tsx`, which drives the hook without
    // needing a layout jest does not have. What this asserts is that the screen is wired to the
    // paged hook at all: a request with no limit is the "first twenty and no more" screen coming
    // back.
    fetchMock.mockImplementation(
      routeByPath({
        '/portal/ai-summaries': { items: [summary('s1', 'Week one')], nextCursor: 's1' },
      }),
    );
    const view = await renderScreen(<UpdatesScreen onOpenRelease={jest.fn()} />);

    await view.findByText('Week one');
    const path = requestedPaths(fetchMock).find((candidate) =>
      candidate.includes('/portal/ai-summaries'),
    );
    expect(path).toContain('limit=20');
  });

  it('says nothing has been published rather than showing a blank screen', async () => {
    fetchMock.mockImplementation(routeByPath({}));
    const view = await renderScreen(<UpdatesScreen onOpenRelease={jest.fn()} />);

    expect(await view.findByText('Nothing published yet')).toBeTruthy();
  });
});

describe('the releases list', () => {
  it('opens the release that was tapped, rather than stopping at a version number', async () => {
    fetchMock.mockImplementation(
      routeByPath({
        '/portal/release-notes': {
          items: [
            {
              id: 'r1',
              projectId: 'p1',
              version: '4.2',
              releaseDate: '2026-09-05',
              publishedAt: null,
            },
          ],
          nextCursor: null,
        },
      }),
    );
    const onOpenRelease = jest.fn();
    const view = await renderScreen(<UpdatesScreen onOpenRelease={onOpenRelease} />);

    await fireEvent.press(await view.findByRole('tab', { name: 'Releases' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Version 4.2' }));

    expect(onOpenRelease).toHaveBeenCalledWith('r1');
  });
});

describe('when a list fails', () => {
  it('shows the API’s own sentence with a retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Updates are unavailable' }, 500));
    const view = await renderScreen(<UpdatesScreen onOpenRelease={jest.fn()} />);

    expect(await view.findByText('Updates are unavailable')).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
