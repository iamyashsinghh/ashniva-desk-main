import type { NotificationEvent, NotificationSummary } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { setReadingConversation, stopReadingConversation } from './active-conversation';
import { LiveMessageToasts } from './LiveMessageToasts';

/**
 * The message cards: shown only for a conversation the server still lets the reader open, never
 * for the one on screen, and opened through the navigator's callback.
 */

let emit: ((event: NotificationEvent) => void) | null = null;
jest.mock('../../shared/realtime/RealtimeProvider', () => ({
  useRealtimeEvent: (_event: string, handler: (event: NotificationEvent) => void) => {
    emit = handler;
  },
}));

const fetchMock = jest.fn();

const NOTIFICATION: NotificationSummary = {
  id: 'n1',
  type: 'CONVERSATION_MESSAGE',
  title: 'New message from Priya S',
  body: null,
  link: '/messages/c1',
  entityType: 'conversation',
  entityId: 'c1',
  groupedCount: 1,
  readAt: null,
  createdAt: '2026-09-13T09:00:00.000Z',
};

const DETAIL = {
  id: 'c1',
  kind: 'SCOPE_DIRECT',
  title: 'Direct message',
  project: null,
  task: null,
  ticket: null,
  counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
  imageFileId: null,
  lastMessageAt: '2026-09-13T09:00:00.000Z',
  lastMessagePreview: 'Can you look at the build?',
  unreadCount: 1,
  createdAt: '2026-09-13T08:00:00.000Z',
  participants: [],
};

async function renderToasts(onOpenConversation = jest.fn()) {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <LiveMessageToasts onOpenConversation={onOpenConversation} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return onOpenConversation;
}

async function arrive(notification: NotificationSummary = NOTIFICATION) {
  await act(async () => {
    emit?.({ notification, unreadCount: 1 });
  });
}

describe('LiveMessageToasts', () => {
  beforeEach(() => {
    emit = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(DETAIL)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('shows a card once the conversation is re-read, and opens it on a tap', async () => {
    const onOpen = await renderToasts();

    await arrive();

    const card = await screen.findByLabelText('Priya S: Can you look at the build?');
    await fireEvent.press(card);
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('shows nothing for the conversation already on screen', async () => {
    await renderToasts();
    setReadingConversation('c1');

    await arrive();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('New messages')).toBeNull();
    stopReadingConversation('c1');
  });

  it('shows nothing when the server refuses the conversation', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ message: 'Forbidden' }, 403)),
    );
    await renderToasts();

    await arrive();

    expect(screen.queryByLabelText('New messages')).toBeNull();
  });

  it('ignores notifications that are not about a message', async () => {
    await renderToasts();

    await arrive({ ...NOTIFICATION, type: 'TASK_ASSIGNED', entityType: 'task' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes a card down when it is dismissed', async () => {
    await renderToasts();
    await arrive();

    await fireEvent.press(await screen.findByLabelText('Dismiss the message from Priya S'));

    expect(screen.queryByLabelText('New messages')).toBeNull();
  });
});
