import { MESSAGE_REPLY_PREVIEW_LENGTH, type MessageReplyRef } from '@ashniva/types';

import { toUserRefWithAvatar } from '../users/user-avatar';
import type { ReplyToRow } from './conversations.repository';
import { mayViewMessage, type MessageViewer } from './message-visibility';

/** Same shape as the mention pattern in `@ashniva/types`, which does not export its regex. */
const MENTION_TOKEN = /@\[[0-9a-fA-F-]{36}\]/g;

/**
 * The quoted original of a reply, as it reads to one caller now.
 *
 * `viewer` is the person the payload is for. Null means the payload is shared — a realtime event
 * fanned out to a whole audience — and then the most restrictive reader decides: a restricted
 * original is quoted as unavailable to everybody, because somebody receiving the event may be
 * outside the tag list, and each client refetches its own copy of the thread anyway.
 */
export function toMessageReplyRef(
  original: ReplyToRow | null,
  viewer: MessageViewer | null,
): MessageReplyRef | null {
  if (!original) {
    return null;
  }
  const visible = viewer
    ? mayViewMessage(viewer, original)
    : original.restrictedToUserIds.length === 0;
  if (!visible) {
    return {
      id: original.id,
      sender: null,
      bodyPreview: '',
      attachmentCount: 0,
      deleted: false,
      unavailable: true,
    };
  }
  const sender = original.sender ? toUserRefWithAvatar(original.sender) : null;
  if (original.deletedAt) {
    return {
      id: original.id,
      sender,
      bodyPreview: '',
      attachmentCount: 0,
      deleted: true,
      unavailable: false,
    };
  }
  return {
    id: original.id,
    sender,
    bodyPreview: replyPreview(original.body),
    attachmentCount: original._count.attachments,
    deleted: false,
    unavailable: false,
  };
}

/**
 * The start of a body, at most `MESSAGE_REPLY_PREVIEW_LENGTH` characters.
 *
 * Mention tokens are kept raw — the clients resolve them into names — so a cut must never land
 * inside one: half a token renders as a stray `@[3f1d…` rather than as a person. Nor inside a
 * surrogate pair, which would leave half an emoji.
 */
export function replyPreview(body: string): string {
  if (body.length <= MESSAGE_REPLY_PREVIEW_LENGTH) {
    return body;
  }
  let end = MESSAGE_REPLY_PREVIEW_LENGTH;
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const start = match.index;
    if (start >= end) {
      break;
    }
    if (start + match[0].length > end) {
      end = start;
      break;
    }
  }
  const last = body.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    end -= 1;
  }
  return body.slice(0, end).trimEnd();
}
