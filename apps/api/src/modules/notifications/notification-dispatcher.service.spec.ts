import { NOTIFICATION_TYPE } from '@ashniva/types';

import { NotificationDispatcher } from './notification-dispatcher.service';
import type { NotificationChannel } from './channels/notification-channel.interface';
import type { NotificationRow, NotificationsRepository } from './notifications.repository';

/**
 * Which channels a notification goes out on, one channel at a time.
 *
 * The dispatcher used to end a person's dispatch the moment the in-app channel was off, before
 * the external adapters were consulted, so "email but not in the app" delivered nothing at all.
 * These tests hold the two halves apart — and the second one holds the line that matters more:
 * with the settings the product actually ships, decoupling the channels sends nothing that was
 * not being sent before. Email and WhatsApp stay off until somebody decides otherwise.
 */

const ORG = 'org-1';
const USER = 'user-1';

interface PreferenceRow {
  userId: string;
  organizationId: string;
  type: string;
  channel: string;
  enabled: boolean;
}

function defaultSettings(userId: string, organizationId: string) {
  return {
    userId,
    organizationId,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    timezone: 'UTC',
    updatedAt: new Date(),
  };
}

function repositoryDouble(preferences: PreferenceRow[]) {
  const created: NotificationRow[] = [];
  const cleared: string[] = [];
  const delivered: string[] = [];
  const calls = { preferencesForUsers: 0, settingsForUsers: 0, preferences: 0, settings: 0 };
  const repository = {
    preferencesForUsers: jest.fn(async (userIds: string[], organizationId: string) => {
      calls.preferencesForUsers += 1;
      return preferences.filter(
        (row) => userIds.includes(row.userId) && row.organizationId === organizationId,
      );
    }),
    settingsForUsers: jest.fn(async () => {
      calls.settingsForUsers += 1;
      return [];
    }),
    preferences: jest.fn(async (userId: string, organizationId: string) => {
      calls.preferences += 1;
      return preferences.filter(
        (row) => row.userId === userId && row.organizationId === organizationId,
      );
    }),
    settings: jest.fn(async (userId: string, organizationId: string) => {
      calls.settings += 1;
      return defaultSettings(userId, organizationId);
    }),
    defaultSettings,
    findByDedupeKey: jest.fn(async () => null),
    findGroupable: jest.fn(async () => null),
    countSince: jest.fn(async () => 0),
    create: jest.fn(async (data: Record<string, unknown>) => {
      const row = {
        id: `notification-${created.length + 1}`,
        groupedCount: 1,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as unknown as NotificationRow;
      created.push(row);
      return row;
    }),
    markDelivered: jest.fn(async (ids: string[]) => {
      delivered.push(...ids);
      return ids.length;
    }),
    clearDeferral: jest.fn(async (id: string) => {
      cleared.push(id);
      return 1;
    }),
    unreadCount: jest.fn(async () => 1),
  };
  return { repository, created, cleared, delivered, calls };
}

function channelDouble(key: 'EMAIL' | 'WHATSAPP'): NotificationChannel & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    key,
    sent,
    isConfigured: () => true,
    send: async (message) => {
      sent.push(message);
    },
  };
}

function dispatcherWith(
  preferences: PreferenceRow[],
  channels: NotificationChannel[] = [channelDouble('EMAIL')],
) {
  const double = repositoryDouble(preferences);
  const emitted: string[] = [];
  const realtime = {
    emitNotification: (userId: string) => {
      emitted.push(userId);
    },
  };
  const tenantContext = { runAsSystem: <T>(run: () => Promise<T>) => run() };
  const logger = { setContext: () => undefined, error: () => undefined, warn: () => undefined };
  const dispatcher = new NotificationDispatcher(
    double.repository as unknown as NotificationsRepository,
    // The realtime service, the tenant context and the logger are used through three methods
    // between them; the casts say "only these" rather than building three whole doubles.
    realtime as never,
    tenantContext as never,
    logger as never,
    channels,
  );
  return { dispatcher, emitted, ...double, channels };
}

function preference(type: string, channel: string, enabled: boolean): PreferenceRow {
  return { userId: USER, organizationId: ORG, type, channel, enabled };
}

const NOTIFY = {
  type: NOTIFICATION_TYPE.TICKET_REPLY,
  title: 'A reply on your ticket',
  recipients: [{ userId: USER, organizationId: ORG }],
};

