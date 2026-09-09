import { render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { useNotificationTaps } from './use-notification-taps';

/**
 * The listener that was missing.
 *
 * `resolveDeepLink` and `notification-router` were both written, hardened and tested while nothing
 * in the app subscribed to a notification response at all — so every push tap opened the home
 * screen. This asserts the subscription exists and that a delivered response reaches navigation.
 */

// `mock`-prefixed so jest allows the factory below to close over it: everything else is hoisted
// above the declaration and would be undefined when the module is mocked.
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const listen = Notifications.addNotificationResponseReceivedListener as jest.Mock;
const lastResponse = Notifications.getLastNotificationResponseAsync as jest.Mock;

const VALID_ID = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';
const TABS = ['Home', 'Tasks', 'Tickets', 'Notifications', 'Profile'] as const;

/** What the OS hands the app when somebody taps a notification. */
function response(data: unknown) {
  return { notification: { request: { content: { data } } } };
}

function Subscriber() {
  useNotificationTaps(TABS);
  return null;
}

beforeEach(() => {
  mockNavigate.mockReset();
  listen.mockReset().mockReturnValue({ remove: jest.fn() });
  lastResponse.mockReset().mockResolvedValue(null);
});

describe('a tap while the app is running', () => {
  it('subscribes at all', async () => {
    await render(<Subscriber />);
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it('opens what the notification was about', async () => {
    await render(<Subscriber />);

    const handler = listen.mock.calls[0]?.[0] as (event: unknown) => void;
    handler(response({ screen: 'TaskDetail', id: VALID_ID }));

    expect(mockNavigate).toHaveBeenCalledWith('TaskDetail', { id: VALID_ID });
  });

  it('does not pass an unchecked payload through to a route', async () => {
    await render(<Subscriber />);

    const handler = listen.mock.calls[0]?.[0] as (event: unknown) => void;
    handler(response({ screen: 'TaskDetail', id: "1' OR '1'='1" }));

    // Not the task, and not a route parameter nobody validated: the notifications list, which is
    // always a reasonable place to be.
    expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'Notifications' });
  });

  it('stops listening when the screen goes away', async () => {
    const remove = jest.fn();
    listen.mockReturnValue({ remove });

    const view = await render(<Subscriber />);
    await view.unmount();

    expect(remove).toHaveBeenCalled();
  });
});

describe('the tap that launched the app', () => {
  it('is followed too', async () => {
    // The one people actually take, on a locked phone. The response was delivered before this hook
    // existed, so without `getLastNotificationResponseAsync` it opens the home screen instead.
    lastResponse.mockResolvedValue(response({ screen: 'TicketDetail', id: VALID_ID }));

    await render(<Subscriber />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('TicketDetail', { id: VALID_ID });
    });
  });

  it('does nothing when the app was opened normally', async () => {
    await render(<Subscriber />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
