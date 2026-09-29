import type { MessagePage, MessageSummary } from '@ashniva/types';
import type { InfiniteData } from '@tanstack/react-query';

import { appendLiveMessage, applyLiveChange, threadMessages, upsertMessage } from './live-thread';

function message(id: string, over: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id,
    conversationId: 'c1',
    sender: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
    body: `Line ${id}`,
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

function data(...pages: MessageSummary[][]): InfiniteData<MessagePage> {
  return {
    pages: pages.map((items) => ({ items, nextCursor: null })),
    pageParams: pages.map(() => null),
  };
}

const ids = (value: InfiniteData<MessagePage> | undefined) =>
  threadMessages(value).map((item) => item.id);

describe('live thread', () => {
  it('appends an arriving line once, and leaves an unloaded thread alone', () => {
    const once = appendLiveMessage(data([message('a')]), message('b'));
    expect(ids(once)).toEqual(['a', 'b']);
    expect(appendLiveMessage(once, message('b'))).toBe(once);
    expect(appendLiveMessage(undefined, message('b'))).toBeUndefined();
  });

  it('replaces the fan-out copy of the viewer’s own send with the server’s answer', () => {
    const fanOut = data([message('a'), message('mine', { canEdit: false })]);
    const landed = upsertMessage(fanOut, message('mine', { canEdit: true }));
    expect(threadMessages(landed).find((item) => item.id === 'mine')?.canEdit).toBe(true);
    expect(ids(landed)).toEqual(['a', 'mine']);
  });

  it('never hands the list the same id twice when a line sits in two pages', () => {
    // Page 0 is the newest window; page 1 is older. A splice racing a refetch can leave a line in
    // both, and a keyed list given a duplicate key drops or repeats rows.
    const racing = data([message('b'), message('c')], [message('a'), message('b')]);
    expect(ids(racing)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the reader’s Edit control through somebody’s live edit, and drops it on withdrawal', () => {
    const held = data([message('a', { canEdit: true, canDelete: true })]);
    const edited = applyLiveChange(held, message('a', { body: 'Changed', canEdit: false }));
    expect(threadMessages(edited)[0]).toMatchObject({ body: 'Changed', canEdit: true });

    const withdrawn = applyLiveChange(
      held,
      message('a', { deletedAt: '2026-09-13T09:05:00.000Z', canEdit: false }),
    );
    expect(threadMessages(withdrawn)[0]?.canEdit).toBe(false);
  });

  it('keeps a quote the reader could see when the broadcast copy calls it unavailable', () => {
    const quote = {
      id: 'q',
      sender: null,
      bodyPreview: 'Original',
      attachmentCount: 0,
      deleted: false,
      unavailable: false,
    };
    const held = data([message('a', { replyTo: quote })]);
    const changed = applyLiveChange(
      held,
      message('a', { body: 'Edited', replyTo: { ...quote, bodyPreview: '', unavailable: true } }),
    );
    expect(threadMessages(changed)[0]?.replyTo).toEqual(quote);
  });
});
