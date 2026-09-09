import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { setAuthenticated } from '../../auth/session-store';
import { sessionUserFor } from '../../../test/fixtures';
import { NotificationBell } from './NotificationBell';

function renderBell(unreadCount: number) {
  setAuthenticated('test-token', sessionUserFor('SUPER_ADMIN'));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ unreadCount }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell to="/notifications" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the unread count from the API', async () => {
    renderBell(3);
    expect(await screen.findByTestId('unread-count')).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('shows no badge when everything is read', async () => {
    renderBell(0);
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByTestId('unread-count')).not.toBeInTheDocument();
  });
});
