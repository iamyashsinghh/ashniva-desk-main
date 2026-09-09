import type { MessageSummary } from '@ashniva/types';

import { firstUnreadMessageId } from './unread-divider';

/**
 * Where the "new messages" line goes.
 *
 * From the reader's own cursor rather than from the unread count, which is why this is worth a
 * test of its own: counting back N from the end puts the line in the wrong place the moment the
 * reader has posted something themselves, and that is the ordinary case in a conversation.
 */

const ME = 'dev';
const THEM = 'priya';

function message(id: string, at: string, senderId = THEM): MessageSummary {
  return {
    id,
    conversationId: 'conversation-1',
    sender: { id: senderId, name: senderId, email: `${senderId}@example.com` },
    body: id,
    systemKind: null,
    attachments: [],
    createdAt: at,
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
  };
}

const THREAD = [
  message('a', '2026-09-13T09:00:00.000Z'),
  message('b', '2026-09-13T09:01:00.000Z', ME),
  message('c', '2026-09-13T09:02:00.000Z'),
  message('d', '2026-09-13T09:03:00.000Z'),
];

describe('firstUnreadMessageId', () => {
  it('marks the first message written after the reader last read', () => {
    expect(firstUnreadMessageId(THREAD, ME, '2026-09-13T09:01:30.000Z')).toBe('c');
  });

  it('never starts the unread run on the reader’s own line', () => {
    // "b" is theirs and is newer than the cursor; the run starts at the next line somebody else
    // wrote. A divider above something you wrote yourself is nonsense.
    expect(firstUnreadMessageId(THREAD, ME, '2026-09-13T09:00:30.000Z')).toBe('c');
  });

  it('returns nothing when the reader is up to date', () => {
    expect(firstUnreadMessageId(THREAD, ME, '2026-09-13T09:05:00.000Z')).toBeNull();
  });

  it('starts at the first line somebody else wrote when the thread was never opened', () => {
    expect(firstUnreadMessageId(THREAD, ME, null)).toBe('a');
  });
});