describe('NotificationDispatcher channels', () => {
  it('sends the email and writes no visible in-app row when only email is on', async () => {
    const email = channelDouble('EMAIL');
    const { dispatcher, created, emitted } = dispatcherWith(
      [preference('TICKET_REPLY', 'IN_APP', false), preference('TICKET_REPLY', 'EMAIL', true)],
      [email],
    );

    const result = await dispatcher.notify(NOTIFY);

    expect(result).toEqual({ created: 1, grouped: 0, skipped: 0, deferred: 0 });
    expect(email.sent).toHaveLength(1);
    // The row exists as the ledger de-duplication and grouping count from, but it was never
    // delivered, so the inbox and the badge (both of which require `deliveredAt`) never see it.
    expect(created).toHaveLength(1);
    expect(created[0]?.deliveredAt).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('sends nothing outside the app on the settings the product ships', async () => {
    // No stored preferences: `defaultChannelEnabled` answers IN_APP only. The email adapter is
    // configured and would send if it were asked — it is not asked.
    const email = channelDouble('EMAIL');
    const whatsapp = channelDouble('WHATSAPP');
    const { dispatcher, created, emitted } = dispatcherWith([], [email, whatsapp]);

    const result = await dispatcher.notify(NOTIFY);

    expect(result.created).toBe(1);
    expect(email.sent).toEqual([]);
    expect(whatsapp.sent).toEqual([]);
    expect(created[0]?.deliveredAt).not.toBeNull();
    expect(emitted).toEqual([USER]);
  });

  it('skips the person entirely when no channel at all is on', async () => {
    const email = channelDouble('EMAIL');
    const { dispatcher, created, emitted } = dispatcherWith(
      [preference('TICKET_REPLY', 'IN_APP', false)],
      [email],
    );

    const result = await dispatcher.notify(NOTIFY);

    expect(result.skipped).toBe(1);
    expect(created).toEqual([]);
    expect(email.sent).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('still delivers an urgent type in the app when in-app is switched off', async () => {
    const { dispatcher, created, emitted } = dispatcherWith([
      preference('SLA_BREACH', 'IN_APP', false),
    ]);

    const result = await dispatcher.notify({
      ...NOTIFY,
      type: NOTIFICATION_TYPE.SLA_BREACH,
    });

    expect(result.created).toBe(1);
    expect(created[0]?.deliveredAt).not.toBeNull();
    expect(emitted).toEqual([USER]);
  });

  it('reads the whole recipient set’s preferences and settings in one query each', async () => {
    const { dispatcher, calls } = dispatcherWith([]);

    await dispatcher.notify({
      ...NOTIFY,
      recipients: [
        { userId: 'user-1', organizationId: ORG },
        { userId: 'user-2', organizationId: ORG },
        { userId: 'user-3', organizationId: ORG },
      ],
    });

    expect(calls.preferencesForUsers).toBe(1);
    expect(calls.settingsForUsers).toBe(1);
    expect(calls.preferences).toBe(0);
    expect(calls.settings).toBe(0);
  });
});

describe('NotificationDispatcher.deliverDeferred', () => {
  const deferredRow = {
    id: 'notification-1',
    organizationId: ORG,
    userId: USER,
    type: 'TICKET_REPLY',
    title: 'A reply on your ticket',
    body: null,
    link: null,
    deliveredAt: null,
    deliverAfter: new Date(),
    groupedCount: 1,
    readAt: null,
    createdAt: new Date(),
  } as unknown as NotificationRow;

  it('delivers a held row when in-app is on', async () => {
    const { dispatcher, delivered, emitted } = dispatcherWith([]);

    await dispatcher.deliverDeferred(deferredRow);

    expect(delivered).toEqual(['notification-1']);
    expect(emitted).toEqual([USER]);
  });

  it('drops the due time instead of delivering when in-app has since been switched off', async () => {
    const email = channelDouble('EMAIL');
    const { dispatcher, delivered, cleared, emitted } = dispatcherWith(
      [preference('TICKET_REPLY', 'IN_APP', false), preference('TICKET_REPLY', 'EMAIL', true)],
      [email],
    );

    await dispatcher.deliverDeferred(deferredRow);

    expect(delivered).toEqual([]);
    expect(emitted).toEqual([]);
    expect(cleared).toEqual(['notification-1']);
    expect(email.sent).toHaveLength(1);
  });
});
