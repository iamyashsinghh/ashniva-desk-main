import { NOTIFICATION_TYPE } from '@ashniva/types';

import type { AppConfigService } from '../../../config/app-config.service';
import {
  BlockedRequestError,
  type SafeHttpService,
  type SafeRequestInit,
} from '../../../infrastructure/http/safe-http.service';
import type { DevicePushTokensService } from '../device-push-tokens.service';
import type { NotificationsRepository } from '../notifications.repository';
import {
  EXPO_BATCH_SIZE,
  EXPO_PUSH_URL,
  ExpoPushNotificationChannel,
  type ExpoPushMessage,
} from './expo-push.channel';
import type { NotificationMessage } from './notification-channel.interface';

const MESSAGE: NotificationMessage = {
  notificationId: 'notification-1',
  groupedCount: 1,
  recipientUserId: 'user-1',
  organizationId: 'org-1',
  type: NOTIFICATION_TYPE.TICKET_REPLY,
  title: 'A reply on your ticket',
  body: 'Asha replied',
  link: '/tickets/ticket-1',
  entityType: 'TICKET',
  entityId: 'ticket-1',
};

function tokenList(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `ExponentPushToken[device-${index}]`);
}

function okTickets(count: number): Response {
  return jsonResponse({ data: Array.from({ length: count }, () => ({ status: 'ok', id: 'x' })) });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function build(options: {
  tokens?: string[];
  fetch?: jest.Mock;
  enabled?: boolean;
  accessToken?: string;
}) {
  const fetchMock =
    options.fetch ??
    jest.fn(async (_url: string, init: SafeRequestInit) =>
      okTickets((JSON.parse(init.body ?? '[]') as unknown[]).length),
    );
  const http = { fetch: fetchMock, logRefusal: jest.fn() } as unknown as SafeHttpService;
  const tokens = {
    tokensFor: jest.fn().mockResolvedValue(options.tokens ?? ['ExponentPushToken[device-0]']),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = { unreadCount: jest.fn().mockResolvedValue(3) };
  const tenantContext = { runAsSystem: <T>(run: () => Promise<T>) => run() };
  const config = {
    expoPush: { enabled: options.enabled ?? true, accessToken: options.accessToken },
  } as unknown as AppConfigService;
  const logger = { setContext: jest.fn(), warn: jest.fn() };
  const channel = new ExpoPushNotificationChannel(
    tokens as unknown as DevicePushTokensService,
    notifications as unknown as NotificationsRepository,
    http,
    // Used through one method each; the casts say "only these".
    tenantContext as never,
    config,
    logger as never,
  );
  return { channel, fetchMock, tokens, http, logger };
}

function sentBatch(fetchMock: jest.Mock, call = 0): ExpoPushMessage[] {
  const init = fetchMock.mock.calls[call]?.[1] as SafeRequestInit;
  return JSON.parse(init.body ?? '[]') as ExpoPushMessage[];
}

describe('ExpoPushNotificationChannel', () => {
  it('posts to Expo through the destination guard with the native data payload', async () => {
    const { channel, fetchMock, tokens } = build({});

    await channel.send(MESSAGE);

    expect(tokens.tokensFor).toHaveBeenCalledWith('org-1', ['user-1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(EXPO_PUSH_URL);
    expect((fetchMock.mock.calls[0]?.[1] as SafeRequestInit).method).toBe('POST');
    expect(sentBatch(fetchMock)).toEqual([
      {
        to: 'ExponentPushToken[device-0]',
        title: 'A reply on your ticket',
        body: 'Asha replied',
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        badge: 3,
        data: {
          notificationId: 'notification-1',
          groupedCount: 1,
          type: 'TICKET_REPLY',
          link: '/tickets/ticket-1',
          entityType: 'TICKET',
          entityId: 'ticket-1',
        },
      },
    ]);
  });

  it('splits a large device list into batches of 100', async () => {
    const { channel, fetchMock } = build({ tokens: tokenList(EXPO_BATCH_SIZE * 2 + 5) });

    await channel.send(MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentBatch(fetchMock, 0)).toHaveLength(100);
    expect(sentBatch(fetchMock, 1)).toHaveLength(100);
    expect(sentBatch(fetchMock, 2)).toHaveLength(5);
  });

  it('deletes only the tokens Expo reports as DeviceNotRegistered', async () => {
    const fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { status: 'ok', id: 'a' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
        ],
      }),
    );
    const { channel, tokens, logger } = build({ tokens: tokenList(3), fetch });

    await channel.send(MESSAGE);

    expect(tokens.remove).toHaveBeenCalledWith(['ExponentPushToken[device-1]']);
    // Other errors are logged by reason, never with the token that addresses the phone.
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('ExponentPushToken');
  });

  it('sends no Authorization header when no access token is configured', async () => {
    const { channel, fetchMock } = build({});

    await channel.send(MESSAGE);

    const headers = (fetchMock.mock.calls[0]?.[1] as SafeRequestInit).headers ?? {};
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('authorization');
  });

  it('sends the access token as a bearer token when one is configured', async () => {
    const { channel, fetchMock } = build({ accessToken: 'expo-secret' });

    await channel.send(MESSAGE);

    const headers = (fetchMock.mock.calls[0]?.[1] as SafeRequestInit).headers ?? {};
    expect(headers.authorization).toBe('Bearer expo-secret');
  });

  it('never throws when Expo is unreachable, refuses the request or is blocked', async () => {
    for (const fetch of [
      jest.fn().mockRejectedValue(new Error('connect ETIMEDOUT')),
      jest.fn().mockResolvedValue(jsonResponse({ errors: [{ code: 'INTERNAL' }] }, 500)),
      jest.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 })),
      jest.fn().mockRejectedValue(new BlockedRequestError('exp.host', 'a private address')),
    ]) {
      const { channel, tokens } = build({ fetch });
      await expect(channel.send(MESSAGE)).resolves.toBeUndefined();
      expect(tokens.remove).not.toHaveBeenCalled();
    }
  });

  it('does nothing when the person has no registered phone, or when switched off', async () => {
    const none = build({ tokens: [] });
    await none.channel.send(MESSAGE);
    expect(none.fetchMock).not.toHaveBeenCalled();

    const off = build({ enabled: false });
    expect(off.channel.isConfigured()).toBe(false);
    await off.channel.send(MESSAGE);
    expect(off.tokens.tokensFor).not.toHaveBeenCalled();
    expect(off.fetchMock).not.toHaveBeenCalled();
  });
});
