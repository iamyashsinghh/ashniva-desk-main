import {
  ROLE_KEYS,
  type ConversationAudienceMember,
  type ConversationDetail,
  type ConversationKind,
  type MessagePage,
  type MessageSummary,
} from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { ConversationView } from './ConversationPanel';

/**
 * The chat panel, and the line it draws.
 *
 * Every control here renders a decision the server already made and sent back as `abilities` or,
 * for editing and deleting, on the message itself. So the tests are about that: a person the
 * policy will refuse gets a composer that says so rather than one that fails when pressed, a
 * message somebody else wrote offers them nothing to press, and an administrator reading somebody
 * else's conversation is told, on screen, that the access was recorded.
 */

// Real uuids, because a mention is written as `@[uuid]` and the grammar deliberately accepts
// nothing else — a fixture with a friendly id would silently stop being a mention at all.
const LEAD = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const DEV = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';

function conversationFixture(over: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 'conversation-1',
    kind: 'DIRECT',
    title: 'Direct',
    project: { id: 'project-1', code: 'ACM', name: 'Acme portal' },
    task: null,
    ticket: null,
    counterpart: { id: LEAD, name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    lastMessagePreview: 'Morning',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    participants: [],
    abilities: {
      canPost: true,
      canCall: true,
      canPlayRecording: false,
      canManage: false,
      canLeave: false,
      viaOversight: false,
      reason: null,
    },
    ...over,
  };
}

/** A conversation the server has said no to, in one way or another. */
function refused(over: Partial<ConversationDetail['abilities']>): ConversationDetail {
  return conversationFixture({
    abilities: {
      canPost: false,
      canCall: false,
      canPlayRecording: false,
      canManage: false,
      canLeave: false,
      viaOversight: false,
      reason: null,
      ...over,
    },
  });
}

function messageFixture(over: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    sender: { id: LEAD, name: 'Priya S', email: 'priya@example.com' },
    body: 'Morning — is the sync fix ready to test?',
    systemKind: null,
    attachments: [],
    createdAt: '2026-09-13T09:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

const audienceFixture: ConversationAudienceMember[] = [
  { id: LEAD, name: 'Priya S', email: 'priya@example.com', projectRole: 'LEAD' },
  { id: DEV, name: 'Dev One', email: 'dev@example.com', projectRole: 'DEVELOPER' },
];

const defaultMessages: MessagePage = {
  items: [
    messageFixture(),
    messageFixture({
      id: 'message-2',
      sender: null,
      body: 'A call was started',
      systemKind: 'CALL_STARTED',
      createdAt: '2026-09-13T09:05:00.000Z',
    }),
  ],
  nextCursor: null,
};

/**
 * One stub answering by URL.
 *
 * The panel reads four endpoints — the conversation, its messages, its audience and its calls —
 * and a single canned body would make every assertion here accidental.
 *
 * What the composer itself does with a draft is `MessageComposer.test.tsx`'s subject, and what a
 * mention looks like once rendered is `MessageBody.test.tsx`'s; this file is about the panel
 * assembling them and rendering the server's answers.
 */
function renderPanel(
  conversation: ConversationDetail,
  options: {
    roleKey?: string;
    kind?: ConversationKind;
    messages?: MessagePage;
    audience?: ConversationAudienceMember[];
  } = {},
) {
  setAuthenticated('test-token', {
    ...sessionUserFor((options.roleKey ?? ROLE_KEYS.DEVELOPER) as never),
    id: DEV,
  });
  const bodyFor = (url: string): unknown => {
    if (url.includes('/messages')) return options.messages ?? defaultMessages;
    if (url.includes('/audience')) return options.audience ?? audienceFixture;
    if (url.includes('/calls')) return [];
    return conversation;
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const body = bodyFor(String(input));
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConversationView conversationId="conversation-1" kind={options.kind ?? 'DIRECT'} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConversationView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the thread', async () => {
    renderPanel(conversationFixture());
    expect(await screen.findByText(/is the sync fix ready to test/)).toBeInTheDocument();
  });

  it('renders a call starting as the system’s own note rather than as somebody’s message', async () => {
    renderPanel(conversationFixture());
    const systemLine = await screen.findByText('A call was started');
    expect(systemLine.closest('li')).toHaveClass('chat-message--system');
  });

  it('offers the composer when the server says this person may post', async () => {
    renderPanel(conversationFixture());
    await waitFor(() => expect(screen.getByLabelText('Write a message')).toBeEnabled());
  });

  it('disables the composer when the server says they may not', async () => {
    renderPanel(refused({ canPost: false, reason: 'NOT_ON_PROJECT' }));
    await waitFor(() => expect(screen.getByLabelText('Write a message')).toBeDisabled());
  });

  it('tells an administrator that reading this was recorded', async () => {
    renderPanel(refused({ viaOversight: true, reason: 'OVERSIGHT_IS_READ_ONLY' }), {
      roleKey: ROLE_KEYS.SUPER_ADMIN,
    });
    expect(await screen.findByText(/This access has been recorded/)).toBeInTheDocument();
  });

  it('does not offer a call when the server refused it', async () => {
    renderPanel(refused({ canPost: true, reason: 'CALLING_DISABLED' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Call' })).toBeDisabled());
  });

  it('offers a call in a project thread when the server says it may, rather than hiding it', async () => {
    // The button used to be `canCall && isDirect`, which was a second opinion held locally and
    // one that disagreed with the very ability it claimed to render.
    //
    // The label is "Call somebody" rather than "Call" because the header now reads the kind off
    // the conversation the server returned instead of the `kind` prop, which is only a guess made
    // before the detail arrives. A project channel does not know whose telephone should ring, so
    // it asks — and this fixture is a project channel.
    renderPanel(conversationFixture({ kind: 'PROJECT' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Call somebody' })).toBeEnabled(),
    );
  });

  // Per-message controls — what Edit and Withdraw are offered on, and to whom — are
  // `MessageItem.test.tsx`. They are decisions the server sends per message, and testing them
  // through four stubbed endpoints proved less and broke more.

  it('offers "load earlier" only while the server says there is more thread', async () => {
    const { unmount } = renderPanel(conversationFixture());
    await screen.findByText(/is the sync fix ready to test/);
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
    unmount();

    renderPanel(conversationFixture(), {
      messages: { items: [messageFixture({ body: 'Newest page' })], nextCursor: 'message-0' },
    });
    await screen.findByText('Newest page');
    expect(screen.getByRole('button', { name: 'Load earlier messages' })).toBeInTheDocument();
  });

  it('pages the thread when somebody asks for the history behind it', async () => {
    renderPanel(conversationFixture(), {
      messages: { items: [messageFixture({ body: 'Newest page' })], nextCursor: 'message-0' },
    });
    await screen.findByText('Newest page');

    // The stub answers every `/messages` request with the same page, so what is asserted is that
    // pressing the control issues the next request with the cursor the server handed back.
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }));

    await waitFor(() => {
      const urls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('cursor=message-0'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Calling, which stays project-anchored
  // -------------------------------------------------------------------------------------------

  it('offers no call on a scope conversation, and says where calls come from instead', async () => {
    // The API refuses a call from a conversation with no project outright. `abilities.canCall` can
    // still be true there, so a button rendered from it alone would have been one that always
    // failed.
    renderPanel(conversationFixture({ kind: 'GROUP', project: null, counterpart: null }), {
      kind: 'GROUP',
    });

    expect(await screen.findByText(/Calls are placed from a project conversation/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Call' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call somebody' })).not.toBeInTheDocument();
  });
});
