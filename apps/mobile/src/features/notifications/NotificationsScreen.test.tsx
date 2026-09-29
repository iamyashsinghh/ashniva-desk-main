import type { NotificationListResponse, NotificationSummary } from '@ashniva/types';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { NotificationsScreen } from './NotificationsScreen';
import { UNREAD_COUNT_KEY } from './use-cached-unread';

/**
 * The alerts list on the phone: Unread first as on the web, All one tap away, each row saying what
 * kind of thing it is, and reading marked on the server so the badge agrees everywhere.
 */

const fetchMock = jest.fn();
const PROJECT = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';
const TICKET = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f61';

function row(over: Partial<NotificationSummary> & { id: string }): NotificationSummary {
  return {
    type: 'TICKET_AUTO_ASSIGNED',
    title: 'A ticket is yours',
    body: null,
    link: `/tickets/${TICKET}`,
    entityType: 'ticket',
    entityId: TICKET,
    groupedCount: 1,
    readAt: null,
    createdAt: '2026-09-28T09:00:00.000Z',
    ...over,
  };
}

const UNREAD: NotificationListResponse = {
  items: [
    row({ id: 'n1' }),
    row({
      id: 'n2',
      type: 'WORK_PLAN_ASSIGNED',
      title: 'Assigned to you on ACME',
      link: `/projects/${PROJECT}`,
      entityType: 'project',
      entityId: PROJECT,
      groupedCount: 3,
    }),
  ],
  nextCursor: null,
  unreadCount: 2,
};

const ALL: NotificationListResponse = {
  items: [...UNREAD.items, row({ id: 'n3', title: 'An old one', readAt: '2026-09-20T00:00:00Z' })],
  nextCursor: null,
  unreadCount: 2,
};

function respond(unread = UNREAD, all = ALL) {
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.includes('/read')) {
      return Promise.resolve(jsonResponse({}));
    }
    return Promise.resolve(jsonResponse(path.includes('unread=true') ? unread : all));
  });
}

function renderScreen(onOpenLink = jest.fn()): Promise<RenderResult & { client: QueryClient }> {
  const client = testQueryClient();
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <NotificationsScreen onOpenLink={onOpenLink} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  ).then((view) => Object.assign(view, { client }));
}

function paths(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  respond();
});

describe('NotificationsScreen', () => {
  it('opens on the unread list, asking the server for unread only', async () => {
    const view = await renderScreen();
    await view.findByText('A ticket is yours');

    expect(paths()[0]).toContain('unread=true');
    expect(view.queryByText('An old one')).toBeNull();
    expect(view.getByLabelText('Unread, 2')).toBeTruthy();
  });

  it('shows everything under All', async () => {
    const view = await renderScreen();
    await view.findByText('A ticket is yours');

    await fireEvent.press(view.getByLabelText('All'));

    expect(await view.findByText('An old one')).toBeTruthy();
  });

  it('labels each row with its type and a grouped count', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Work on a phase plan was assigned to me')).toBeTruthy();
    expect(view.getByText('×3')).toBeTruthy();
  });

  it('marks a row read on the server and follows its link', async () => {
    const onOpenLink = jest.fn();
    const view = await renderScreen(onOpenLink);
    await view.findByText('A ticket is yours');

    await fireEvent.press(
      view.getByLabelText('Unread. A ticket is yours. A ticket was routed to me'),
    );

    expect(onOpenLink).toHaveBeenCalledWith(`/tickets/${TICKET}`);
    await waitFor(() =>
      expect(paths()).toContain('http://localhost:3000/api/v1/notifications/n1/read'),
    );
  });

  it('opens a phase-plan alert on the project summary', async () => {
    const onOpenLink = jest.fn();
    const view = await renderScreen(onOpenLink);

    await fireEvent.press(await view.findByText('Assigned to you on ACME'));

    expect(onOpenLink).toHaveBeenCalledWith(`/projects/${PROJECT}/summary`);
  });

  it('marks everything read and clears the badge at once', async () => {
    const view = await renderScreen();
    await view.findByText('A ticket is yours');

    respond({ items: [], nextCursor: null, unreadCount: 0 }, { ...ALL, unreadCount: 0 });
    await fireEvent.press(view.getByText('Mark all read'));

    await waitFor(() => expect(paths().some((path) => path.endsWith('/read-all'))).toBe(true));
    expect(view.client.getQueryData(UNREAD_COUNT_KEY)).toBe(0);
    expect(await view.findByText('You are all caught up')).toBeTruthy();
  });
});
