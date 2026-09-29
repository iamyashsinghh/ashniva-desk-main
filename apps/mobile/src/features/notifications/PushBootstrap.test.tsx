import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { apiRequest } from '../../shared/api/client';
import { clearPresentedAlerts } from '../../shared/notifications/local-alerts';
import { registerForPush } from '../../shared/notifications/push-registration';
import { testQueryClient } from '../../shared/testing/harness';
import { setReadingConversation } from '../chat/active-conversation';
import { PushBootstrap } from './PushBootstrap';
import { UNREAD_COUNT_KEY } from './use-cached-unread';

/**
 * The component that keeps notifications working while somebody is signed in: it asks for
 * permission and files the push token, keeps the badge live from the socket, echoes each realtime
 * alert as a local notification so alerts work without push credentials, and decides how a remote
 * push that lands while the app is open is presented.
 */

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setBadgeCountAsync: jest.fn(async () => true),
  setNotificationChannelAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 6 },
}));

const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('../../shared/realtime/RealtimeProvider', () => ({
  useRealtimeEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
jest.mock('../auth/SessionProvider', () => ({ useSession: () => ({ user: mockUser }) }));

jest.mock('../../shared/notifications/push-registration', () => ({
  registerForPush: jest.fn(async () => ({
    permission: 'granted',
    token: null,
    registered: false,
  })),
}));

jest.mock('../../shared/api/client', () => ({
  apiRequest: jest.fn(async () => ({ unreadCount: 5 })),
}));

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const setBadge = Notifications.setBadgeCountAsync as jest.Mock;
const setHandler = Notifications.setNotificationHandler as jest.Mock;
const register = registerForPush as jest.Mock;
const request = apiRequest as jest.Mock;

const ID = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';

function event(unreadCount: number) {
  return {
    notification: {
      id: ID,
      type: 'TASK_ASSIGNED',
      title: 'A task is yours',
      body: null,
      link: `/tasks/${ID}`,
      entityType: 'task',
      entityId: ID,
      groupedCount: 1,
      readAt: null,
      createdAt: '2026-09-28T09:00:00.000Z',
    },
    unreadCount,
  };
}

async function mount() {
  const client = testQueryClient();
  const view = await render(
    <QueryClientProvider client={client}>
      <PushBootstrap />
    </QueryClientProvider>,
  );
  // Lets the sign-in count request settle inside act, so its cache write is not a stray update.
  await act(async () => undefined);
  return { client, view };
}

beforeEach(() => {
  // The local echo is for a foregrounded app; React Native's test double does not start active.
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  mockHandlers.clear();
  clearPresentedAlerts();
  schedule.mockClear();
  setBadge.mockClear();
  register.mockClear();
  request.mockClear();
});

it('installs the foreground handler and asks for push once somebody is signed in', async () => {
  await mount();
  expect(setHandler).toHaveBeenCalled();
  expect(register).toHaveBeenCalledTimes(1);
});

describe('a remote push while the app is open', () => {
  const CHAT = '22222222-2222-4222-8222-222222222222';
  type Presentation = { shouldShowBanner: boolean; shouldPlaySound: boolean };
  let pushCount = 0;

  async function present(data: Record<string, unknown>): Promise<Presentation> {
    await mount();
    const handler = setHandler.mock.calls[0]?.[0] as {
      handleNotification: (n: unknown) => Promise<Presentation>;
    };
    pushCount += 1;
    const notificationId = `0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f${String(pushCount).padStart(2, '0')}`;
    return handler.handleNotification({
      request: {
        identifier: `remote-${pushCount}`,
        content: { data: { notificationId, ...data } },
      },
    });
  }

  afterEach(() => setReadingConversation(null));

  it('rings for a message in another chat but leaves the banner to the in-app card', async () => {
    const shown = await present({
      type: 'CONVERSATION_MESSAGE',
      entityType: 'conversation',
      entityId: CHAT,
    });
    expect(shown).toMatchObject({ shouldShowBanner: false, shouldPlaySound: true });
  });

  it('says nothing about the chat already on screen', async () => {
    setReadingConversation(CHAT);
    const shown = await present({
      type: 'CONVERSATION_MENTION',
      entityType: 'conversation',
      entityId: CHAT,
    });
    expect(shown).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
  });

  it('shows anything that is not a chat message as a normal banner', async () => {
    const shown = await present({ type: 'TASK_ASSIGNED', entityType: 'task', entityId: ID });
    expect(shown).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  });
});

it('puts the unread count on the tab badge and the app icon at sign-in', async () => {
  const { client } = await mount();

  expect(request).toHaveBeenCalledWith('/notifications/unread-count');
  await waitFor(() => expect(client.getQueryData(UNREAD_COUNT_KEY)).toBe(5));
  await waitFor(() => expect(setBadge).toHaveBeenLastCalledWith(5));
});

it('echoes a realtime alert as a local notification and updates the badge from it', async () => {
  const { client } = await mount();
  await waitFor(() => expect(client.getQueryData(UNREAD_COUNT_KEY)).toBe(5));

  await act(() => mockHandlers.get('notification.new')?.(event(6)));

  await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
  expect(client.getQueryData(UNREAD_COUNT_KEY)).toBe(6);
  await waitFor(() => expect(setBadge).toHaveBeenLastCalledWith(6));
});

it('ignores a malformed event rather than showing a blank banner', async () => {
  await mount();
  mockHandlers.get('notification.new')?.({ notification: { id: 'x' }, unreadCount: 'lots' });
  expect(schedule).not.toHaveBeenCalled();
});

it('clears the app icon badge when the person signs out', async () => {
  const { view } = await mount();
  setBadge.mockClear();

  await view.unmount();

  expect(setBadge).toHaveBeenCalledWith(0);
});
