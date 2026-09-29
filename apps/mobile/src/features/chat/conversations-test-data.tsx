import type {
  ConversationSummary,
  MessagingScopeContact,
  NotificationListResponse,
} from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ConversationsScreen, type ConversationsScreenProps } from './ConversationsScreen';

/** Shared by the conversation-list tests, which are split in two to stay readable. */

export const fetchMock = jest.fn();

export function summary(over: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    kind: 'SCOPE_DIRECT',
    title: 'Direct message',
    project: null,
    task: null,
    ticket: null,
    counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    lastMessagePreview: 'Morning',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

export const ROWS: ConversationSummary[] = [
  summary({ id: 'a' }),
  summary({
    id: 'b',
    kind: 'GROUP',
    title: 'Release crew',
    counterpart: null,
    unreadCount: 3,
    lastMessagePreview: 'Cutting the build tonight',
  }),
];

export const NO_NOTIFICATIONS: NotificationListResponse = {
  items: [],
  nextCursor: null,
  unreadCount: 0,
};

export const OLIVER: MessagingScopeContact = {
  id: 'oliver',
  name: 'Oliver K',
  email: 'oliver@example.com',
  reason: 'On your team',
  conversationId: null,
};

export function respond(
  options: {
    rows?: ConversationSummary[];
    inbox?: NotificationListResponse;
    directory?: MessagingScopeContact[];
    oversight?: ConversationSummary[];
  } = {},
) {
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.includes('/notifications')) {
      return Promise.resolve(jsonResponse(options.inbox ?? NO_NOTIFICATIONS));
    }
    if (path.includes('/conversations/directory')) {
      return Promise.resolve(jsonResponse(options.directory ?? []));
    }
    if (path.includes('/oversight/conversations')) {
      return Promise.resolve(jsonResponse(options.oversight ?? []));
    }
    if (path.includes('/oversight/calls')) {
      return Promise.resolve(jsonResponse([]));
    }
    return Promise.resolve(jsonResponse(options.rows ?? ROWS));
  });
}

export function renderList(props: Partial<ConversationsScreenProps> = {}): Promise<RenderResult> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <ConversationsScreen onOpen={jest.fn()} {...props} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

/** The conversation-list requests only, with their query strings. The directory is its own. */
export function conversationCalls(): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/conversations') && !url.includes('/conversations/directory'));
}

export function installFetch() {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  respond();
}
