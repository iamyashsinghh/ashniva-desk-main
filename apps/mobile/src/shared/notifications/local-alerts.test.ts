import * as Notifications from 'expo-notifications';

import {
  clearPresentedAlerts,
  installForegroundHandler,
  presentLocalAlert,
  setAppBadge,
  shouldPresent,
} from './local-alerts';
import type { LiveAlert } from './notification-payload';
import { createRecentIds } from './recent-ids';

/**
 * Local alerts: the echo of a realtime event that makes notifications work without push
 * credentials, and the rule that keeps it from doubling up with the remote push for the same one.
 */

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setBadgeCountAsync: jest.fn(async () => true),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { HIGH: 6 },
}));

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const setHandler = Notifications.setNotificationHandler as jest.Mock;
const setBadge = Notifications.setBadgeCountAsync as jest.Mock;

const ID = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';
const FIRST = `${ID}#1`;

function alert(over: Partial<LiveAlert> = {}): LiveAlert {
  return {
    notificationId: ID,
    groupedCount: 1,
    type: 'TASK_ASSIGNED',
    title: 'A task is yours',
    body: 'Fix the login page',
    link: `/tasks/${ID}`,
    entityType: 'task',
    entityId: ID,
    unreadCount: 3,
    ...over,
  };
}

/** What the OS hands the foreground handler. */
function incoming(identifier: string, data: unknown) {
  return { date: 0, request: { identifier, content: { data }, trigger: null } };
}

function foregroundHandler() {
  installForegroundHandler();
  return setHandler.mock.calls[0]?.[0] as {
    handleNotification: (n: unknown) => Promise<{ shouldShowBanner: boolean }>;
  };
}

beforeEach(() => {
  schedule.mockClear();
  setBadge.mockClear();
  clearPresentedAlerts();
});

describe('shouldPresent', () => {
  it('always shows our own local echo', () => {
    const seen = createRecentIds();
    seen.add(FIRST);
    expect(shouldPresent(`local-${FIRST}`, { notificationId: ID }, seen)).toBe(true);
  });

  it('silences a remote push for an alert that was already shown', () => {
    const seen = createRecentIds();
    seen.add(FIRST);
    expect(shouldPresent('remote-1', { notificationId: ID, groupedCount: 1 }, seen)).toBe(false);
  });

  it('reads a push from an older API, with no count, as the first event', () => {
    const seen = createRecentIds();
    seen.add(FIRST);
    expect(shouldPresent('remote-1', { notificationId: ID }, seen)).toBe(false);
  });

  it('shows the next event merged into a grouped notification', () => {
    const seen = createRecentIds();
    seen.add(FIRST);
    expect(shouldPresent('remote-2', { notificationId: ID, groupedCount: 2 }, seen)).toBe(true);
  });

  it('shows a remote push that came first, and records it so the echo stays silent', () => {
    const seen = createRecentIds();
    expect(shouldPresent('remote-1', { notificationId: ID, groupedCount: 1 }, seen)).toBe(true);
    expect(seen.has(FIRST)).toBe(true);
  });

  it('shows a push with no usable id, since there is nothing to match it against', () => {
    expect(shouldPresent('remote-1', { notificationId: 'nope' }, createRecentIds())).toBe(true);
  });
});

describe('presentLocalAlert', () => {
  it('schedules an immediate notification carrying the push payload shape', async () => {
    await presentLocalAlert(alert());

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toEqual({
      identifier: `local-${FIRST}`,
      content: {
        title: 'A task is yours',
        body: 'Fix the login page',
        data: {
          notificationId: ID,
          groupedCount: 1,
          type: 'TASK_ASSIGNED',
          link: `/tasks/${ID}`,
          entityType: 'task',
          entityId: ID,
        },
        sound: 'default',
        badge: 3,
      },
      trigger: null,
    });
  });

  it('does not show the same notification twice', async () => {
    await presentLocalAlert(alert());
    await presentLocalAlert(alert());
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('rings again for a second reply merged into the same notification', async () => {
    await presentLocalAlert(alert());
    await presentLocalAlert(alert({ groupedCount: 2, title: 'Two replies on your ticket' }));
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('stays silent when the remote push for it was already shown', async () => {
    const handler = foregroundHandler();

    const remote = await handler.handleNotification(
      incoming('remote-1', { notificationId: ID, groupedCount: 1 }),
    );
    await presentLocalAlert(alert());

    expect(remote.shouldShowBanner).toBe(true);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('never throws when the platform refuses', async () => {
    schedule.mockRejectedValueOnce(new Error('no permission'));
    await expect(presentLocalAlert(alert())).resolves.toBeUndefined();
  });
});

describe('setAppBadge', () => {
  it('sets a whole, non-negative number', () => {
    setAppBadge(-2);
    setAppBadge(4.7);
    expect(setBadge.mock.calls).toEqual([[0], [4]]);
  });

  it('ignores a launcher that does not support badges', () => {
    setBadge.mockRejectedValueOnce(new Error('unsupported'));
    expect(() => setAppBadge(1)).not.toThrow();
  });
});
