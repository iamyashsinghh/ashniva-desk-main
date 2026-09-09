import * as SecureStore from 'expo-secure-store';

import {
  SECURE_KEYS,
  clearSecureSession,
  deleteSecure,
  isSecureStorageAvailable,
  readSecure,
  readSecureJson,
  writeSecure,
  writeSecureJson,
} from './secure-store';

/**
 * The secure-storage wrapper.
 *
 * The assertion that matters is the first one: tokens go to `expo-secure-store` and nowhere else.
 * Everything after it is about the wrapper not falling over when the platform does.
 */

const mocked = SecureStore as unknown as {
  __store: Map<string, string>;
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  isAvailableAsync: jest.Mock;
};

beforeEach(() => {
  mocked.__store.clear();
  jest.clearAllMocks();
});

describe('where tokens are stored', () => {
  it('writes to secure storage, not to any other store', async () => {
    await writeSecure(SECURE_KEYS.refreshToken, 'refresh-abc');

    expect(mocked.setItemAsync).toHaveBeenCalledWith(
      SECURE_KEYS.refreshToken,
      'refresh-abc',
      expect.anything(),
    );
    expect(mocked.__store.get(SECURE_KEYS.refreshToken)).toBe('refresh-abc');
  });

  it('asks the keychain to keep the value on this device only', async () => {
    await writeSecure(SECURE_KEYS.refreshToken, 'refresh-abc');

    const options = mocked.setItemAsync.mock.calls[0]?.[2] as { keychainAccessible?: string };
    // Not carried to a new device by a backup restore: a session should not migrate.
    expect(options.keychainAccessible).toBe('WHEN_UNLOCKED_THIS_DEVICE_ONLY');
  });

  it('reads back what it wrote', async () => {
    await writeSecure(SECURE_KEYS.refreshToken, 'refresh-abc');
    await expect(readSecure(SECURE_KEYS.refreshToken)).resolves.toBe('refresh-abc');
  });

  it('returns null for a key that was never written', async () => {
    await expect(readSecure(SECURE_KEYS.refreshToken)).resolves.toBeNull();
  });
});

describe('when the platform fails', () => {
  it('treats an unreadable value as absent rather than throwing', async () => {
    mocked.getItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(readSecure(SECURE_KEYS.refreshToken)).resolves.toBeNull();
  });

  it('reports a failed write rather than pretending it worked', async () => {
    // The caller needs to know: a session that could not be stored will not survive a restart.
    mocked.setItemAsync.mockRejectedValueOnce(new Error('no passcode set'));
    await expect(writeSecure(SECURE_KEYS.refreshToken, 'x')).resolves.toBe(false);
  });

  it('reports a successful write', async () => {
    await expect(writeSecure(SECURE_KEYS.refreshToken, 'x')).resolves.toBe(true);
  });

  it('does not throw when a delete fails', async () => {
    mocked.deleteItemAsync.mockRejectedValueOnce(new Error('gone'));
    await expect(deleteSecure(SECURE_KEYS.refreshToken)).resolves.toBeUndefined();
  });

  it('reports availability, and false when the check itself throws', async () => {
    await expect(isSecureStorageAvailable()).resolves.toBe(true);
    mocked.isAvailableAsync.mockRejectedValueOnce(new Error('nope'));
    await expect(isSecureStorageAvailable()).resolves.toBe(false);
  });
});

describe('clearing', () => {
  it('removes every key the app stores', async () => {
    await writeSecure(SECURE_KEYS.refreshToken, 'refresh');
    await writeSecureJson(SECURE_KEYS.sessionUser, { id: 'u1' });

    await clearSecureSession();

    expect(mocked.__store.size).toBe(0);
  });
});

describe('JSON values', () => {
  it('round-trips an object', async () => {
    await writeSecureJson(SECURE_KEYS.sessionUser, { id: 'u1', name: 'Priya' });
    await expect(readSecureJson(SECURE_KEYS.sessionUser)).resolves.toEqual({
      id: 'u1',
      name: 'Priya',
    });
  });

  it('discards a corrupted value rather than returning half of it', async () => {
    mocked.__store.set(SECURE_KEYS.sessionUser, '{not json');

    await expect(readSecureJson(SECURE_KEYS.sessionUser)).resolves.toBeNull();
    expect(mocked.__store.has(SECURE_KEYS.sessionUser)).toBe(false);
  });
});
