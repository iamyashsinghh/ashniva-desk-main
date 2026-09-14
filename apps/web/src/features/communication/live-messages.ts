import {
  NOTIFICATION_TYPE,
  maskMentions,
  type ConversationDetail,
  type NotificationEvent,
  type NotificationSummary,
} from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { useRealtimeSocket } from '../../app/providers/realtime-socket-context';
import { apiRequest } from '../../shared/lib/api-client';
import { conversationKeys } from './api';
import { contextLabelOf } from './conversation-filters';
import { playMessageSound } from './message-sound';
import { useMessenger } from './messenger-context';

/** How long a card stays up. Long enough to read a line, short enough not to sit in the way. */
const DISMISS_AFTER_MS = 8000;
/** How many cards the corner holds. Beyond this the oldest goes; the bell keeps all of them. */
const MAX_TOASTS = 3;
/**
 * How long the authorization check may be reused.
 *
 * A burst of five lines in one conversation should not be five round trips, and five seconds is
 * far shorter than the window in which somebody's access changes. It is a de-duplication window,
 * not a cache of the decision: every conversation is re-asked about the moment it goes stale.
 */
const RECHECK_STALE_MS = 5000;

export interface LiveMessageToast {
  /** The notification's own id, so the same delivery cannot stack twice. */
  key: string;
  conversationId: string;
  /** Who or what this is from — the sender for a direct message, the group otherwise. */
  from: string;
  /** The group's picture, when it has one. */
  imageFileId: string | null;
  preview: string;
  /** The project, task or ticket this hangs off, when it hangs off one. */
  context: string | null;
  /** Where clicking goes: the task, the ticket, the project, or the thread. */
  link: string;
  at: string;
  isMention: boolean;
  /** When the card went up, so a second arrival does not extend the first one's stay. */
  shownAt: number;
}

const MESSAGE_TYPES: readonly string[] = [
  NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
  NOTIFICATION_TYPE.CONVERSATION_MENTION,
];

/**
 * The bottom-right stack of incoming messages.
 *
 * **It is fed by `notification.new` on the existing gateway** — the same event the bell listens to
 * — rather than by a second transport. A conversation-level event would arrive for every thread
 * the tab is subscribed to; a notification arrives only where the dispatcher decided this person
 * should hear about it, which is where the recipient's own preferences and quiet hours have
 * already been applied.
 *
 * **Nothing is previewed until the server has been asked again.** A socket delivers what was true
 * when it was sent, and somebody can be taken off a project between the send and the delivery — a
 * tab left open across a role change is the ordinary case, not an exotic one. So the conversation
 * is re-read before a card is drawn, the card's text comes from *that* response rather than from
 * the notification, and a refusal means no card at all. Hiding it would not be the control; the
 * control is that the server is asked, and it is asked here.
 *
 * **Appearing changes nothing.** No read cursor is moved and no notification is marked read: a
 * card in the corner is not somebody having read the message, and an unread badge that clears
 * because a toast went past is the bug this note exists to prevent.
 */
export function useLiveMessageToasts(): {
  toasts: readonly LiveMessageToast[];
  dismiss: (key: string) => void;
} {
  const socket = useRealtimeSocket();
  const queryClient = useQueryClient();
  const location = useLocation();
  const messenger = useMessenger();
  const [toasts, setToasts] = useState<readonly LiveMessageToast[]>([]);
  const readingId =
    messenger && !messenger.minimized ? messenger.conversationId : null;

  const dismiss = useCallback((key: string) => {
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    let live = true;

    async function onNotification(event: NotificationEvent) {
      const notification = event.notification;
      if (!isMessageNotification(notification) || !notification.entityId) {
        return;
      }
      // The thread they are looking at, in a window they are looking at. Announcing it in the
      // corner as well would be telling somebody what is already on their screen.
      if (document.hasFocus() && notification.link && location.pathname === notification.link) {
        return;
      }
      if (notification.entityId && readingId === notification.entityId) {
        return;
      }
      const conversation = await readIfStillPermitted(queryClient, notification.entityId);
      if (!conversation || !live) {
        return;
      }
      playMessageSound();
      const toast = toastFor(notification, conversation);
      setToasts((current) =>
        current.some((existing) => existing.key === toast.key)
          ? current
          : [...current, toast].slice(-MAX_TOASTS),
      );
    }

    const handler = (event: NotificationEvent) => void onNotification(event);
    socket.on('notification.new', handler);
    return () => {
      live = false;
      socket.off('notification.new', handler);
    };
  }, [socket, queryClient, location.pathname, readingId]);

  // The oldest card's remaining time, recomputed whenever the stack changes. Counting from
  // `shownAt` rather than restarting the timer is what stops a second arrival from extending the
  // first card's stay indefinitely.
  useEffect(() => {
    const oldest = toasts[0];
    if (!oldest) {
      return undefined;
    }
    const remaining = Math.max(0, DISMISS_AFTER_MS - (Date.now() - oldest.shownAt));
    const timer = setTimeout(() => dismiss(oldest.key), remaining);
    return () => clearTimeout(timer);
  }, [toasts, dismiss]);

  return { toasts, dismiss };
}

function isMessageNotification(notification: NotificationSummary): boolean {
  return MESSAGE_TYPES.includes(notification.type) && notification.entityType === 'conversation';
}

/**
 * The conversation as the server will describe it *now*, or nothing.
 *
 * `fetchQuery` rather than a bare request so the answer is shared with the open thread's own
 * query and a burst of messages costs one round trip rather than one each.
 */
async function readIfStillPermitted(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
): Promise<ConversationDetail | null> {
  try {
    return await queryClient.fetchQuery({
      queryKey: conversationKeys.detail(conversationId),
      queryFn: () => apiRequest<ConversationDetail>(`/conversations/${conversationId}`),
      staleTime: RECHECK_STALE_MS,
    });
  } catch {
    // Refused, gone, or unreachable. All three mean the same thing here: do not show a preview.
    return null;
  }
}

/**
 * The card, built from the conversation the server just confirmed.
 *
 * The preview is `lastMessagePreview` from that response rather than the notification's body,
 * which is the point of asking: the body was composed when the notification was written, and the
 * question a moment later is what this person may read *now*. The sender's name is taken from the
 * notification title, which named them, only because the summary has no last-sender field.
 */
function toastFor(
  notification: NotificationSummary,
  conversation: ConversationDetail,
): LiveMessageToast {
  return {
    key: notification.id,
    conversationId: conversation.id,
    from: conversation.counterpart?.name ?? conversation.title,
    imageFileId: conversation.imageFileId,
    preview: maskMentions(conversation.lastMessagePreview ?? notification.title),
    context: contextLabelOf(conversation),
    link: notification.link ?? `/messages/${conversation.id}`,
    at: notification.createdAt,
    isMention: notification.type === NOTIFICATION_TYPE.CONVERSATION_MENTION,
    shownAt: Date.now(),
  };
}
