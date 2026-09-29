import {
  AVATAR_CONTENT_TYPES,
  AVATAR_PRESETS,
  type AvatarPreset,
  type UserAvatar,
  type UserRef,
} from '@ashniva/types';

import { contentMatchesDeclaredType } from '../files/file-rules';

/**
 * A person's picture, the same way everywhere it is drawn.
 *
 * Pure functions and one select fragment, so the session, the chat mappers and the avatar service
 * cannot compute it three slightly different ways. The storage key never leaves this file's
 * callers: every payload carries a `UserAvatar`, and the bytes are only reachable through
 * `GET /users/:id/avatar`, which checks who is asking.
 */

/** The columns `toUserAvatar` reads. Spread into any Prisma `select` of a user. */
export const USER_AVATAR_SELECT = {
  avatarKey: true,
  avatarPreset: true,
  avatarUpdatedAt: true,
} as const;

/** A user reference plus the picture, for payloads that draw people. */
export const USER_REF_WITH_AVATAR_SELECT = {
  id: true,
  name: true,
  email: true,
  ...USER_AVATAR_SELECT,
} as const;

export interface AvatarColumns {
  avatarKey: string | null;
  avatarPreset: string | null;
  avatarUpdatedAt: Date | null;
}

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

const EXTENSION_BY_TYPE: Record<AvatarContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** The string a photo URL carries as `?v=`: changes whenever the picture does. */
export function avatarVersion(updatedAt: Date): string {
  return updatedAt.getTime().toString(36);
}

export function toUserAvatar(columns: AvatarColumns): UserAvatar | null {
  if (columns.avatarKey && columns.avatarUpdatedAt) {
    return { kind: 'photo', version: avatarVersion(columns.avatarUpdatedAt) };
  }
  // A preset that is no longer in the list (removed in a later release) draws as initials rather
  // than as a key the clients have no icon for.
  if (columns.avatarPreset && isAvatarPreset(columns.avatarPreset)) {
    return { kind: 'preset', preset: columns.avatarPreset };
  }
  return null;
}

export function toUserRefWithAvatar(
  user: { id: string; name: string; email: string } & AvatarColumns,
): UserRef {
  return { id: user.id, name: user.name, email: user.email, avatar: toUserAvatar(user) };
}

export function isAvatarPreset(value: string): value is AvatarPreset {
  return (AVATAR_PRESETS as readonly string[]).includes(value);
}

/**
 * Which accepted image type the bytes are, or null.
 *
 * The same signatures the files module checks attachments against, asked for each accepted type
 * in turn. The file name and the client's content type are never consulted: a text file renamed
 * `me.png` is refused here, and a real WebP sent as `image/png` is stored as the WebP it is.
 */
export function detectAvatarContentType(buffer: Buffer): AvatarContentType | null {
  return AVATAR_CONTENT_TYPES.find((type) => contentMatchesDeclaredType(buffer, type)) ?? null;
}

/**
 * The object-storage key of a new photo. The extension carries the type so the download can say
 * what it is even from local storage, which records no content type of its own.
 */
export function avatarStorageKey(userId: string, id: string, type: AvatarContentType): string {
  return `avatars/${userId}/${id}.${EXTENSION_BY_TYPE[type]}`;
}

export function avatarContentTypeOf(key: string): AvatarContentType {
  const extension = key.slice(key.lastIndexOf('.') + 1);
  const match = (Object.entries(EXTENSION_BY_TYPE) as [AvatarContentType, string][]).find(
    ([, value]) => value === extension,
  );
  // Every key is written by `avatarStorageKey`; JPEG is only the answer for one that was not.
  return match?.[0] ?? 'image/jpeg';
}
