import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  MAX_AVATAR_BYTES,
  type AuthenticatedUser,
  type AvatarPreset,
  type UserAvatar,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import {
  avatarContentTypeOf,
  avatarStorageKey,
  detectAvatarContentType,
  toUserAvatar,
  type AvatarColumns,
} from './user-avatar';
import { UserAvatarRepository, type AvatarChange } from './user-avatar.repository';

/** Multer's file, narrowed to what this service reads. */
export interface UploadedAvatar {
  size: number;
  buffer: Buffer;
}

export interface AvatarDownload {
  stream: Readable;
  contentType: string;
  sizeBytes: number | undefined;
}

const NO_PHOTO = 'This person has no profile photo';

/**
 * Somebody's own picture: upload a photo, choose a preset, clear it, and serve a photo to the
 * people allowed to see it.
 *
 * Only ever the signed-in person's own picture — the write routes take no user id at all — so the
 * one authorization question is on the read: may this caller see that face?
 */
@Injectable()
export class UserAvatarService {
  constructor(
    private readonly avatars: UserAvatarRepository,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UserAvatarService.name);
  }

  async uploadPhoto(
    actor: AuthenticatedUser,
    file: UploadedAvatar | undefined,
  ): Promise<UserAvatar> {
    if (!file) {
      throw new BadRequestException('Send the photo in the "file" multipart field');
    }
    // Multer enforces the same limit; this is for any path that reaches here without it.
    if (file.size > MAX_AVATAR_BYTES || file.buffer.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Profile photos are limited to 2 MB');
    }
    const contentType = detectAvatarContentType(file.buffer);
    if (!contentType) {
      throw new BadRequestException('A profile photo must be a JPEG, PNG or WebP image');
    }

    const current = await this.requireOwn(actor);
    const key = avatarStorageKey(actor.userId, randomUUID(), contentType);
    await this.storage.putObject({
      key,
      body: file.buffer,
      contentType,
      contentLength: file.buffer.length,
    });
    const change: AvatarChange = {
      avatarKey: key,
      avatarPreset: null,
      avatarUpdatedAt: nextVersionTime(current),
    };
    try {
      await this.avatars.update(actor.userId, change);
    } catch (error) {
      // The row still points at the previous photo, so the new object would be an orphan.
      await this.discard(key);
      throw error;
    }
    await this.afterChange(actor, current, change, 'photo');
    return toUserAvatar(change) as UserAvatar;
  }

  async choosePreset(actor: AuthenticatedUser, preset: AvatarPreset): Promise<UserAvatar> {
    const current = await this.requireOwn(actor);
    const change: AvatarChange = {
      avatarKey: null,
      avatarPreset: preset,
      avatarUpdatedAt: nextVersionTime(current),
    };
    await this.avatars.update(actor.userId, change);
    await this.afterChange(actor, current, change, 'preset');
    return toUserAvatar(change) as UserAvatar;
  }

  async clear(actor: AuthenticatedUser): Promise<void> {
    const current = await this.requireOwn(actor);
    if (!current.avatarKey && !current.avatarPreset) {
      return;
    }
    const change: AvatarChange = { avatarKey: null, avatarPreset: null, avatarUpdatedAt: null };
    await this.avatars.update(actor.userId, change);
    await this.afterChange(actor, current, change, 'none');
  }

  /**
   * The photo of `userId`, for a caller who may see it.
   *
   * Yourself, or anybody with a membership in the organization you are signed in to. Anything else
   * — another tenant's person, an id that does not exist, somebody with a preset or no picture —
   * is the same 404, so the route answers nothing about people the caller has no business with.
   */
  async openPhoto(actor: AuthenticatedUser, userId: string): Promise<AvatarDownload> {
    const row =
      userId === actor.userId
        ? await this.avatars.findOwn(userId)
        : await this.avatars.findInTenant(userId);
    if (!row?.avatarKey) {
      throw new NotFoundException(NO_PHOTO);
    }
    try {
      const object = await this.storage.getObject(row.avatarKey);
      return {
        stream: object.stream as Readable,
        contentType: avatarContentTypeOf(row.avatarKey),
        sizeBytes: object.contentLength,
      };
    } catch (error) {
      this.logger.warn({ userId, err: error }, 'A profile photo row points at a missing object');
      throw new NotFoundException(NO_PHOTO);
    }
  }

  private async requireOwn(actor: AuthenticatedUser): Promise<AvatarColumns> {
    const row = await this.avatars.findOwn(actor.userId);
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return row;
  }

  /** Removes the photo the change replaced, and records what kind of picture they now have. */
  private async afterChange(
    actor: AuthenticatedUser,
    before: AvatarColumns,
    after: AvatarChange,
    kind: 'photo' | 'preset' | 'none',
  ): Promise<void> {
    if (before.avatarKey && before.avatarKey !== after.avatarKey) {
      await this.discard(before.avatarKey);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: actor.userId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { avatar: kind, ...(after.avatarPreset ? { preset: after.avatarPreset } : {}) },
    });
  }

  /**
   * Best effort. The picture has already changed for everybody; a leftover object costs storage,
   * not correctness, and failing the request over it would tell the person their change failed.
   */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch (error) {
      this.logger.warn({ key, err: error }, 'Could not delete a replaced profile photo');
    }
  }
}

/**
 * Now, or one millisecond after the previous change if the clock has not moved past it.
 *
 * The photo URL's version is derived from this, so two changes inside one millisecond must still
 * produce two versions — otherwise a client would keep drawing the picture it cached first.
 */
function nextVersionTime(current: AvatarColumns): Date {
  const now = Date.now();
  const previous = current.avatarUpdatedAt?.getTime() ?? 0;
  return new Date(Math.max(now, previous + 1));
}
