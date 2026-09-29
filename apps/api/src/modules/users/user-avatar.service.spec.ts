import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_AVATAR_BYTES, type AuthenticatedUser, type UserAvatar } from '@ashniva/types';
import type { PinoLogger } from 'nestjs-pino';
import { Readable } from 'node:stream';

import type { StorageService } from '../../infrastructure/storage/storage.service';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { AvatarColumns } from './user-avatar';
import type { AvatarChange, UserAvatarRepository } from './user-avatar.repository';
import { UserAvatarService } from './user-avatar.service';

/**
 * A profile photo is a file a stranger's browser will draw, so the bytes decide what it is and the
 * read decides who may see it. These tests hold both: a renamed text file is refused, and a person
 * outside the caller's organization is as absent as one who does not exist.
 */

const ME = '018f0000-0000-7000-8000-000000000001';
const COLLEAGUE = '018f0000-0000-7000-8000-000000000002';
const actor = { userId: ME, organizationId: 'org-1' } as AuthenticatedUser;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);

function file(buffer: Buffer, size = buffer.length) {
  return { buffer, size };
}

function noAvatar(): AvatarColumns {
  return { avatarKey: null, avatarPreset: null, avatarUpdatedAt: null };
}

describe('UserAvatarService', () => {
  let stored: AvatarColumns;
  let repository: jest.Mocked<Pick<UserAvatarRepository, 'findOwn' | 'findInTenant' | 'update'>>;
  let storage: { putObject: jest.Mock; getObject: jest.Mock; deleteObject: jest.Mock };
  let service: UserAvatarService;

  beforeEach(() => {
    stored = noAvatar();
    repository = {
      findOwn: jest.fn(async (_id: string): Promise<AvatarColumns | null> => ({ ...stored })),
      findInTenant: jest.fn(async (_id: string): Promise<AvatarColumns | null> => null),
      update: jest.fn(async (_id: string, change: AvatarChange) => {
        stored = { ...change };
      }),
    };
    storage = {
      putObject: jest.fn().mockResolvedValue(undefined),
      getObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    const logger = { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger;
    service = new UserAvatarService(
      repository as unknown as UserAvatarRepository,
      storage as unknown as StorageService,
      audit,
      logger,
    );
  });

  it.each([
    ['JPEG', JPEG, 'image/jpeg', /\.jpg$/],
    ['PNG', PNG, 'image/png', /\.png$/],
    ['WebP', WEBP, 'image/webp', /\.webp$/],
  ])('accepts a %s photo by its bytes', async (_label, bytes, contentType, extension) => {
    const avatar = await service.uploadPhoto(actor, file(bytes));

    expect(avatar.kind).toBe('photo');
    const put = storage.putObject.mock.calls[0]?.[0];
    expect(put.contentType).toBe(contentType);
    expect(put.key).toMatch(new RegExp(`^avatars/${ME}/[0-9a-f-]{36}`));
    expect(put.key).toMatch(extension);
  });

  it('refuses a text file whatever it is called, and stores nothing', async () => {
    // Multer's name and content type are the client's word; the service never reads them.
    const upload = { ...file(Buffer.from('<svg onload="alert(1)">')), originalname: 'me.png' };

    await expect(service.uploadPhoto(actor, upload)).rejects.toThrow(
      'A profile photo must be a JPEG, PNG or WebP image',
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('refuses a photo over the limit even if the bytes are a real image', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_AVATAR_BYTES)]);

    await expect(service.uploadPhoto(actor, file(big))).rejects.toThrow(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('refuses a request with no file', async () => {
    await expect(service.uploadPhoto(actor, undefined)).rejects.toThrow(BadRequestException);
  });

  it('replaces the previous photo and deletes its object', async () => {
    stored = {
      avatarKey: `avatars/${ME}/old.png`,
      avatarPreset: null,
      avatarUpdatedAt: new Date('2026-09-01T00:00:00Z'),
    };

    await service.uploadPhoto(actor, file(JPEG));

    expect(storage.deleteObject).toHaveBeenCalledWith(`avatars/${ME}/old.png`);
    expect(stored.avatarPreset).toBeNull();
  });

  it('still succeeds when the old object cannot be deleted', async () => {
    stored = { avatarKey: 'avatars/x/old.png', avatarPreset: null, avatarUpdatedAt: new Date() };
    storage.deleteObject.mockRejectedValueOnce(new Error('storage down'));

    await expect(service.uploadPhoto(actor, file(PNG))).resolves.toMatchObject({ kind: 'photo' });
  });

  it('removes the uploaded object when the row cannot be written', async () => {
    repository.update.mockRejectedValueOnce(new Error('db down'));

    await expect(service.uploadPhoto(actor, file(PNG))).rejects.toThrow('db down');
    const key = storage.putObject.mock.calls[0]?.[0].key;
    expect(storage.deleteObject).toHaveBeenCalledWith(key);
  });

  it('changes the version on every upload, even inside one millisecond', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-28T10:00:00Z').getTime());
    try {
      const first = (await service.uploadPhoto(actor, file(PNG))) as UserAvatar & {
        version: string;
      };
      const second = (await service.uploadPhoto(actor, file(JPEG))) as UserAvatar & {
        version: string;
      };

      expect(second.version).not.toBe(first.version);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('choosing a preset clears the photo and deletes its object', async () => {
    stored = {
      avatarKey: `avatars/${ME}/old.webp`,
      avatarPreset: null,
      avatarUpdatedAt: new Date(),
    };

    const avatar = await service.choosePreset(actor, 'rocket');

    expect(avatar).toEqual({ kind: 'preset', preset: 'rocket' });
    expect(stored.avatarKey).toBeNull();
    expect(storage.deleteObject).toHaveBeenCalledWith(`avatars/${ME}/old.webp`);
  });

  it('clearing removes both kinds of picture', async () => {
    stored = {
      avatarKey: `avatars/${ME}/old.jpg`,
      avatarPreset: null,
      avatarUpdatedAt: new Date(),
    };

    await service.clear(actor);

    expect(stored).toEqual(noAvatar());
    expect(storage.deleteObject).toHaveBeenCalledWith(`avatars/${ME}/old.jpg`);
  });

  describe('openPhoto', () => {
    it('serves a colleague in the same organization', async () => {
      repository.findInTenant.mockResolvedValueOnce({
        avatarKey: `avatars/${COLLEAGUE}/a.webp`,
        avatarPreset: null,
        avatarUpdatedAt: new Date(),
      });
      storage.getObject.mockResolvedValueOnce({ stream: Readable.from([]), contentLength: 12 });

      const photo = await service.openPhoto(actor, COLLEAGUE);

      expect(photo.contentType).toBe('image/webp');
      expect(repository.findInTenant).toHaveBeenCalledWith(COLLEAGUE);
    });

    it('answers 404 for somebody outside the caller’s organization', async () => {
      // `findInTenant` requires a membership in the caller's tenant, so another tenant's person
      // comes back as no row at all — the same answer as an id that does not exist.
      await expect(service.openPhoto(actor, COLLEAGUE)).rejects.toThrow(NotFoundException);
      expect(storage.getObject).not.toHaveBeenCalled();
    });

    it('answers 404 for somebody with a preset rather than a photo', async () => {
      repository.findInTenant.mockResolvedValueOnce({
        avatarKey: null,
        avatarPreset: 'leaf',
        avatarUpdatedAt: new Date(),
      });

      await expect(service.openPhoto(actor, COLLEAGUE)).rejects.toThrow(NotFoundException);
    });

    it('reads your own photo without asking about the tenant', async () => {
      stored = {
        avatarKey: `avatars/${ME}/me.png`,
        avatarPreset: null,
        avatarUpdatedAt: new Date(),
      };
      storage.getObject.mockResolvedValueOnce({ stream: Readable.from([]) });

      await service.openPhoto(actor, ME);

      expect(repository.findInTenant).not.toHaveBeenCalled();
    });
  });
});
