import {
  ROLE_KEYS,
  type ConversationDetail,
  type NotificationEvent,
  type NotificationSummary,
} from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { MemoryRouter, useLocation } from 'react-router';

import { RealtimeSocketContext } from '../../../app/providers/realtime-socket-context';
import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { LiveMessageToasts } from './LiveMessageToasts';

/**
 * The bottom-right stack.
 *
 * The property worth holding is the sharp one: the socket delivers what was true when the event
 * was sent, and somebody can be taken off a project between the send and the delivery. So the
 * conversation is re-read before anything is drawn, the card's text comes from *that* response,
 * and a refusal means no card at all. The other three tests are the ordinary ones — the right
 * name and context, the right destination on a click, and an unread badge that survives the card
 * going past.
 */

const CONVERSATION = 'c1e6f0a2-0e4a-4f1a-9a3c-2b7d8e9f0a11';

const DETAIL: ConversationDetail = {
  id: CONVERSATION,
  kind: 'TASK',
  title: 'Sync fix',
  project: { id: 'project-1', code: 'ACM', name: 'Acme portal' },
  task: { id: 'task-1', key: 'TK-42', title: 'Sync fix' },
  ticket: null,
  counterpart: null,
  imageFileId: null,
  lastMessageAt: '2026-09-13T09:00:00.000Z',
  lastMessagePreview: 'Cutting the build tonight',
  unreadCount: 3,
  createdAt: '2026-09-13T08:00:00.000Z',
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
};

function notification(over: Partial<NotificationSummary> = {}): NotificationSummary {
  return {
    id: 'notification-1',
    type: 'CONVERSATION_MENTION',
    title: 'Priya S mentioned you in TK-42',
    body: 'Cutting the build tonight',
    // What `conversationLink` builds for a task discussion: the work, not a chat screen.
    link: '/tasks/task-1',
    entityType: 'conversation',
    entityId: CONVERSATION,
    groupedCount: 1,
    readAt: null,
    createdAt: '2026-09-13T09:00:00.000Z',
    ...over,
  };
}

/** A socket that records its listeners so a test can deliver an event through it. */
function fakeSocket() {
  const listeners = new Map<string, (payload: NotificationEvent) => void>();
  const socket = {
    on: (event: string, handler: (payload: NotificationEvent) => void) => {
      listeners.set(event, handler);
    },
    off: (event: string) => {
      listeners.delete(event);
    },
    emit: vi.fn(),
  };
  return {
    // The context is typed as the real client's `Socket`; the three methods above are all this
    // component touches, and a full stub would assert nothing extra.
    socket: socket as unknown as Socket,
    deliver: (event: string, payload: NotificationEvent) => listeners.get(event)?.(payload),
  };
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderToasts(options: { conversation?: ConversationDetail; refuse?: boolean } = {}) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.DEVELOPER));
  const requests: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    requests.push(String(input));
    if (options.refuse) {
      return Promise.resolve({
        ok: false,
        status: 403,
        json: async () => ({ message: 'You are not on this project' }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => options.conversation ?? DETAIL,
    } as Response);
  });
  const { socket, deliver } = fakeSocket();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <RealtimeSocketContext.Provider value={socket}>
          <Where />
          <LiveMessageToasts />
        </RealtimeSocketContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { deliver, requests };
}

describe('LiveMessageToasts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the sender, the context and a preview when a message arrives', async () => {
    const { deliver } = renderToasts();

    deliver('notification.new', { notification: notification(), unreadCount: 4 });

    // The name and the preview come from the conversation the server just confirmed, not from the
    // notification: the question a moment later is what this person may read *now*.
    expect(await screen.findByText('Sync fix')).toBeInTheDocument();
    expect(screen.getByText('TK-42')).toBeInTheDocument();
    expect(screen.getByText('Cutting the build tonight')).toBeInTheDocument();
    expect(screen.getByText('Mentioned you')).toBeInTheDocument();
  });

  it('opens the conversation where it lives when the card is clicked', async () => {
    const { deliver } = renderToasts();
    deliver('notification.new', { notification: notification(), unreadCount: 4 });
    await screen.findByText('Sync fix');

    fireEvent.click(screen.getByText('Sync fix'));

    // A task discussion deep-links to the task rather than to a chat screen — the same link the
    // bell menu uses, because both come from the server's `conversationLink`.
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/tasks/task-1'));
  });

  it('shows nothing at all when the server no longer lets this person read the conversation', async () => {
    // The event was delivered because it was permitted when it was sent. Between then and now the
    // access went away, and the re-read is what catches it. Nothing is drawn from the notification
    // itself, so no preview escapes.
    const { deliver, requests } = renderToasts({ refuse: true });

    deliver('notification.new', { notification: notification(), unreadCount: 4 });

    await waitFor(() =>
      expect(requests.some((url) => url.includes(`/conversations/${CONVERSATION}`))).toBe(true),
    );
    expect(screen.queryByText('Cutting the build tonight')).not.toBeInTheDocument();
    expect(screen.queryByRole('log', { name: 'New messages' })).not.toBeInTheDocument();
  });

  it('does not mark anything read by appearing', async () => {
    const { deliver, requests } = renderToasts();

    deliver('notification.new', { notification: notification(), unreadCount: 4 });
    await screen.findByText('Sync fix');

    // The only request it makes is the authorization re-read. Marking the conversation read, or
    // the notification read, would clear the badge because a card went past.
    expect(requests).toEqual([expect.stringContaining(`/conversations/${CONVERSATION}`)]);
    expect(requests.some((url) => url.includes('/read'))).toBe(false);
  });

  it('ignores a notification that is not about a conversation', async () => {
    const { deliver, requests } = renderToasts();

    deliver('notification.new', {
      notification: notification({
        id: 'notification-2',
        type: 'TASK_ASSIGNED',
        entityType: 'task',
        entityId: 'task-1',
      }),
      unreadCount: 4,
    });

    await waitFor(() => expect(requests).toHaveLength(0));
    expect(screen.queryByText('Sync fix')).not.toBeInTheDocument();
  });
});
