import {
  avatarContentTypeOf,
  avatarStorageKey,
  toUserAvatar,
  toUserRefWithAvatar,
} from './user-avatar';

describe('toUserAvatar', () => {
  const at = new Date('2026-09-28T10:00:00Z');

  it('is a photo with a version derived from when it changed', () => {
    expect(
      toUserAvatar({ avatarKey: 'avatars/u/a.png', avatarPreset: null, avatarUpdatedAt: at }),
    ).toEqual({ kind: 'photo', version: at.getTime().toString(36) });
  });

  it('is a preset when one is chosen', () => {
    expect(toUserAvatar({ avatarKey: null, avatarPreset: 'sun', avatarUpdatedAt: at })).toEqual({
      kind: 'preset',
      preset: 'sun',
    });
  });

  it('is null for nothing, and for a preset the clients no longer know', () => {
    expect(toUserAvatar({ avatarKey: null, avatarPreset: null, avatarUpdatedAt: null })).toBeNull();
    expect(
      toUserAvatar({ avatarKey: null, avatarPreset: 'retired', avatarUpdatedAt: at }),
    ).toBeNull();
  });

  it('never puts the storage key into a user reference', () => {
    const ref = toUserRefWithAvatar({
      id: 'u',
      name: 'Priya',
      email: 'p@example.com',
      avatarKey: 'avatars/u/secret.png',
      avatarPreset: null,
      avatarUpdatedAt: at,
    });

    expect(JSON.stringify(ref)).not.toContain('avatars/');
  });
});

describe('avatar storage keys', () => {
  it('round-trips the content type through the key', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'] as const) {
      expect(avatarContentTypeOf(avatarStorageKey('u', 'id', type))).toBe(type);
    }
  });
});
