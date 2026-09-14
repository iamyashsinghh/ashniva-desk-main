import { ROLE_KEYS, type ConversationDetail, type ConversationParticipant } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { GroupPanel } from './GroupPanel';

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
      participant({ id: 'member-1', name: 'Dev One', email: 'dev@example.com' }),
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

function renderPanel(conversation: ConversationDetail) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GroupPanel conversation={conversation} />
    </QueryClientProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Group' }));
}

describe('GroupPanel', () => {
  it('counts the people still in the group and not the ones who left', () => {
    renderPanel(groupFixture());
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });

  it('keeps somebody who left in the list, marked, so the thread still reads', () => {
    renderPanel(groupFixture());
    openPanel();
    expect(screen.getByText('Sam Left · left')).toBeInTheDocument();
  });

  it('does not offer leave, remove, add or rename', () => {
    renderPanel(groupFixture());
    openPanel();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
  });
});
