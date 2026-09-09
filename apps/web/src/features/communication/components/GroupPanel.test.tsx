import {
  ROLE_KEYS,
  type ConversationDetail,
  type ConversationParticipant,
  type MessagingScopeContact,
} from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { GroupPanel } from './GroupPanel';

/**
 * Managing a group from the thread.
 *
 * Every control here is `abilities.canManage` or `abilities.canLeave`, both computed on the
 * server. So the tests are about that correspondence: an ordinary member is offered leaving and
 * nothing else, an administrator is offered the rest, and each control sends the request the API
 * documents rather than one this screen invented.
 */

const OWNER = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const MEMBER = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';
const OUTSIDER = 'b2c3d4e5-f607-4819-ab0c-2d3e4f506172';

function participant(over: Partial<ConversationParticipant> & { id: string }) {
  return {
    name: 'Priya S',
    email: 'priya@example.com',
    projectRole: null,
    memberRole: 'MEMBER',
    lastReadAt: null,
    joinedAt: '2026-09-13T08:00:00.000Z',
    leftAt: null,
    ...over,
  } as ConversationParticipant;
}

function groupFixture(over: Partial<ConversationDetail> = {}): ConversationDetail {
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
      participant({ id: MEMBER, name: 'Dev One', email: 'dev@example.com' }),
      participant({
        id: 'gone-1',
        name: 'Sam Left',
        email: 'sam@example.com',
        leftAt: '2026-09-12T08:00:00.000Z',
      }),
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

const DIRECTORY: MessagingScopeContact[] = [
  {
    id: OUTSIDER,
    name: 'Ravi K',
    email: 'ravi@example.com',
    reason: 'You manage the Acme portal project',
    conversationId: null,
  },
];

function renderPanel(conversation: ConversationDetail) {
  setAuthenticated('test-token', {
    ...sessionUserFor(ROLE_KEYS.PROJECT_MANAGER),
    id: OWNER,
  });
  const requests: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const body = url.includes('/directory') ? DIRECTORY : conversation;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onLeft = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <GroupPanel conversation={conversation} onLeft={onLeft} />
    </QueryClientProvider>,
  );
  return { requests, onLeft };
}

/** Opens the collapsed panel — the member list is behind one press, deliberately. */
function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Group' }));
}

describe('GroupPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('counts the people still in the group and not the ones who left', () => {
    renderPanel(groupFixture());
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });

  it('keeps somebody who left in the list, marked, so the thread still reads', () => {
    renderPanel(groupFixture());
    openPanel();
    expect(screen.getByText('Sam Left · left')).toBeInTheDocument();
  });

  it('renames the group through PATCH on the conversation', async () => {
    const { requests } = renderPanel(groupFixture());
    openPanel();

    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Release crew II' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      const patch = requests.find((request) => request.method === 'PATCH');
      expect(patch?.body).toEqual({ title: 'Release crew II' });
    });
  });

  it('removes a picture with an explicit null rather than by leaving the field out', async () => {
    // Absent means "leave it alone" and null means "take it off". Sending nothing would be a
    // no-op that looked like it worked.
    const { requests } = renderPanel(groupFixture({ imageFileId: 'file-1' }));
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

    await waitFor(() => {
      const patch = requests.find((request) => request.method === 'PATCH');
      expect(patch?.body).toEqual({ imageFileId: null });
    });
  });

  it('adds somebody from the messaging directory, which is what the API accepts', async () => {
    const { requests } = renderPanel(groupFixture());
    openPanel();

    fireEvent.change(screen.getByLabelText('Find somebody to add'), { target: { value: 'Ravi' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

    await waitFor(() => {
      const post = requests.find((request) => request.url.includes('/members'));
      expect(post?.method).toBe('POST');
      expect(post?.body).toEqual({ userId: OUTSIDER });
    });
  });

  it('removes an ordinary member and never the owner', async () => {
    const { requests } = renderPanel(groupFixture());
    openPanel();

    // One Remove button: Dev One's. The owner's row has none, because the API refuses that.
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    expect(removes).toHaveLength(1);
    fireEvent.click(removes[0] as HTMLElement);

    await waitFor(() => {
      const call = requests.find((request) => request.method === 'DELETE');
      expect(call?.url).toContain(`/members/${MEMBER}`);
    });
  });

  it('lets somebody leave, and tells the screen so it can close the thread', async () => {
    const { requests, onLeft } = renderPanel(groupFixture());

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(requests.some((request) => request.url.includes('/leave'))).toBe(true);
  });

  it('offers an ordinary member nothing to administer, only the way out', () => {
    renderPanel(
      groupFixture({
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
    openPanel();

    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Find somebody to add')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });
});
