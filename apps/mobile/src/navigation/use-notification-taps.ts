import { useNavigation, type NavigationProp } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { resolveDeepLink } from './deep-links';
import { followTarget, targetFor } from './notification-router';
import type { RootStackParamList } from './param-lists';
import type { TabName } from './tabs';

/**
 * Tapping a notification opens what it is about.
 *
 * Two ways in, and both are needed. `addNotificationResponseReceivedListener` covers a tap while
 * the app is running or in the background; `getLastNotificationResponseAsync` covers the tap that
 * launched it, where the response was delivered before this hook existed. Without the second one,
 * the notification people actually tap — the one on a locked phone — opens the home screen.
 *
 * The payload comes from a push service, so it goes through `resolveDeepLink` before anything is
 * done with it, exactly as the API treats a webhook body.
 *
 * `tabs` must be a stable array; the caller memoises it. Re-subscribing on every render would
 * follow the cold-start response again each time.
 */
export function useNotificationTaps(tabs: readonly TabName[]): void {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  useEffect(() => {
    let live = true;

    const open = (data: unknown) => {
      if (live) {
        followTarget(navigation, targetFor(resolveDeepLink(data), tabs));
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification.request.content.data);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        open(response.notification.request.content.data);
      }
    });

    return () => {
      live = false;
      subscription.remove();
    };
  }, [navigation, tabs]);
}
