import type { ConversationDetail, ConversationParticipant } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { GroupScreen } from './GroupScreen';

const fetchMock = jest.fn();

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
    title: 'Acme portal',
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
      participant({ id: 'owner-1', name: 'Priya S', memberRole: 'OWNER' }),
      participant({ id: 'member-1', name: 'Dev One' }),
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

function testClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
}

function renderGroup(conversation: ConversationDetail): Promise<RenderResult> {
  fetchMock.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(conversation),
      headers: { get: () => null },
    } as unknown as Response),
  );
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testClient()}>
        <GroupScreen conversationId="conversation-1" onLeft={jest.fn()} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
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

  it('does not offer leave, remove, add or rename', async () => {
    const view = await renderGroup(group());
    await view.findByText('2 members');
    expect(view.queryByRole('button', { name: 'Leave this group' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Remove Dev One' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(view.queryByLabelText('Group name')).toBeNull();
    expect(view.queryByLabelText('Find somebody to add')).toBeNull();
  });
});
