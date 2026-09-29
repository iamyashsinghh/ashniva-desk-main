import * as Notifications from 'expo-notifications';

import { apiRequest } from '../api/client';
import {
  registerForPush,
  registerIfPermitted,
  resetPushRegistrationForTests,
  unregisterPushDevice,
} from './push-registration';

/**
 * Filing this phone's push token with the API, and forgetting it on sign-out.
 *
 * The properties that matter: launch never shows a permission prompt; a token is only sent when
 * one could honestly be obtained; and sign-out forgets exactly the token that was filed, without
 * ever throwing or hanging.
 */

jest.mock('../api/client', () => ({ apiRequest: jest.fn(async () => undefined) }));

// `mock`-prefixed so the factory below may close over it; the tests change the project id. Read
// through getters because the factory runs while the imports load, before this line has run.
const mockConfig: { expoConfig: { extra: Record<string, unknown> }; easConfig: unknown } = {
  expoConfig: { extra: {} },
  easConfig: null,
};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig.expoConfig;
    },
    get easConfig() {
      return mockConfig.easConfig;
    },
  },
}));

const request = apiRequest as jest.Mock;
const permissions = Notifications.getPermissionsAsync as jest.Mock;
const ask = Notifications.requestPermissionsAsync as jest.Mock;
const token = Notifications.getExpoPushTokenAsync as jest.Mock;

const PROJECT_ID = '5a1e6c4e-0000-4000-8000-000000000001';

beforeEach(() => {
  jest.useRealTimers();
  resetPushRegistrationForTests();
  request.mockReset().mockResolvedValue(undefined);
  permissions.mockReset().mockResolvedValue({ status: 'granted' });
  ask.mockReset().mockResolvedValue({ status: 'granted' });
  token.mockReset().mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  mockConfig.expoConfig.extra = { eas: { projectId: PROJECT_ID } };
  mockConfig.easConfig = null;
});

describe('registering at launch', () => {
  it('files the token with the platform when permission was already granted', async () => {
    const result = await registerIfPermitted();

    expect(token).toHaveBeenCalledWith({ projectId: PROJECT_ID });
    expect(request).toHaveBeenCalledWith('/notifications/push/devices', {
      method: 'POST',
      body: { token: 'ExponentPushToken[abc]', platform: 'IOS' },
    });
    expect(result).toEqual({
      permission: 'granted',
      token: 'ExponentPushToken[abc]',
      registered: true,
    });
  });

  it('never asks for permission — that belongs to the Profile screen', async () => {
    permissions.mockResolvedValue({ status: 'undetermined' });

    const result = await registerIfPermitted();

    expect(ask).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(result.permission).toBe('undetermined');
  });

  it('skips quietly before `eas init` has written a project id', async () => {
    mockConfig.expoConfig.extra = {};

    const result = await registerIfPermitted();

    expect(token).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({ permission: 'granted', token: null, registered: false });
  });

  it('uses the EAS config id when the app config has none', async () => {
    mockConfig.expoConfig.extra = {};
    mockConfig.easConfig = { projectId: PROJECT_ID };

    await registerIfPermitted();

    expect(token).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it('skips quietly where Expo cannot mint a token (simulator, Expo Go on Android)', async () => {
    token.mockRejectedValue(new Error('No push on this device'));

    const result = await registerIfPermitted();

    expect(request).not.toHaveBeenCalled();
    expect(result.registered).toBe(false);
  });
});

describe('the "enable" button', () => {
  it('asks, and registers once allowed', async () => {
    permissions.mockResolvedValue({ status: 'undetermined' });

    const result = await registerForPush();

    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.registered).toBe(true);
  });

  it('files nothing when the person says no', async () => {
    permissions.mockResolvedValue({ status: 'undetermined' });
    ask.mockResolvedValue({ status: 'denied' });

    expect((await registerForPush()).permission).toBe('denied');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('unregistering before sign-out', () => {
  it('forgets exactly the token that was filed', async () => {
    await registerIfPermitted();
    request.mockClear();

    await unregisterPushDevice();

    expect(request).toHaveBeenCalledWith(
      '/notifications/push/devices/unregister',
      expect.objectContaining({ method: 'POST', body: { token: 'ExponentPushToken[abc]' } }),
    );
  });

  it('sends nothing when this device never registered', async () => {
    await unregisterPushDevice();
    expect(request).not.toHaveBeenCalled();
  });

  it('sends it once, not again on a second sign-out', async () => {
    await registerIfPermitted();
    request.mockClear();

    await unregisterPushDevice();
    await unregisterPushDevice();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('never throws, so sign-out always completes', async () => {
    await registerIfPermitted();
    request.mockRejectedValue(new Error('offline'));

    await expect(unregisterPushDevice()).resolves.toBeUndefined();
  });

  it('gives up after a few seconds rather than holding sign-out hostage', async () => {
    await registerIfPermitted();
    jest.useFakeTimers();
    request.mockImplementation(() => new Promise(() => undefined));

    const done = unregisterPushDevice();
    await jest.advanceTimersByTimeAsync(4_000);

    await expect(done).resolves.toBeUndefined();
  });
});
