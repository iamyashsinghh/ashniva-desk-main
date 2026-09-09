import { ROLE_KEYS, type NotificationListResponse, type NotificationSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { NotificationsPage } from './NotificationsPage';

/**
 * The inbox, and the half of it that was missing: the endpoint has always answered with a
 * `nextCursor` and the screen never sent one back, so everything past the first page was
 * unreachable. The assertion is on the request the screen makes, not only on what it renders —
 * a screen that shows fifty rows looks identical whether or not the rest exist.
 */

function notification(id: string): NotificationSummary {
  return {
    id,
    type: 'TICKET_REPLY',
    title: `Notification ${id}`,
    body: null,
    link: null,
    entityType: null,
    entityId: null,
    groupedCount: 1,
    readAt: null,
    createdAt: '2026-09-07T04:00:00.000Z',
  };
}

function page(ids: string[], nextCursor: string | null): NotificationListResponse {
  return { items: ids.map(notification), nextCursor, unreadCount: ids.length };
}

function renderPage(pages: NotificationListResponse[]) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const urls: string[] = [];
  let served = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/notifications/preferences')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          entries: [],
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          timezone: 'UTC',
        }),
      } as Response);
    }
    const body = pages[Math.min(served, pages.length - 1)];
    served += 1;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/notifications?tab=inbox&filter=all']}>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return urls;
}

describe('NotificationsPage paging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks for the next page with the cursor the API returned, and stops when it ends', async () => {
    const urls = renderPage([page(['a', 'b'], 'cursor-b'), page(['c'], null)]);

    expect(await screen.findByText('Notification a')).toBeInTheDocument();
    const older = screen.getByRole('button', { name: 'Load older notifications' });
    // The first request carries no cursor; there is nothing to page from yet.
    expect(urls.some((url) => url.includes('cursor='))).toBe(false);

    fireEvent.click(older);

    await waitFor(() => expect(screen.getByText('Notification c')).toBeInTheDocument());
    expect(urls.some((url) => url.includes('cursor=cursor-b'))).toBe(true);
    // Both pages are on screen, and the last page ended the list.
    expect(screen.getByText('Notification a')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Load older notifications' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('offers nothing to load when the first page is the whole inbox', async () => {
    renderPage([page(['a'], null)]);

    expect(await screen.findByText('Notification a')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load older notifications' }),
    ).not.toBeInTheDocument();
  });
});
