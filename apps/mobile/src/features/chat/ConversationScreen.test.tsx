import type { ConversationDetail, MessagePage, MessageSummary } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, sessionUser, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ConversationScreen } from './ConversationScreen';

/**
 * One thread, end to end.
 *
 * What is proved here is the screen's behaviour around the edges rather than its layout.
 *
 * **No delete affordance, for anybody.** `DELETE /conversations/:id/messages/:id` refuses everyone
 * without `conversation:inspect` — the sender included — with the same sentence a bystander gets,
 * so the sender's own message carries `canDelete: false` and there is nothing to draw. Hiding a
 * control is never the control; this asserts the app does not offer a door that is bolted.
 *
 * **A 404 is not shouted about.** An unrelated caller is answered 404 rather than 403 on purpose,
 * because a 403 would confirm that a task has a discussion at all. So it reads as "not there for
 * you", with no retry button to ask the same question again.
 */

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));

jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ user: mockViewer, status: 'signed-in', can: () => false }),
}));

const mockViewer = sessionUser();

const fetchMock = jest.fn();
const CONVERSATION = '33333333-3333-4333-8333-333333333333';

function ownMessage(): MessageSummary {
  return {
    id: 'm1',
    conversationId: CONVERSATION,
    sender: { id: mockViewer.id, name: mockViewer.name, email: mockViewer.email },
    body: 'Mine, and it stays',
    systemKind: null,
    attachments: [],
    createdAt: new Date('2026-09-13T09:00:00').toISOString(),
    editedAt: null,
    deletedAt: null,
    // The server's own answer, and for a normal user it is false even on their own message.
    canEdit: true,
    canDelete: false,
  };
}

const DETAIL: ConversationDetail = {
  id: CONVERSATION,
  kind: 'SCOPE_DIRECT',
  title: 'Direct message',
  project: null,
  task: null,
  ticket: null,
  counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
  imageFileId: null,
  lastMessageAt: '2026-09-13T09:00:00.000Z',
  lastMessagePreview: 'Mine, and it stays',
  unreadCount: 0,
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

function serve(options: { detail?: () => Response; page?: MessagePage } = {}) {
  const page: MessagePage = options.page ?? { items: [ownMessage()], nextCursor: null };
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.includes('/messages')) {
      return Promise.resolve(jsonResponse(page));
    }
    if (path.includes('/read')) {
      return Promise.resolve(jsonResponse({}));
    }
    return Promise.resolve(options.detail ? options.detail() : jsonResponse(DETAIL));
  });
}

function renderConversation(): Promise<RenderResult> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <ConversationScreen conversationId={CONVERSATION} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  serve();
});

describe('ConversationScreen', () => {
  it('draws the thread and the composer together', async () => {
    const view = await renderConversation();
    expect(await view.findByText('Mine, and it stays')).toBeTruthy();
    expect(view.getByLabelText('Your message')).toBeTruthy();
    expect(view.getByText('Priya S')).toBeTruthy();
  });

  it('opens on three requests, whatever the thread holds', async () => {
    const many = Array.from({ length: 50 }, (_, index) => ({
      ...ownMessage(),
      id: `m${index}`,
      body: `Line ${index}`,
      sender: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    }));
    serve({ page: { items: many, nextCursor: 'older' } });
    const view = await renderConversation();
    await view.findByText('Line 49');

    // The conversation, its first page of messages, and the read cursor. Nothing per message and
    // nothing per sender: a request per line is what a thread of a thousand would turn into.
    const paths = new Set(fetchMock.mock.calls.map(([url]) => String(url).split('?')[0]));
    expect(paths.size).toBe(3);
  });

  it('offers no way to withdraw a message, not even your own', async () => {
    const view = await renderConversation();
    await view.findByText('Mine, and it stays');

    expect(view.queryByRole('button', { name: /withdraw/i })).toBeNull();
    expect(view.queryByRole('button', { name: /delete/i })).toBeNull();
    expect(view.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('says a thread is empty rather than showing a blank screen', async () => {
    serve({ page: { items: [], nextCursor: null } });
    const view = await renderConversation();
    expect(await view.findByText(/Nothing said yet/)).toBeTruthy();
    // The composer is still there: the first message in an empty thread is somebody's to write.
    expect(view.getByLabelText('Your message')).toBeTruthy();
  });

  it('treats a 404 as “not there for you”, with nothing to retry', async () => {
    serve({ detail: () => jsonResponse({ message: 'Conversation not found' }, 404) });
    const view = await renderConversation();

    expect(await view.findByText('This conversation is not available to you.')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows the API’s own words for any other failure, and offers to try again', async () => {
    serve({ detail: () => jsonResponse({ message: 'Internal chat is switched off' }, 403) });
    const view = await renderConversation();

    expect(await view.findByText('Internal chat is switched off')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
