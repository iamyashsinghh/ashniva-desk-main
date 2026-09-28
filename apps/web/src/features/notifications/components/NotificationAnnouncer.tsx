import {
  NOTIFICATION_TYPE,
  type NotificationEvent,
  type NotificationSummary,
} from '@ashniva/types';
import { Toast, ToastStack } from '@ashniva/ui';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useRealtimeSocket } from '../../../app/providers/realtime-socket-context';
import { formatTime } from '../../../shared/lib/format';
import {
  announceNotification,
  isViewingNotificationTarget,
} from '../notify-attention';

import '../../communication/communication.css';

const DISMISS_AFTER_MS = 10_000;
const MAX_TOASTS = 4;

const CHAT_TYPES: readonly string[] = [
  NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
  NOTIFICATION_TYPE.CONVERSATION_MENTION,
];

type AppToast = {
  key: string;
  title: string;
  body: string | null;
  link: string | null;
  at: string;
  shownAt: number;
  isMention: boolean;
};

/**
 * Every notification that is not a chat bubble: sound + OS banner (other tabs / apps) and a
 * top-right card when this window is open on a different screen.
 *
 * Chat keeps the bottom-right LiveMessageToasts stack; this covers tasks, tickets, SLA, mentions
 * on comments, and the rest of the inbox so the behaviour is the same wherever the alert came from.
 */
export function NotificationAnnouncer() {
  const socket = useRealtimeSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<readonly AppToast[]>([]);

  const dismiss = useCallback((key: string) => {
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    function onNotification(event: NotificationEvent) {
      const notification = event.notification;
      announceNotification({
        title: notification.title,
        body: notification.body,
        link: notification.link,
        tag: `ashniva:${notification.id}`,
      });

      // Chat has its own corner stack with avatars and thread open.
      if (isChatNotification(notification)) {
        return;
      }
      if (isViewingNotificationTarget(notification.link)) {
        return;
      }

      const toast: AppToast = {
        key: notification.id,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        at: notification.createdAt,
        shownAt: Date.now(),
        isMention: notification.type === NOTIFICATION_TYPE.TASK_COMMENT_MENTION,
      };
      setToasts((current) =>
        current.some((existing) => existing.key === toast.key)
          ? current
          : [...current, toast].slice(-MAX_TOASTS),
      );
    }
    socket.on('notification.new', onNotification);
    return () => {
      socket.off('notification.new', onNotification);
    };
  }, [socket, location.pathname]);

  useEffect(() => {
    const oldest = toasts[0];
    if (!oldest) {
      return undefined;
    }
    const remaining = Math.max(0, DISMISS_AFTER_MS - (Date.now() - oldest.shownAt));
    const timer = setTimeout(() => dismiss(oldest.key), remaining);
    return () => clearTimeout(timer);
  }, [toasts, dismiss]);

  // Service worker click → navigate inside this tab.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; link?: string } | null;
      if (data?.type !== 'ashniva-notification-click' || !data.link) {
        return;
      }
      void navigate(data.link);
    }
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [navigate]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <ToastStack position="top-end" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast
          key={toast.key}
          dismissLabel={`Dismiss: ${toast.title}`}
          onDismiss={() => dismiss(toast.key)}
          onOpen={
            toast.link
              ? () => {
                  dismiss(toast.key);
                  void navigate(toast.link!);
                }
              : undefined
          }
        >
          <span className="chat-toast__head">
            <strong className="chat-toast__from">{toast.title}</strong>
            <span className="chat-toast__unread" aria-label="Unread" />
            <span className="timeline__note">{formatTime(toast.at)}</span>
          </span>
          {toast.isMention ? (
            <span className="chat-toast__context">
              <span className="chat-toast__mention">Mentioned you</span>
            </span>
          ) : null}
          {toast.body ? <span className="chat-toast__preview">{toast.body}</span> : null}
        </Toast>
      ))}
    </ToastStack>
  );
}

function isChatNotification(notification: NotificationSummary): boolean {
  return CHAT_TYPES.includes(notification.type) && notification.entityType === 'conversation';
}
