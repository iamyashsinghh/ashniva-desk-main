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
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: 'http://localhost:3000/api/v1' } } },
}));
