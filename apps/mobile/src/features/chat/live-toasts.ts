import {
  NOTIFICATION_TYPE,
  maskMentions,
  type ConversationDetail,
  type NotificationEvent,
  type NotificationSummary,
} from '@ashniva/types';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../../shared/api/client';
import { useRealtimeEvent } from '../../shared/realtime/RealtimeProvider';
import { isReadingConversation } from './active-conversation';
import { contextLabelOf } from './conversation-filters';

/** How long a card stays up. Long enough to read a line, short enough not to sit in the way. */
export const TOAST_DISMISS_MS = 8000;
/** How many cards show at once. Beyond this the oldest goes; the notifications tab keeps all. */
export const MAX_TOASTS = 3;
/**
 * How long the authorization re-check may be reused: a de-duplication window for a burst of lines
 * in one conversation, far shorter than the time in which somebody's access changes.
 */
const RECHECK_STALE_MS = 5000;

export interface LiveMessageToast {
  /** The notification's own id, so the same delivery cannot stack twice. */
  key: string;
  conversationId: string;
  /** The sender for a direct message, the group or channel otherwise. */
  from: string;
  preview: string;
  /** The project, task or ticket this hangs off, when it hangs off one. */
  context: string | null;
  at: string;
  isMention: boolean;
  /** When the card went up, so a second arrival does not extend the first one's stay. */
  shownAt: number;
}

const MESSAGE_TYPES: readonly string[] = [
  NOTIFICATION_TYPE.CONVERSATION_MESSAGE,
  NOTIFICATION_TYPE.CONVERSATION_MENTION,
];

export function isMessageNotification(notification: NotificationSummary): boolean {
  return (
    MESSAGE_TYPES.includes(notification.type) &&
    notification.entityType === 'conversation' &&
    Boolean(notification.entityId)
  );
}

/**
 * The card, built from the conversation the server just confirmed rather than from the
 * notification: the notification says what was true when it was written, the re-read says what
 * this person may read now. The sender comes from the conversation's counterpart, as on the web.
 */
export function toastFor(
  notification: NotificationSummary,
  conversation: ConversationDetail,
  now: number = Date.now(),
): LiveMessageToast {
  return {
    key: notification.id,
    conversationId: conversation.id,
    from: conversation.counterpart?.name ?? conversation.title,
    preview: maskMentions(conversation.lastMessagePreview ?? notification.title),
    context: contextLabelOf(conversation),
    at: notification.createdAt,
    isMention: notification.type === NOTIFICATION_TYPE.CONVERSATION_MENTION,
    shownAt: now,
  };
}

/**
 * Arriving messages, as cards — the web's corner stack on a phone.
 *
 * Fed by `notification.new`, the event the notifications tab already listens to, so a card only
 * appears where the dispatcher decided this person should hear about it: their preferences and
 * quiet hours are already applied. Nothing is shown until the conversation has been re-read from
 * the server, and a refusal means no card. Nothing is marked read either: a card going past is not
 * somebody having read the message.
 */
export function useLiveMessageToasts(): {
  toasts: readonly LiveMessageToast[];
  dismiss: (key: string) => void;
} {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<readonly LiveMessageToast[]>([]);

  const dismiss = useCallback((key: string) => {
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);

  useRealtimeEvent<NotificationEvent>('notification.new', (event) => {
    const notification = event.notification;
    const conversationId = notification.entityId;
    if (!isMessageNotification(notification) || !conversationId) {
      return;
    }
    // Announcing the thread somebody is already reading is telling them what is on their screen.
    if (isReadingConversation(conversationId)) {
      return;
    }
    void readIfStillPermitted(queryClient, conversationId).then((conversation) => {
      if (!conversation || isReadingConversation(conversationId)) {
        return;
      }
      const toast = toastFor(notification, conversation);
      setToasts((current) =>
        current.some((existing) => existing.key === toast.key)
          ? current
          : [...current, toast].slice(-MAX_TOASTS),
      );
    });
  });

  // Counted from the oldest card's `shownAt` rather than restarted, so a stream of arrivals cannot
  // keep the first card up for ever.
  useEffect(() => {
    const oldest = toasts[0];
    if (!oldest) {
      return undefined;
    }
    const remaining = Math.max(0, TOAST_DISMISS_MS - (Date.now() - oldest.shownAt));
    const timer = setTimeout(() => dismiss(oldest.key), remaining);
    return () => clearTimeout(timer);
  }, [toasts, dismiss]);

  return { toasts, dismiss };
}

/** The conversation as the server describes it now, or nothing — refused, gone or unreachable. */
async function readIfStillPermitted(
  queryClient: QueryClient,
  conversationId: string,
): Promise<ConversationDetail | null> {
  try {
    return await queryClient.fetchQuery({
      // The open thread's own key, so a burst of lines shares one round trip with it.
      queryKey: ['conversations', conversationId],
      queryFn: () => apiRequest<ConversationDetail>(`/conversations/${conversationId}`),
      staleTime: RECHECK_STALE_MS,
    });
  } catch {
    return null;
  }
}
