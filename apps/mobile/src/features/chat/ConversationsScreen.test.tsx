import type { ConversationSummary, NotificationListResponse } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ConversationsScreen } from './ConversationsScreen';

/**
 * The conversation list on the phone.
 *
 * Properties worth holding. It does not fan out: every field a row draws is on the summary the
 * list endpoint returned, so opening this screen is one request for the conversations however many
 * somebody has, plus one for the unread notifications — which is where a mention badge can be
 * known from, and is one request for the whole list rather than one per row. It finds things
 * locally, so search works with no signal. And the chips narrow on the server where the endpoint
 * can express the chip and on the device where it cannot.
 */

/**
 * `useFocusEffect` needs a navigator above it, and this screen is rendered here on its own.
 *
 * A no-op double rather than one that runs the effect: all the real one does is refresh, which
 * React Query already does on mount, and refresh-on-return is the navigator's behaviour rather
 * than this file's subject. Leaving it inert also keeps the request counts meaningful.
 */
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));

const fetchMock = jest.fn();

function summary(over: Partial<ConversationSummary> & { id: string }): ConversationSummary {
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

const ROWS: ConversationSummary[] = [
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

const NO_NOTIFICATIONS: NotificationListResponse = { items: [], nextCursor: null, unreadCount: 0 };

/** A mention of the reader, waiting in the group. This is what puts the `@ you` badge on a row. */
const MENTION_IN_GROUP: NotificationListResponse = {
  items: [
    {
      id: 'n1',
      type: 'CONVERSATION_MENTION',
      title: 'Priya S mentioned you',
      body: 'Ready @someone?',
      link: '/conversations/b',
      entityType: 'conversation',
      entityId: 'b',
      groupedCount: 1,
      readAt: null,
      createdAt: '2026-09-13T09:00:00.000Z',
    },
  ],
  nextCursor: null,
  unreadCount: 1,
};

function respond(options: { rows?: ConversationSummary[]; inbox?: NotificationListResponse } = {}) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes('/notifications')
        ? jsonResponse(options.inbox ?? NO_NOTIFICATIONS)
        : jsonResponse(options.rows ?? ROWS),
    ),
  );
}

function renderList(props: { onStart?: () => void; personalChat?: boolean } = {}): Promise<RenderResult> {
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

/** The conversation requests only, with their query strings. */
function conversationCalls(): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/conversations'));
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  respond();
});

describe('ConversationsScreen', () => {
  it('draws every row without asking about a single conversation', async () => {
    const view = await renderList();
    await view.findByText('Release crew');

    const perConversation = conversationCalls().filter((url) =>
      /\/conversations\/[^/?]+/.test(url),
    );
    expect(perConversation).toHaveLength(0);
  });

  it('says how many are unread, out loud as well as on the row', async () => {
    const view = await renderList();
    expect(await view.findByText('3 unread')).toBeTruthy();
    expect(view.getByLabelText('Release crew, 3 unread')).toBeTruthy();
  });

  it('badges the conversation somebody was mentioned in', async () => {
    respond({ inbox: MENTION_IN_GROUP });
    const view = await renderList();

    expect(await view.findByText('@ you')).toBeTruthy();
    expect(view.getByLabelText('Release crew, mentions you, 3 unread')).toBeTruthy();
    // The other row is not badged: a badge on everything says nothing.
    expect(view.getByLabelText('Priya S')).toBeTruthy();
  });

  it('finds a conversation by its preview, without another request', async () => {
    const view = await renderList();
    await view.findByText('Release crew');
    const before = fetchMock.mock.calls.length;

    await fireEvent.changeText(view.getByLabelText('Search your conversations'), 'tonight');

    expect(view.getByText('Release crew')).toBeTruthy();
    expect(view.queryByText('Priya S')).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('narrows on the server for a chip the endpoint can express', async () => {
    const view = await renderList();
    await view.findByText('Release crew');

    await fireEvent.press(view.getByLabelText('Groups conversations'));

    expect(conversationCalls().some((url) => url.includes('kind=GROUP'))).toBe(true);
  });

  it('narrows on the device for Direct, which is two kinds and one parameter', async () => {
    const view = await renderList();
    await view.findByText('Release crew');
    const before = conversationCalls().length;

    await fireEvent.press(view.getByLabelText('Direct conversations'));

    // `kind` takes one value; sending `DIRECT` would quietly drop every `SCOPE_DIRECT` row, so
    // the chip filters the window already on the device instead.
    expect(conversationCalls().some((url) => url.includes('kind=DIRECT'))).toBe(false);
    expect(conversationCalls().length).toBe(before);
    expect(view.getByText('Priya S')).toBeTruthy();
    expect(view.queryByText('Release crew')).toBeNull();
  });

  it('says nothing matches the filter rather than claiming there are no conversations', async () => {
    respond({ rows: [summary({ id: 'a' })] });
    const view = await renderList();
    await view.findByText('Priya S');

    await fireEvent.press(view.getByLabelText('Unread conversations'));

    expect(await view.findByText('Nothing here')).toBeTruthy();
  });

  it('shows the empty state when there is nothing at all', async () => {
    respond({ rows: [] });
    const view = await renderList();
    expect(await view.findByText('No conversations')).toBeTruthy();
  });

  it('shows the API’s own words when the list fails, with a way to try again', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/notifications')
          ? jsonResponse(NO_NOTIFICATIONS)
          : jsonResponse({ message: 'Internal chat is switched off' }, 403),
      ),
    );
    const view = await renderList();

    expect(await view.findByText('Internal chat is switched off')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('offers a way to start one, now that a direct message is not opened from a project', async () => {
    const onStart = jest.fn();
    const view = await renderList({ onStart });
    await fireEvent.press(await view.findByRole('button', { name: 'New conversation' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('offers no such button to somebody with no internal chat at all', async () => {
    // A client. The API refuses them at the first check of every route on that controller, and a
    // button that answers 403 is worse than no button.
    const view = await renderList();
    await view.findByText('Release crew');
    expect(view.queryByRole('button', { name: 'New conversation' })).toBeNull();
  });

  it('hides people and the Direct chip when personal chat is off', async () => {
    const view = await renderList({ personalChat: false });
    expect(await view.findByText('Release crew')).toBeTruthy();
    expect(view.queryByText('Priya S')).toBeNull();
    expect(view.queryByLabelText('Direct conversations')).toBeNull();
  });
});
