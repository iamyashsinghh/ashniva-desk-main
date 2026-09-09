import type {
  ConversationDetail,
  ConversationParticipant,
  MessagingScopeContact,
} from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { GroupScreen } from './GroupScreen';

/**
 * Managing a group from the phone.
 *
 * Every control is `abilities.canManage` or `abilities.canLeave`, both computed on the server. So
 * the tests are that correspondence: an ordinary member is offered the way out and nothing else,
 * an administrator is offered the rest, the owner has no Remove button because the API refuses
 * that one, and each control sends the request the API documents.
 */

const fetchMock = jest.fn();

const OWNER = 'owner-1';
const MEMBER = 'member-1';
const OUTSIDER = 'outsider-1';

const DIRECTORY: MessagingScopeContact[] = [
  {
    id: OUTSIDER,
    name: 'Ravi K',
    email: 'ravi@example.com',
    reason: 'You manage the Acme portal project',
    conversationId: null,
  },
];

function participant(over: Partial<ConversationParticipant> & { id: string; name: string }) {
  return {
    email: `${over.id}@example.com`,
    projectRole: null,
    memberRole: 'MEMBER',
    lastReadAt: null,
    joinedAt: '2026-09-13T08:00:00.000Z',
    leftAt: null,
    ...over,
  } as ConversationParticipant;
}

function group(over: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 'conversation-1',
    kind: 'GROUP',
    title: 'Release crew',
    project: null,
    task: null,
    ticket: null,
    counterpart: null,
    imageFileId: null,
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    lastMessagePreview: 'Cutting the build tonight',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    participants: [
      participant({ id: OWNER, name: 'Priya S', memberRole: 'OWNER' }),
      participant({ id: MEMBER, name: 'Dev One' }),
      participant({ id: 'gone-1', name: 'Sam Left', leftAt: '2026-09-12T08:00:00.000Z' }),
    ],
    abilities: {
      canPost: true,
      canCall: false,
      canPlayRecording: false,
      canManage: true,
      canLeave: true,
      viaOversight: false,
      reason: null,
    },
    ...over,
  };
}

/** See `TaskActions.test.tsx`: a client that keeps nothing, so the jest worker can exit. */
function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

function answerWith(conversation: ConversationDetail) {
  fetchMock.mockImplementation((input: unknown) => {
    const url = String(input);
    const body = url.includes('/directory') ? DIRECTORY : conversation;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    } as unknown as Response);
  });
}

function renderGroup(conversation: ConversationDetail, onLeft = jest.fn()): Promise<RenderResult> {
  answerWith(conversation);
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testClient()}>
        <GroupScreen conversationId="conversation-1" onLeft={onLeft} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

/** The last request that was not a directory read, with its method and body. */
function lastWrite(): { url: string; method: string; body: unknown } | null {
  for (let index = fetchMock.mock.calls.length - 1; index >= 0; index -= 1) {
    const [url, init] = fetchMock.mock.calls[index] as [unknown, RequestInit | undefined];
    if (init?.method && init.method !== 'GET') {
      return {
        url: String(url),
        method: init.method,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      };
    }
  }
  return null;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('GroupScreen', () => {
  it('counts the people still in the group and keeps the one who left, marked', async () => {
    const view = await renderGroup(group());
    expect(await view.findByText('2 members')).toBeTruthy();
    expect(view.getByText('Sam Left · left')).toBeTruthy();
  });

  it('renames the group through PATCH on the conversation', async () => {
    const view = await renderGroup(group());
    await fireEvent.changeText(await view.findByLabelText('Group name'), 'Release crew II');
    await fireEvent.press(view.getByRole('button', { name: 'Rename' }));

    await waitFor(() =>
      expect(lastWrite()).toEqual(
        expect.objectContaining({ method: 'PATCH', body: { title: 'Release crew II' } }),
      ),
    );
  });

  it('adds somebody from the messaging directory, which is what the API accepts', async () => {
    const view = await renderGroup(group());
    await fireEvent.changeText(await view.findByLabelText('Find somebody to add'), 'Ravi');
    await fireEvent.press(await view.findByRole('button', { name: 'Add Ravi K' }));

    await waitFor(() => expect(lastWrite()).not.toBeNull());
    const write = lastWrite();
    expect(write?.url).toContain('/conversations/conversation-1/members');
    expect(write?.body).toEqual({ userId: OUTSIDER });
  });

  it('removes an ordinary member and never the owner', async () => {
    const view = await renderGroup(group());
    await view.findByText('2 members');

    expect(view.queryByRole('button', { name: 'Remove Priya S' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Remove Dev One' }));

    await waitFor(() => expect(lastWrite()?.method).toBe('DELETE'));
    expect(lastWrite()?.url).toContain(`/members/${MEMBER}`);
  });

  it('lets somebody leave, and tells the stack so it can go back past the thread', async () => {
    const onLeft = jest.fn();
    const view = await renderGroup(group(), onLeft);
    await fireEvent.press(await view.findByRole('button', { name: 'Leave this group' }));

    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(lastWrite()?.url).toContain('/leave');
  });

  it('offers an ordinary member nothing to administer, only the way out', async () => {
    const view = await renderGroup(
      group({
        abilities: {
          canPost: true,
          canCall: false,
          canPlayRecording: false,
          canManage: false,
          canLeave: true,
          viaOversight: false,
          reason: null,
        },
      }),
    );

    await view.findByText('2 members');
    expect(view.getByRole('button', { name: 'Leave this group' })).toBeTruthy();
    expect(view.queryByLabelText('Group name')).toBeNull();
    expect(view.queryByLabelText('Find somebody to add')).toBeNull();
    expect(view.queryByRole('button', { name: 'Remove Dev One' })).toBeNull();
  });
});
