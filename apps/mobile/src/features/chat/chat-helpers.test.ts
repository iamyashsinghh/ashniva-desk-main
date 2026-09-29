import type {
  ConversationDetail,
  ConversationSummary,
  MessagePage,
  MessageSummary,
  NotificationSummary,
} from '@ashniva/types';
import type { InfiniteData } from '@tanstack/react-query';

import {
  isReadingConversation,
  setReadingConversation,
  stopReadingConversation,
} from './active-conversation';
import { mergeInbox, unreadChipCount } from './inbox';
import { appendLiveMessage } from './live-thread';
import { isMessageNotification, toastFor } from './live-toasts';
import { highlightParts } from './MessageBody';
import { messageSnippet } from './message-labels';
import { canReplyTo } from './MessageActionSheet';
import { firstUnreadMessageId } from './unread-divider';

/** The pure pieces behind the live thread, the inbox, the reply and the toasts. */

const SAM = '11111111-2222-4333-8444-555555555555';

function message(over: Partial<MessageSummary> & { id: string }): MessageSummary {
  return {
    conversationId: 'c1',
    sender: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    body: 'Hello',
    systemKind: null,
    attachments: [],
    createdAt: '2026-09-13T09:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    restrictedToUserIds: [],
    ...over,
  };
}

function row(over: Partial<ConversationSummary> & { id: string }): ConversationSummary {
  return {
    kind: 'SCOPE_DIRECT',
    title: 'Direct message',
    project: null,
    task: null,
    ticket: null,
    counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    imageFileId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

describe('appendLiveMessage', () => {
  const data: InfiniteData<MessagePage> = {
    pages: [
      { items: [message({ id: 'm2' })], nextCursor: 'older' },
      { items: [message({ id: 'm1' })], nextCursor: null },
    ],
    pageParams: [null, 'older'],
  };

  it('adds an arriving line to the newest page, at the end', () => {
    const next = appendLiveMessage(data, message({ id: 'm3' }));
    expect(next?.pages[0]?.items.map((item) => item.id)).toEqual(['m2', 'm3']);
    expect(next?.pages[1]).toBe(data.pages[1]);
  });

  it('ignores a line it already holds, so the socket and a refetch cannot double it', () => {
    expect(appendLiveMessage(data, message({ id: 'm1' }))).toBe(data);
  });

  it('leaves a thread that has not loaded alone', () => {
    expect(appendLiveMessage(undefined, message({ id: 'm3' }))).toBeUndefined();
  });
});

describe('firstUnreadMessageId', () => {
  const lines = [
    message({ id: 'old', createdAt: '2026-09-13T08:00:00.000Z' }),
    message({
      id: 'mine',
      sender: { id: 'me', name: 'Me', email: 'me@example.com' },
      createdAt: '2026-09-13T09:30:00.000Z',
    }),
    message({ id: 'new', createdAt: '2026-09-13T10:00:00.000Z' }),
  ];

  it('is the first line from somebody else past the read cursor', () => {
    expect(firstUnreadMessageId(lines, 'me', '2026-09-13T09:00:00.000Z')).toBe('new');
  });

  it('is nothing when everything was read', () => {
    expect(firstUnreadMessageId(lines, 'me', '2026-09-13T11:00:00.000Z')).toBeNull();
  });

  it('starts at the first line from somebody else when the reader never read anything', () => {
    expect(firstUnreadMessageId(lines, 'me', null)).toBe('old');
  });
});

describe('mergeInbox', () => {
  const contact = {
    id: 'oliver',
    name: 'Oliver K',
    email: 'oliver@example.com',
    reason: 'On your team',
    conversationId: null,
  };

  it('puts people after threads and never lists the other side of a thread twice', () => {
    const entries = mergeInbox(
      [row({ id: 'a' })],
      [contact, { ...contact, id: 'priya', name: 'Priya S' }],
      'ALL',
      '',
      true,
    );
    expect(entries.map((entry) => entry.type)).toEqual(['thread', 'person']);
  });

  it('lists nobody for a reader without personal chat', () => {
    expect(mergeInbox([], [contact], 'ALL', '', false)).toEqual([]);
  });

  it('keeps the Unread figure to the inbox kinds, and drops it under a kind filter', () => {
    const rows = [
      row({ id: 'a', unreadCount: 2 }),
      row({ id: 'b', kind: 'GROUP', counterpart: null, unreadCount: 3 }),
      row({ id: 'c', kind: 'PROJECT', counterpart: null, unreadCount: 7 }),
    ];
    expect(unreadChipCount(rows, {}, true)).toBe(5);
    expect(unreadChipCount(rows, {}, false)).toBe(3);
    expect(unreadChipCount(rows, { kind: 'GROUP' }, true)).toBeNull();
  });
});

describe('replying', () => {
  it('answers any readable line, your own included, but not a withdrawn or system one', () => {
    const actions = { onReply: () => undefined };
    expect(canReplyTo(message({ id: 'a', sender: null }), actions)).toBe(true);
    expect(canReplyTo(message({ id: 'b', deletedAt: '2026-09-13T10:00:00.000Z' }), actions)).toBe(
      false,
    );
    expect(canReplyTo(message({ id: 'c', systemKind: 'CALL_STARTED' }), actions)).toBe(false);
    expect(canReplyTo(message({ id: 'd' }), {})).toBe(false);
  });

  it('quotes a line in one short piece, naming a file when there are no words', () => {
    const names = new Map([[SAM, 'Sam P']]);
    expect(messageSnippet(message({ id: 'a', body: `Ask @[${SAM}]\n about it` }), names)).toBe(
      'Ask @Sam P about it',
    );
    const file = { id: 'f1', name: 'plan.pdf' } as MessageSummary['attachments'][number];
    expect(messageSnippet(message({ id: 'b', body: '', attachments: [file, file] }), names)).toBe(
      'plan.pdf and 1 more',
    );
    expect(messageSnippet(message({ id: 'c', deletedAt: '2026-09-13T10:00:00.000Z' }), names)).toBe(
      'This message was withdrawn.',
    );
  });
});

describe('highlightParts', () => {
  it('cuts every match out, whatever its case', () => {
    expect(highlightParts('Build tonight, build', 'build')).toEqual([
      { text: 'Build', match: true },
      { text: ' tonight, ', match: false },
      { text: 'build', match: true },
    ]);
  });
});

describe('message toasts', () => {
  const notification: NotificationSummary = {
    id: 'n1',
    type: 'CONVERSATION_MENTION',
    title: 'Priya S mentioned you',
    body: 'Ready?',
    link: '/messages/c1',
    entityType: 'conversation',
    entityId: 'c1',
    groupedCount: 1,
    readAt: null,
    createdAt: '2026-09-13T09:00:00.000Z',
  };

  it('only takes conversation messages and mentions', () => {
    expect(isMessageNotification(notification)).toBe(true);
    expect(isMessageNotification({ ...notification, type: 'TASK_ASSIGNED' })).toBe(false);
    expect(isMessageNotification({ ...notification, entityType: 'task' })).toBe(false);
  });

  it('builds the card from the re-read conversation, with mentions masked', () => {
    const conversation = {
      ...row({ id: 'c1', kind: 'GROUP', counterpart: null, title: 'Release crew' }),
      task: { id: 't1', key: 'APP-12', title: 'Ship' },
      lastMessagePreview: `Ready @[${SAM}]?`,
    } as unknown as ConversationDetail;

    const toast = toastFor(notification, conversation, 1000);

    expect(toast).toMatchObject({
      key: 'n1',
      conversationId: 'c1',
      from: 'Release crew',
      context: 'APP-12',
      isMention: true,
      shownAt: 1000,
    });
    expect(toast.preview).toBe('Ready @someone?');
  });
});

describe('the conversation being read', () => {
  it('is only the one the thread set, and a stale clear does not wipe a newer one', () => {
    setReadingConversation('a');
    setReadingConversation('b');
    stopReadingConversation('a');
    expect(isReadingConversation('b')).toBe(true);
    stopReadingConversation('b');
    expect(isReadingConversation('b')).toBe(false);
  });
});
