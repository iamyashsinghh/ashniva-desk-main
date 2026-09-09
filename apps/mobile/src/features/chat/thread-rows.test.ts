import type { MessageSummary } from '@ashniva/types';

import { threadRows, unreadStartIndex } from './thread-rows';

/**
 * The rows a thread is drawn from.
 *
 * Tested apart from the screen because the two things worth being certain of are decisions, not
 * pixels: where the "you were here" line goes, and whose message each row is. Both are wrong in
 * ways that look plausible on a screenshot.
 */

const PRIYA = { id: 'priya', name: 'Priya S', email: 'priya@example.com' };
const ME = { id: 'me', name: 'Dev One', email: 'dev@example.com' };

function message(over: Partial<MessageSummary> & { id: string }): MessageSummary {
  return {
    conversationId: 'c1',
    sender: PRIYA,
    body: 'Something',
    systemKind: null,
    attachments: [],
    createdAt: new Date('2026-09-13T09:00:00').toISOString(),
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

function at(local: string): string {
  return new Date(local).toISOString();
}

describe('unreadStartIndex', () => {
  const thread = [
    message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
    message({ id: 'mine', sender: ME, createdAt: at('2026-09-13T09:01:00') }),
    message({ id: 'b', createdAt: at('2026-09-13T09:02:00') }),
    message({ id: 'c', createdAt: at('2026-09-13T09:03:00') }),
  ];

  it('counts back over other people’s messages only, as the API does', () => {
    // Two unread means `b` and `c`; the reader's own line in between is not one of them.
    expect(unreadStartIndex(thread, ME.id, 2)).toBe(2);
  });

  it('draws nothing when there is nothing unread', () => {
    expect(unreadStartIndex(thread, ME.id, 0)).toBeNull();
  });

  it('draws nothing when the count reaches further back than the loaded history', () => {
    // Claiming everything above the line has been read, when it has not been loaded, is the one
    // thing the divider must not say.
    expect(unreadStartIndex(thread, ME.id, 9)).toBeNull();
  });
});

describe('threadRows', () => {
  it('opens each day with a separator and marks the reader’s own lines', () => {
    const rows = threadRows(
      [
        message({ id: 'a', createdAt: at('2026-09-12T09:00:00') }),
        message({ id: 'mine', sender: ME, createdAt: at('2026-09-13T09:00:00') }),
      ],
      { viewerId: ME.id, unreadCount: 0 },
    );

    expect(rows.map((row) => row.kind)).toEqual(['day', 'message', 'day', 'message']);
    const own = rows.find((row) => row.kind === 'message' && row.key === 'mine');
    expect(own).toMatchObject({ isOwn: true });
    const theirs = rows.find((row) => row.kind === 'message' && row.key === 'a');
    expect(theirs).toMatchObject({ isOwn: false });
  });

  it('puts the unread divider immediately before the first message not yet read', () => {
    const rows = threadRows(
      [
        message({ id: 'read', createdAt: at('2026-09-13T09:00:00') }),
        message({ id: 'new', createdAt: at('2026-09-13T10:00:00') }),
      ],
      { viewerId: ME.id, unreadCount: 1 },
    );

    const keys = rows.map((row) => row.key);
    expect(keys.indexOf('unread')).toBe(keys.indexOf('new') - 1);
  });

  it('names the sender once per run and never on a system note’s neighbours', () => {
    const rows = threadRows(
      [
        message({ id: 'a', createdAt: at('2026-09-13T09:00:00') }),
        message({ id: 'b', createdAt: at('2026-09-13T09:01:00') }),
        message({
          id: 'call',
          sender: null,
          systemKind: 'CALL_STARTED',
          createdAt: at('2026-09-13T09:02:00'),
        }),
        message({ id: 'c', createdAt: at('2026-09-13T09:03:00') }),
      ],
      { viewerId: ME.id, unreadCount: 0 },
    );

    const named = rows.filter((row) => row.kind === 'message' && row.showSender).map((r) => r.key);
    // `a` starts the run, `b` continues it, the call note ends it, and `c` starts a new one.
    expect(named).toEqual(['a', 'call', 'c']);
  });

  it('gives every row a key of its own, so a re-render moves nothing', () => {
    const rows = threadRows(
      [
        message({ id: 'a', createdAt: at('2026-09-12T09:00:00') }),
        message({ id: 'b', createdAt: at('2026-09-13T09:00:00') }),
      ],
      { viewerId: ME.id, unreadCount: 1 },
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});
