import type { ConversationSummary } from '@ashniva/types';

import {
  contextLabelOf,
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
 * "Direct" is the one kind chip that cannot travel as `kind`, which takes a single value: the rest
 * must travel, because the endpoint returns the most recent `limit` rows and a chip applied only
 * afterwards would be narrowing a window already spent on the kinds it is about to hide.
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
  it('admits everything under "all"', () => {
    for (const kind of ['DIRECT', 'SCOPE_DIRECT', 'GROUP', 'PROJECT', 'TASK', 'TICKET'] as const) {
      expect(matchesFilter(summary({ id: 'a', kind }), 'all')).toBe(true);
    }
  });

  it('treats both direct kinds as "direct"', () => {
    expect(matchesFilter(summary({ id: 'a', kind: 'DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'b', kind: 'SCOPE_DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'c', kind: 'GROUP' }), 'direct')).toBe(false);
  });

  it('keeps groups, project channels, tasks and tickets apart', () => {
    expect(matchesFilter(summary({ id: 'a', kind: 'GROUP' }), 'groups')).toBe(true);
    expect(matchesFilter(summary({ id: 'b', kind: 'PROJECT' }), 'project')).toBe(true);
    expect(matchesFilter(summary({ id: 'c', kind: 'TASK' }), 'task')).toBe(true);
    expect(matchesFilter(summary({ id: 'd', kind: 'TICKET' }), 'ticket')).toBe(true);
    expect(matchesFilter(summary({ id: 'e', kind: 'TASK' }), 'ticket')).toBe(false);
  });

  it('sends the kind chips to the server rather than narrowing the answer', () => {
    expect(serverQueryFor('groups')).toEqual({ kind: 'GROUP' });
    expect(serverQueryFor('project')).toEqual({ kind: 'PROJECT' });
    expect(serverQueryFor('task')).toEqual({ kind: 'TASK' });
    expect(serverQueryFor('ticket')).toEqual({ kind: 'TICKET' });
    expect(serverQueryFor('unread')).toEqual({ unreadOnly: true });
  });

  it('asks for no kind under "all" or "direct", which the parameter cannot express', () => {
    // `kind` takes one value, so `kind=DIRECT` would silently drop every `SCOPE_DIRECT` row.
    expect(serverQueryFor('all')).toEqual({});
    expect(serverQueryFor('direct')).toEqual({});
    expect(matchesFilter(summary({ id: 'a', kind: 'DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'b', kind: 'SCOPE_DIRECT' }), 'direct')).toBe(true);
    expect(matchesFilter(summary({ id: 'c', kind: 'TASK' }), 'direct')).toBe(false);
  });

  it('re-checks the kind the server narrowed, so a stale page cannot show under a new chip', () => {
    // The previous chip's rows stay on screen while the next window loads.
    expect(matchesFilter(summary({ id: 'a', kind: 'GROUP' }), 'task')).toBe(false);
    expect(matchesFilter(summary({ id: 'b', kind: 'TASK', unreadCount: 0 }), 'unread')).toBe(false);
    expect(matchesFilter(summary({ id: 'c', kind: 'TASK', unreadCount: 2 }), 'unread')).toBe(true);
  });

  it('finds a conversation by name, preview, project code and work item key', () => {
    const row = summary({
      id: 'a',
      kind: 'TASK',
      title: 'Sync fix',
      counterpart: null,
      project: { id: 'p1', code: 'ACM', name: 'Acme portal' },
      task: { id: 't1', key: 'TK-42', title: 'Sync fix' },
      lastMessagePreview: 'Cutting the build tonight',
    });

    expect(matchesSearch(row, 'sync')).toBe(true);
    expect(matchesSearch(row, 'tonight')).toBe(true);
    expect(matchesSearch(row, 'acm')).toBe(true);
    expect(matchesSearch(row, 'tk-42')).toBe(true);
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
