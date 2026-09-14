import { PERMISSIONS, ROLE_KEYS, type ConversationSummary } from '@ashniva/types';

import {
  contextLabelOf,
  inboxAllowsPersonalChat,
  inboxFiltersFor,
  isPeopleInboxKind,
  matchesFilter,
  matchesSearch,
  serverQueryFor,
} from './conversation-filters';

/**
 * The chips above the conversation list.
 *
 * A pure module with its own test because the two judgements in it are not obvious. "Direct" admits
 * both direct kinds — whether a one-to-one thread is justified by a shared project or by management
 * scope is a permission question the server settles, and somebody looking for the conversation
 * they had with Priya does not hold that distinction in their head. And that is exactly why
 * "Direct" is the one kind chip that cannot travel as `kind`, which takes a single value.
 */

function summary(over: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    kind: 'DIRECT',
    title: 'Direct',
    project: null,
    task: null,
    ticket: null,
    counterpart: { id: 'user-priya', name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    lastMessagePreview: 'Morning',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

describe('conversation filters', () => {
  it('hides people threads for a role that only uses the team group', () => {
    expect(matchesFilter(summary({ id: 'a', kind: 'SCOPE_DIRECT' }), 'all', false)).toBe(false);
    expect(matchesFilter(summary({ id: 'b', kind: 'GROUP' }), 'all', false)).toBe(true);
    expect(inboxFiltersFor(false)).toEqual(['all', 'unread', 'groups']);
  });

  it('treats org-wide reach as personal chat even when the role is not a manager', () => {
    expect(
      inboxAllowsPersonalChat({
        roleKey: ROLE_KEYS.DEVELOPER,
        permissions: [PERMISSIONS.CONVERSATION_REACH_ORGANIZATION],
      }),
    ).toBe(true);
    expect(inboxAllowsPersonalChat({ roleKey: ROLE_KEYS.DEVELOPER, permissions: [] })).toBe(false);
  });

  it('admits people threads under "all", not project channels', () => {
    for (const kind of ['DIRECT', 'SCOPE_DIRECT', 'GROUP'] as const) {
      expect(matchesFilter(summary({ id: 'a', kind }), 'all')).toBe(true);
    }
    for (const kind of ['PROJECT', 'TASK', 'TICKET'] as const) {
      expect(matchesFilter(summary({ id: 'a', kind }), 'all')).toBe(false);
      expect(isPeopleInboxKind(kind)).toBe(false);
    }
  });

  it('treats both direct kinds as "direct"', () => {
    expect(matchesFilter(summary({ id: 'a', kind: 'DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'b', kind: 'SCOPE_DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'c', kind: 'GROUP' }), 'direct')).toBe(false);
  });

  it('keeps groups apart from direct messages', () => {
    expect(matchesFilter(summary({ id: 'a', kind: 'GROUP' }), 'groups')).toBe(true);
    expect(matchesFilter(summary({ id: 'b', kind: 'DIRECT' }), 'groups')).toBe(false);
  });

  it('sends the kind chips the endpoint can express to the server', () => {
    expect(serverQueryFor('groups')).toEqual({ kind: 'GROUP' });
    expect(serverQueryFor('unread')).toEqual({ unreadOnly: true });
  });

  it('asks for no kind under "all" or "direct", which the parameter cannot express', () => {
    // `kind` takes one value, so `kind=DIRECT` would silently drop every `SCOPE_DIRECT` row.
    expect(serverQueryFor('all')).toEqual({});
    expect(serverQueryFor('direct')).toEqual({});
    expect(matchesFilter(summary({ id: 'a', kind: 'DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'b', kind: 'SCOPE_DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'c', kind: 'GROUP' }), 'direct')).toBe(false);
  });

  it('re-checks the kind the server narrowed, so a stale page cannot show under a new chip', () => {
    expect(matchesFilter(summary({ id: 'a', kind: 'GROUP' }), 'direct')).toBe(false);
    expect(matchesFilter(summary({ id: 'b', kind: 'DIRECT', unreadCount: 0 }), 'unread')).toBe(
      false,
    );
    expect(matchesFilter(summary({ id: 'c', kind: 'DIRECT', unreadCount: 2 }), 'unread')).toBe(true);
  });

  it('finds a conversation by name and preview', () => {
    const row = summary({
      id: 'a',
      kind: 'GROUP',
      title: 'Release crew',
      counterpart: null,
      lastMessagePreview: 'Cutting the build tonight',
    });

    expect(matchesSearch(row, 'release')).toBe(true);
    expect(matchesSearch(row, 'tonight')).toBe(true);
    expect(matchesSearch(row, 'nothing here')).toBe(false);
  });

  it('names what a row hangs off, preferring the work item to the project', () => {
    const project = { id: 'p1', code: 'ACM', name: 'Acme portal' };
    expect(contextLabelOf(summary({ id: 'a', kind: 'PROJECT', project }))).toBe('ACM');
    expect(
      contextLabelOf(
        summary({ id: 'b', kind: 'TASK', project, task: { id: 't', key: 'TK-9', title: 'Fix' } }),
      ),
    ).toBe('TK-9');
    expect(contextLabelOf(summary({ id: 'c', kind: 'GROUP' }))).toBeNull();
  });
});
