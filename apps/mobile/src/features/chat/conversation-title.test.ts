import type { ConversationDetail, ConversationParticipant } from '@ashniva/types';

import { conversationSubtitle, conversationTitle } from './conversation-title';

/**
 * What the top bar calls a thread. The API titles many threads with the generic word, and a
 * header that says "Conversation" tells somebody nothing about who they are talking to.
 */

const VIEWER = 'viewer';

function person(id: string, name: string, over: Partial<ConversationParticipant> = {}) {
  return {
    id,
    name,
    email: `${id}@example.com`,
    projectRole: null,
    memberRole: 'MEMBER',
    lastReadAt: null,
    joinedAt: '2026-09-01T00:00:00.000Z',
    leftAt: null,
    ...over,
  } satisfies ConversationParticipant;
}

function conversation(over: Partial<ConversationDetail>): ConversationDetail {
  return {
    id: 'c1',
    kind: 'DIRECT',
    title: 'Conversation',
    project: null,
    task: null,
    ticket: null,
    counterpart: null,
    imageFileId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    participants: [],
    abilities: {
      canPost: true,
      canCall: false,
      canPlayRecording: false,
      canManage: false,
      canLeave: false,
      viaOversight: false,
      reason: null,
    },
    ...over,
  };
}

const PROJECT = { id: 'p1', code: 'ACME', name: 'Acme Portal' };

describe('conversationTitle', () => {
  it('names the other person in a direct thread', () => {
    const direct = conversation({
      counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    });
    expect(conversationTitle(direct, VIEWER)).toBe('Priya S');
  });

  it('finds the other person among the participants when there is no counterpart', () => {
    const direct = conversation({
      kind: 'SCOPE_DIRECT',
      participants: [person(VIEWER, 'Me Myself'), person('dev', 'Dev One')],
    });
    expect(conversationTitle(direct, VIEWER)).toBe('Dev One');
  });

  it('uses a group’s own name', () => {
    expect(conversationTitle(conversation({ kind: 'GROUP', title: 'Release crew' }), VIEWER)).toBe(
      'Release crew',
    );
  });

  it('calls a task or ticket thread by its key and title', () => {
    const task = conversation({
      kind: 'TASK',
      task: { id: 't1', key: 'ACME-12', title: 'Fix the login' },
    });
    const ticket = conversation({
      kind: 'TICKET',
      ticket: { id: 'k1', key: 'TCK-3', title: 'Printer down' },
    });
    expect(conversationTitle(task, VIEWER)).toBe('ACME-12 Fix the login');
    expect(conversationTitle(ticket, VIEWER)).toBe('TCK-3 Printer down');
  });

  it('calls a project channel by the project', () => {
    expect(conversationTitle(conversation({ kind: 'PROJECT', project: PROJECT }), VIEWER)).toBe(
      'Acme Portal',
    );
  });

  it.each(['DIRECT', 'SCOPE_DIRECT', 'GROUP', 'TASK', 'TICKET', 'PROJECT'] as const)(
    'never says “Conversation” for a %s thread, even with nothing better to go on',
    (kind) => {
      const title = conversationTitle(conversation({ kind, title: 'Conversation' }), VIEWER);
      expect(title.toLowerCase()).not.toBe('conversation');
      expect(title.length).toBeGreaterThan(0);
    },
  );
});

describe('conversationSubtitle', () => {
  it('lists a group’s members by first name, the reader last as “You”', () => {
    const group = conversation({
      kind: 'GROUP',
      participants: [
        person(VIEWER, 'Me Myself'),
        person('aman', 'Aman Kumar'),
        person('priya', 'Priya Sharma'),
        person('gone', 'Gone Person', { leftAt: '2026-09-02T00:00:00.000Z' }),
      ],
    });
    expect(conversationSubtitle(group, VIEWER)).toBe('Aman, Priya, You');
  });

  it('counts a group’s members once the names would not fit', () => {
    const many = Array.from({ length: 12 }, (_, index) => person(`p${index}`, `Person ${index}`));
    expect(conversationSubtitle(conversation({ kind: 'GROUP', participants: many }), VIEWER)).toBe(
      '12 members',
    );
  });

  it('says what the other person does, or invites a tap', () => {
    const withRole = conversation({
      counterpart: { id: 'dev', name: 'Dev One', email: 'dev@example.com' },
      participants: [person('dev', 'Dev One', { projectRole: 'DEVELOPER' })],
    });
    expect(conversationSubtitle(withRole, VIEWER)).toBe('Developer');
    expect(conversationSubtitle(conversation({}), VIEWER)).toBe('tap here for info');
  });

  it('puts the project code under a task or ticket thread', () => {
    expect(conversationSubtitle(conversation({ kind: 'TASK', project: PROJECT }), VIEWER)).toBe(
      'Task · ACME',
    );
    expect(conversationSubtitle(conversation({ kind: 'TICKET', project: PROJECT }), VIEWER)).toBe(
      'Ticket · ACME',
    );
  });
});
