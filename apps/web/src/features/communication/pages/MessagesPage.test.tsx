import { ROLE_KEYS, type ConversationDetail, type ConversationSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { MessagesPage } from './MessagesPage';

/**
 * The messages screen, reached the way a notification reaches it.
 *
 * `conversationLink` has built `/messages/:id` for a direct message and a group since package 9b,
 * and until this branch the route did not exist — so every one of those notifications landed on a
 * screen that dropped the id and opened nothing. That is what this file is mostly about: the link
 * in the bell menu opens the thread it names.
 */

const CONVERSATION = 'c1e6f0a2-0e4a-4f1a-9a3c-2b7d8e9f0a11';

const SUMMARY: ConversationSummary = {
  id: CONVERSATION,
  kind: 'GROUP',
  title: 'Release crew',
  project: null,
  task: null,
  ticket: null,
  counterpart: null,
  imageFileId: null,
  lastMessageAt: '2026-09-13T09:00:00.000Z',
  lastMessagePreview: 'Cutting the build tonight',
  unreadCount: 2,
  createdAt: '2026-09-13T08:00:00.000Z',
};

const DETAIL: ConversationDetail = {
  ...SUMMARY,
  participants: [],
  abilities: {
    canPost: true,
    canCall: false,
    canPlayRecording: false,
    canManage: false,
    canLeave: true,
    viaOversight: false,
    reason: null,
  },
};

function renderAt(path: string) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = bodyFor(url);
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:conversationId" element={<MessagesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The screen reads several endpoints; one canned body would make every assertion accidental. */
function bodyFor(url: string): unknown {
  if (url.includes('/notifications')) {
    // The mention badge is read from the viewer's own unread notifications — there is no mention
    // count on `ConversationSummary`, and the notification is the fact the server actually wrote.
    return { items: [], nextCursor: null, unreadCount: 0 };
  }
  if (url.includes('/messages')) {
    return { items: [], nextCursor: null };
  }
  if (url.includes('/audience') || url.includes('/calls')) {
    return [];
  }
  if (url.includes(CONVERSATION)) {
    return DETAIL;
  }
  return [SUMMARY];
}

describe('MessagesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the conversation named in the path, which is where a notification points', async () => {
    renderAt(`/messages/${CONVERSATION}`);
    // The thread's own composer, rather than the list row of the same name.
    expect(await screen.findByLabelText('Write a message')).toBeInTheDocument();
  });

  it('asks somebody to pick one when the path names nothing', async () => {
    renderAt('/messages');
    expect(await screen.findByText('Pick a conversation')).toBeInTheDocument();
    expect(screen.queryByLabelText('Write a message')).not.toBeInTheDocument();
  });

  it('shows the unread conversation as unread in the list', async () => {
    renderAt('/messages');
    expect(await screen.findByLabelText('2 unread')).toBeInTheDocument();
  });
});
