import { MESSAGE_REPLY_PREVIEW_LENGTH } from '@ashniva/types';

import type { MessageViewer, ReplyToRow } from './conversations.repository';
import { replyPreview, toMessageReplyRef } from './message-reply';

/**
 * A quote must never be a way to read around a tag. These tests hold the three answers a quoted
 * original can give — readable, withdrawn, unavailable — and which reader gets which.
 */

const ALICE = '018f0000-0000-7000-8000-00000000000a';
const BOB = '018f0000-0000-7000-8000-00000000000b';
const CAROL = '018f0000-0000-7000-8000-00000000000c';

function original(overrides: Partial<ReplyToRow> = {}): ReplyToRow {
  return {
    id: 'original-1',
    senderId: ALICE,
    body: 'Can somebody check the deploy?',
    restrictedToUserIds: [],
    deletedAt: null,
    sender: {
      id: ALICE,
      name: 'Alice',
      email: 'alice@example.com',
      avatarKey: null,
      avatarPreset: 'rocket',
      avatarUpdatedAt: new Date('2026-09-01T00:00:00Z'),
    },
    _count: { attachments: 2 },
    ...overrides,
  };
}

const viewer = (userId: string, readsEveryTagged = false): MessageViewer => ({
  userId,
  readsEveryTagged,
});

describe('toMessageReplyRef', () => {
  it('is null when the message answers nothing', () => {
    expect(toMessageReplyRef(null, viewer(BOB))).toBeNull();
  });

  it('quotes a readable original with its sender, preview and live attachment count', () => {
    expect(toMessageReplyRef(original(), viewer(BOB))).toEqual({
      id: 'original-1',
      sender: {
        id: ALICE,
        name: 'Alice',
        email: 'alice@example.com',
        avatar: { kind: 'preset', preset: 'rocket' },
      },
      bodyPreview: 'Can somebody check the deploy?',
      attachmentCount: 2,
      deleted: false,
      unavailable: false,
    });
  });

  it('gives a reader outside the tag list nothing but the id', () => {
    const tagged = original({ restrictedToUserIds: [CAROL] });

    expect(toMessageReplyRef(tagged, viewer(BOB))).toEqual({
      id: 'original-1',
      sender: null,
      bodyPreview: '',
      attachmentCount: 0,
      deleted: false,
      unavailable: true,
    });
  });

  it('quotes a tagged original to the people who may read it', () => {
    const tagged = original({ restrictedToUserIds: [CAROL] });

    expect(toMessageReplyRef(tagged, viewer(CAROL))?.unavailable).toBe(false);
    expect(toMessageReplyRef(tagged, viewer(ALICE))?.unavailable).toBe(false);
    expect(toMessageReplyRef(tagged, viewer(BOB, true))?.unavailable).toBe(false);
  });

  it('quotes a tagged original as unavailable in a payload shared by a whole audience', () => {
    const tagged = original({ restrictedToUserIds: [CAROL] });

    expect(toMessageReplyRef(tagged, null)?.unavailable).toBe(true);
    expect(toMessageReplyRef(original(), null)?.unavailable).toBe(false);
  });

  it('quotes a withdrawn original as withdrawn: sender kept, words and files gone', () => {
    const ref = toMessageReplyRef(original({ deletedAt: new Date() }), viewer(BOB));

    expect(ref).toMatchObject({ deleted: true, unavailable: false, bodyPreview: '' });
    expect(ref?.attachmentCount).toBe(0);
    expect(ref?.sender?.id).toBe(ALICE);
  });
});

describe('replyPreview', () => {
  it('keeps a short body whole', () => {
    expect(replyPreview('hello')).toBe('hello');
  });

  it('cuts a long body at the limit', () => {
    expect(replyPreview('x'.repeat(500))).toHaveLength(MESSAGE_REPLY_PREVIEW_LENGTH);
  });

  it('never leaves half a mention token', () => {
    const token = `@[${BOB}]`;
    const body = `${'a'.repeat(MESSAGE_REPLY_PREVIEW_LENGTH - 10)} ${token} after`;

    const preview = replyPreview(body);

    expect(preview).not.toContain('@[');
    expect(preview.length).toBeLessThanOrEqual(MESSAGE_REPLY_PREVIEW_LENGTH);
  });

  it('keeps a mention that fits entirely', () => {
    const token = `@[${BOB}]`;
    const body = `${token} ${'b'.repeat(500)}`;

    expect(replyPreview(body).startsWith(token)).toBe(true);
  });

  it('does not split an emoji', () => {
    const body = `${'a'.repeat(MESSAGE_REPLY_PREVIEW_LENGTH - 1)}😀 tail`;

    expect(replyPreview(body)).toBe('a'.repeat(MESSAGE_REPLY_PREVIEW_LENGTH - 1));
  });
});
