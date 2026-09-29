import { NOTIFICATION_TYPE } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { apiRequest } from '../../shared/api/client';
import {
  clearPresentedAlerts,
  ensureAndroidChannel,
  installForegroundHandler,
  presentLocalAlert,
  setAppBadge,
  type ForegroundTreatment,
} from '../../shared/notifications/local-alerts';
import {
  parseNotificationEvent,
  pushNotificationId,
  pushType,
  type LiveAlert,
} from '../../shared/notifications/notification-payload';
import { registerForPush } from '../../shared/notifications/push-registration';
import { useRealtimeEvent } from '../../shared/realtime/RealtimeProvider';
import { useSession } from '../auth/SessionProvider';
import { isReadingConversation } from '../chat/active-conversation';
import { recordUnreadCount, useKnownUnreadCount } from './use-cached-unread';

/**
 * Everything notifications need while somebody is signed in. Renders nothing; mount it once,
 * inside the signed-in stack (it needs the query client, the session and the realtime socket).
 *
 * - how an alert is presented while the app is open, and the Android channel it is posted to;
 * - a local echo of each realtime `notification.new`, so alerts work without push credentials;
 * - the device's push token filed against whoever is signed in, again when that person changes.
 *   Permission is asked for right after signing in, the way a phone chat app asks: an app that
 *   only asks from a settings screen is one whose messages nobody hears. The platform shows the
 *   question only while the answer is undetermined, so signing in again never nags;
 * - the unread count on the tab badge and the app icon, kept live from the socket.
 *
 * Unmounting is signing out: the icon badge and the record of shown alerts are cleared so the
 * next person on a shared phone does not inherit them.
 */
export function PushBootstrap(): null {
  const client = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const unread = useKnownUnreadCount();

  useEffect(() => {
    installForegroundHandler(treatWhileOpen);
    void ensureAndroidChannel();
    return () => {
      setAppBadge(0);
      clearPresentedAlerts();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }
    let live = true;
    void registerForPush();
    // One request at sign-in so the badge is right before the inbox has ever been opened.
    apiRequest<{ unreadCount: number }>('/notifications/unread-count')
      .then((answer) => {
        if (live) {
          recordUnreadCount(client, answer.unreadCount);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, userId]);

  useEffect(() => {
    if (unread !== null) {
      setAppBadge(unread);
    }
  }, [unread]);

  // Opening an alert from the lock screen is reading it, the same as opening it from the list;
  // otherwise the badge keeps counting something the person has already seen.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = pushNotificationId(response.notification.request.content.data);
      if (!id) {
        return;
      }
      apiRequest(`/notifications/${id}/read`, { method: 'POST' })
        .then(() => client.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [client]);

  useRealtimeEvent<unknown>('notification.new', (payload) => {
    const alert = parseNotificationEvent(payload);
    if (!alert) {
      return;
    }
    recordUnreadCount(client, alert.unreadCount);
    // The socket only runs in the foreground, but a background transition can race an event.
    // In the background the remote push is the one that should speak.
    if (AppState.currentState === 'active' && !saidInsideTheApp(alert)) {
      void presentLocalAlert(alert);
    }
  });

  return null;
}

const CHAT_MESSAGE_TYPES: readonly string[] = [
  NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
  NOTIFICATION_TYPE.CONVERSATION_MENTION,
];

/**
 * Whether the app already shows this, so a system banner would say it twice: a chat message gets
 * the in-app message card, and anything about the conversation on screen is already in view.
 */
function saidInsideTheApp(alert: LiveAlert): boolean {
  if (alert.entityType !== 'conversation') {
    return false;
  }
  return CHAT_MESSAGE_TYPES.includes(alert.type) || isReadingConversation(alert.entityId);
}

/**
 * A remote push that lands while the app is open, treated the way a phone chat treats it: a
 * message in the conversation on screen makes no sound at all, one in any other conversation
 * rings but leaves the banner to the in-app message card, and everything else shows as usual.
 */
function treatWhileOpen(data: unknown): ForegroundTreatment {
  const fields = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  if (fields['entityType'] !== 'conversation') {
    return 'show';
  }
  const entityId = typeof fields['entityId'] === 'string' ? fields['entityId'] : null;
  if (isReadingConversation(entityId)) {
    return 'hide';
  }
  return CHAT_MESSAGE_TYPES.includes(pushType(data) ?? '') ? 'sound-only' : 'show';
}
