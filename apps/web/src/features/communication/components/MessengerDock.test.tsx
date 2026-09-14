import { ROLE_KEYS, type ConversationSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAnonymous, setAuthenticated } from '../../auth/session-store';
import { MessengerProvider } from '../messenger-context';
import { MessengerDock } from './MessengerDock';

/**
 * The corner messenger.
 *
 * The properties worth holding: people who cannot chat do not see it, the bubble carries the
 * unread total from the list endpoint (not a second counter), and opening a row opens that
 * conversation in the popup rather than navigating away.
 */

function summary(over: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    kind: 'SCOPE_DIRECT',
    title: 'Direct message',
    project: null,
    task: null,
    ticket: null,
    counterpart: { id: 'user-priya', name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    lastMessagePreview: 'Morning',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

const ROWS: ConversationSummary[] = [
  summary({ id: 'a', unreadCount: 2 }),
  summary({
    id: 'b',
    kind: 'GROUP',
    title: 'Release crew',
    counterpart: null,
    unreadCount: 3,
    lastMessagePreview: 'Cutting the build tonight',
  }),
];

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

function renderDock(role: (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS] = ROLE_KEYS.PROJECT_MANAGER) {
  setAuthenticated('test-token', sessionUserFor(role, role.startsWith('CLIENT')));
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/notifications')) {
      return json({ items: [], nextCursor: null, unreadCount: 0 });
    }
    if (url.includes('/conversations/directory')) {
      return json([]);
    }
    if (url.includes('/conversations/b/messages')) {
      return json({ items: [], nextCursor: null });
    }
    if (url.includes('/conversations/b/audience')) {
      return json([]);
    }
    if (url.includes('/conversations/b/read')) {
      return json(null);
    }
    if (url.includes('/conversations/b')) {
      return json({
        ...ROWS[1],
        participants: [],
        abilities: {
          canPost: true,
          canCall: false,
          canPlayRecording: false,
          canManage: false,
          canLeave: false,
          viaOversight: false,
          reason: null,
        },
      });
    }
    if (url.includes('/conversations')) {
      return json(ROWS);
    }
    return json([]);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessengerProvider>
          <MessengerDock />
        </MessengerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MessengerDock', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setAnonymous();
  });

  it('is hidden for people who cannot participate in internal chat', () => {
    renderDock(ROLE_KEYS.CLIENT_ADMIN);
    expect(screen.queryByRole('button', { name: /Messages/ })).not.toBeInTheDocument();
  });

  it('shows the unread total on the bubble', async () => {
    renderDock();
    expect(await screen.findByRole('button', { name: 'Messages, 5 unread' })).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('opens the inbox and a conversation without leaving the page', async () => {
    renderDock();
    fireEvent.click(await screen.findByRole('button', { name: 'Messages, 5 unread' }));

    expect(await screen.findByRole('region', { name: 'Chats' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Release crew'));

    expect(await screen.findByRole('region', { name: 'Open conversation' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Release crew' })).toBeInTheDocument(),
    );
  });
});
