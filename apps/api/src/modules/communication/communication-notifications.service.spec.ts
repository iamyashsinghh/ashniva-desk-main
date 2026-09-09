import {
  CONVERSATION_KIND,
  NOTIFICATION_TYPE,
  type ConversationKind,
  type MessageSummary,
} from '@ashniva/types';

import { CommunicationNotificationsService } from './communication-notifications.service';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import type { NotificationRecipientsService } from '../notifications/recipients.service';
import type { ConversationRow } from './conversations.repository';

/**
 * Who hears about a message, and — the half that matters — who does not.
 *
 * A mention is the only thing in this module that turns a shared thread into a direct address, so
 * it is the only thing here that can deliver a line of somebody's conversation to a person who was
 * not going to receive it. The guard is a single intersection with the audience the send path
 * already computed from live project membership, and these tests are what hold it in place: name
 * somebody outside the audience and nobody is notified at all.
 */

const ALICE = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const BOB = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';
const STRANGER = '9e8d7c6b-5a49-4382-b1c0-0f1e2d3c4b5a';

function conversation(kind: ConversationKind = CONVERSATION_KIND.PROJECT): ConversationRow {
  // Only the fields the notification path reads; the cast says so rather than pretending this is
  // a whole row loaded from the database.
  return {
    id: 'conversation-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    kind,
    title: null,
    task: null,
    ticket: null,
    project: { id: 'project-1', code: 'ACM', name: 'Acme portal' },
    members: [],
  } as unknown as ConversationRow;
}

function message(body: string): MessageSummary {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    sender: { id: 'user-dev', name: 'Dev One', email: 'dev@example.com' },
    body,
    systemKind: null,
    attachments: [],
    createdAt: '2026-09-16T09:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    canEdit: true,
    canDelete: true,
  };
}

describe('CommunicationNotificationsService.messagePosted', () => {
  const sender = { userId: 'user-dev', organizationId: 'org-1' } as never;
  let notify: jest.Mock;
  let service: CommunicationNotificationsService;

  beforeEach(() => {
    notify = jest.fn().mockResolvedValue(undefined);
    const dispatcher = { notify } as unknown as NotificationDispatcher;
    const recipients = {
      members: (_org: string, ids: string[]) => Promise.resolve(ids.map((id) => ({ userId: id }))),
      member: (_org: string, id: string) => Promise.resolve([{ userId: id }]),
    } as unknown as NotificationRecipientsService;
    service = new CommunicationNotificationsService(dispatcher, recipients);
  });

  it('says nothing about an ordinary line in a project channel', async () => {
    // A channel that pinged everybody on every line would be switched off within a day, and a
    // notification people turn off is worse than none.
    await service.messagePosted(conversation(), message('Pushed the fix'), sender, [ALICE, BOB]);

    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies somebody named who is already in the audience', async () => {
    await service.messagePosted(conversation(), message(`@[${ALICE}] can you look?`), sender, [
      ALICE,
      BOB,
    ]);

    expect(notify).toHaveBeenCalledTimes(1);
    const payload = notify.mock.calls[0]?.[0];
    expect(payload.type).toBe(NOTIFICATION_TYPE.CONVERSATION_MENTION);
    expect(payload.recipients).toEqual([{ userId: ALICE }]);
  });

  it('notifies nobody when the person named cannot read the conversation', async () => {
    // The property the whole mention path rests on: naming an id is not a way to reach somebody.
    await service.messagePosted(conversation(), message(`@[${STRANGER}] look at this`), sender, [
      ALICE,
      BOB,
    ]);

    expect(notify).not.toHaveBeenCalled();
  });

  it('drops the stranger and keeps the colleague when both are named', async () => {
    await service.messagePosted(
      conversation(),
      message(`@[${ALICE}] @[${STRANGER}] standup at ten`),
      sender,
      [ALICE, BOB],
    );

    expect(notify.mock.calls[0]?.[0].recipients).toEqual([{ userId: ALICE }]);
  });

  it('masks the mention in the line it shows, rather than quoting a uuid at somebody', async () => {
    await service.messagePosted(conversation(), message(`@[${ALICE}] ping`), sender, [ALICE]);

    expect(notify.mock.calls[0]?.[0].body).toBe('@someone ping');
    expect(notify.mock.calls[0]?.[0].body).not.toContain(ALICE);
  });

  it('notifies a direct conversation without anybody being named', async () => {
    await service.messagePosted(
      conversation(CONVERSATION_KIND.DIRECT),
      message('Morning'),
      sender,
      [ALICE],
    );

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0].type).toBe(NOTIFICATION_TYPE.CONVERSATION_MESSAGE);
  });

  it('does not send a second notification when a direct message also names its recipient', async () => {
    // One message, one notification. The mention branch returns early for a direct conversation
    // because the message notification has already said the same thing.
    await service.messagePosted(
      conversation(CONVERSATION_KIND.DIRECT),
      message(`@[${ALICE}] morning`),
      sender,
      [ALICE],
    );

    expect(notify).toHaveBeenCalledTimes(1);
  });
});
