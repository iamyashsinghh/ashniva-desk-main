import { CONVERSATION_KIND, type ConversationSummary } from '@ashniva/types';

import {
  CONVERSATION_FILTER,
  inboxFiltersFor,
  matchesFilter,
  matchesSearch,
  serverQueryFor,
} from './conversation-filters';

/**
 * Which chip narrows where.
 *
 * The split is the point. `GET /conversations` answers with the most recent `limit` rows, so a
 * chip that can be expressed as a request should be one — otherwise the window is spent on rows
 * the chip is about to hide. "Direct" cannot: it is two kinds and the parameter takes one, and
 * sending `DIRECT` would silently drop every `SCOPE_DIRECT` row, which is a wrong answer rather
 * than a slow one.
 */

function row(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    kind: CONVERSATION_KIND.SCOPE_DIRECT,
    title: 'Direct message',
    project: null,
    task: null,
    ticket: null,
    counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: null,
    lastMessagePreview: 'Morning',
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

describe('serverQueryFor', () => {
  it('asks the server for the chips it can express', () => {
    expect(serverQueryFor(CONVERSATION_FILTER.GROUPS)).toEqual({ kind: 'GROUP' });
    expect(serverQueryFor(CONVERSATION_FILTER.UNREAD)).toEqual({ unreadOnly: true });
  });

  it('asks for nothing for the two the parameter cannot express', () => {
    expect(serverQueryFor(CONVERSATION_FILTER.ALL)).toEqual({});
    // Two kinds, one parameter. Narrowing here would lose half the answer.
    expect(serverQueryFor(CONVERSATION_FILTER.DIRECT)).toEqual({});
  });
});

describe('matchesFilter', () => {
  it('hides people threads for a role that only uses the team group', () => {
    expect(matchesFilter(row({ kind: 'SCOPE_DIRECT' }), CONVERSATION_FILTER.ALL, false)).toBe(
      false,
    );
    expect(matchesFilter(row({ kind: 'GROUP' }), CONVERSATION_FILTER.ALL, false)).toBe(true);
    expect(inboxFiltersFor(false)).toEqual([
      CONVERSATION_FILTER.ALL,
      CONVERSATION_FILTER.UNREAD,
      CONVERSATION_FILTER.GROUPS,
    ]);
  });

  it('admits both direct kinds under Direct', () => {
    expect(matchesFilter(row({ kind: 'DIRECT' }), CONVERSATION_FILTER.DIRECT)).toBe(true);
    expect(matchesFilter(row({ kind: 'SCOPE_DIRECT' }), CONVERSATION_FILTER.DIRECT)).toBe(true);
    expect(matchesFilter(row({ kind: 'GROUP' }), CONVERSATION_FILTER.DIRECT)).toBe(false);
  });

  it('runs over every row even where the server already narrowed', () => {
    expect(matchesFilter(row({ kind: 'GROUP' }), CONVERSATION_FILTER.DIRECT)).toBe(false);
  });

  it('answers Unread from the count the API computed', () => {
    expect(matchesFilter(row({ unreadCount: 0 }), CONVERSATION_FILTER.UNREAD)).toBe(false);
    expect(matchesFilter(row({ unreadCount: 2 }), CONVERSATION_FILTER.UNREAD)).toBe(true);
  });

  it('hides project channels under All', () => {
    expect(matchesFilter(row({ kind: 'TICKET' }), CONVERSATION_FILTER.ALL)).toBe(false);
    expect(matchesFilter(row({ kind: 'PROJECT' }), CONVERSATION_FILTER.ALL)).toBe(false);
    expect(matchesFilter(row({ kind: 'GROUP' }), CONVERSATION_FILTER.ALL)).toBe(true);
  });
});

describe('matchesSearch', () => {
  it('searches everything the row draws, and nothing it does not', () => {
    const conversation = row({
      title: 'Release crew',
      counterpart: null,
      project: { id: 'p1', code: 'ACME', name: 'Acme portal' },
      lastMessagePreview: 'Cutting the build tonight',
    });

    expect(matchesSearch(conversation, 'tonight')).toBe(true);
    expect(matchesSearch(conversation, 'acme')).toBe(true);
    expect(matchesSearch(conversation, 'release')).toBe(true);
    // The project's full name is not on the row, so matching it would look like a bug.
    expect(matchesSearch(conversation, 'portal')).toBe(false);
  });

  it('matches everything when nothing was typed', () => {
    expect(matchesSearch(row(), '')).toBe(true);
  });
});
