import type { ConversationSummary } from '@ashniva/types';

import { unreadTotal } from './unread-count';

jest.mock('../auth/SessionProvider', () => ({ useSession: () => ({ user: null }) }));

function row(kind: ConversationSummary['kind'], unreadCount: number): ConversationSummary {
  return {
    id: `${kind}-${unreadCount}`,
    kind,
    title: kind,
    project: null,
    task: null,
    ticket: null,
    counterpart: null,
    imageFileId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount,
    createdAt: '2026-09-13T08:00:00.000Z',
  };
}

describe('unreadTotal', () => {
  const rows = [row('SCOPE_DIRECT', 2), row('GROUP', 3), row('TASK', 9), row('PROJECT', 4)];

  it('counts what the inbox lists: direct messages and groups, never the channels', () => {
    expect(unreadTotal(rows, true)).toBe(5);
  });

  it('counts only groups for somebody who may not hold a private conversation', () => {
    expect(unreadTotal(rows, false)).toBe(3);
  });
});
