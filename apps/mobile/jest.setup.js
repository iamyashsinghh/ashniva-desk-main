/**
 * Test setup.
 *
 * The native modules are replaced with in-memory doubles rather than left to fail: a test that
 * cannot reach the Keychain is not evidence about the app, and a test that silently falls back to
 * a less secure store would be worse than no test at all. `secure-store.test.ts` asserts against
 * these doubles that the wrapper writes where it says it does.
 */
/* eslint-env node */
/* global jest, globalThis */

// React 19 requires this flag before it will let a test wrap updates in act().
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * How long an async query waits.
 *
 * The library's default is one second, which is enough once everything is warm and is not enough
 * for the first render of the first suite: React Native's module graph has to be transformed and
 * loaded, and on a CI runner that took longer than a second — so the first two tests in a file
 * failed while the rest passed, which reads like a flake and is not one.
 *
 * Deliberately below the `testTimeout` in `jest.config.js`. If it were above, jest would kill the
 * test while the query was still waiting and report "Exceeded timeout", which says nothing about
 * what was not found; below it, a genuine miss reports the element it could not find.
 *
 * Set globally rather than per call so a test added later inherits it.
 */
require('@testing-library/react-native').configure({ asyncUtilTimeout: 10_000 });

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});

/**
 * The documents folder, as a set of file names. It starts with the install marker in it, so a
 * suite is an app that has been launched before; the install-marker tests empty it to be a
 * fresh install.
 *
 * What was written is kept in `__contents`, by name, so a preference file reads back. A file
 * outside the documents folder — a picker's `file://` result — always exists: the picker just
 * made it. `delete` throws for a missing file, as the real module does.
 */
jest.mock('expo-file-system', () => {
  const files = new Set(['ashniva-installed']);
  const contents = new Map();
  class File {
    constructor(...parts) {
      const path = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
      this.inDocuments = parts[0] === 'documents';
      this.uri = path.startsWith('file://') ? path : `file:///${path}`;
      this.name = path.split('/').pop();
    }
    get exists() {
      return this.inDocuments ? files.has(this.name) : true;
    }
    write(content) {
      files.add(this.name);
      contents.set(this.name, String(content));
    }
    textSync() {
      if (!this.exists) {
        throw new Error(`No file at ${this.uri}`);
      }
      return contents.get(this.name) ?? '';
    }
    async text() {
      return this.textSync();
    }
    delete() {
      if (!this.inDocuments || !files.has(this.name)) {
        throw new Error(`No file at ${this.uri}`);
      }
      files.delete(this.name);
      contents.delete(this.name);
    }
    copySync(destination) {
      files.add(destination.name);
      contents.set(destination.name, contents.get(this.name) ?? `copy of ${this.uri}`);
    }
    async copy(destination) {
      this.copySync(destination);
    }
  }
  return { __files: files, __contents: contents, File, Paths: { document: 'documents' } };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  // The tap that launched the app. Null by default: most tests are not about a cold start, and a
  // double that always reported one would route every screen to a notification's target.
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

/**
 * The pickers.
 *
 * Cancelled by default. A picker that returns a file unasked would make every test that renders
 * an attachment card upload something, and "the person chose nothing" is the case the code has to
 * survive anyway.
 */
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: 'http://localhost:3000/api/v1' } } },
}));
