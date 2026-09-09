import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Whether the device has a usable connection.
 *
 * `isConnected` and `isInternetReachable` are different questions: a phone joined to a captive
 * hotel wifi is connected and cannot reach anything. Only the second one predicts whether a
 * request will work, so it wins when it is known.
 *
 * The initial value is optimistic. Starting at "offline" would flash a banner on every cold start
 * before NetInfo has answered, which trains people to ignore it.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isInternetReachable ?? state.isConnected ?? true);
    });
    void NetInfo.fetch().then((state) => {
      setIsOnline(state.isInternetReachable ?? state.isConnected ?? true);
    });
    return unsubscribe;
  }, []);

  return { isOnline };
}
