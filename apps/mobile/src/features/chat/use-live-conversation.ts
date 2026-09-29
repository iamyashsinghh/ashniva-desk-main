import {
  CONVERSATION_EVENTS,
  type ConversationMessageEvent,
  type MessagePage,
} from '@ashniva/types';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useRealtimeEvent, useRealtimeSocket } from '../../shared/realtime/RealtimeProvider';
import { setReadingConversation, stopReadingConversation } from './active-conversation';
import { threadKey } from './chat-api';
import { appendLiveMessage, applyLiveChange } from './live-thread';

/**
 * An open thread's hold on the socket.
 *
 * Returns whether the socket is up, which is what decides whether the thread still needs to poll.
 *
 * **Subscribing is a statement of interest, never a grant** — the same as on the web. The server
 * delivers to per-user rooms it recomputes from live membership at send time, so a phone that
 * stays subscribed after its owner leaves a project receives nothing from the next line on. The
 * subscription is re-sent whenever the socket is replaced, which is every reconnect and every
 * token refresh.
 */
export function useLiveConversation(conversationId: string, focused: boolean): boolean {
  const socket = useRealtimeSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    socket.emit(CONVERSATION_EVENTS.SUBSCRIBE, { conversationId });
    return () => {
      socket.emit(CONVERSATION_EVENTS.UNSUBSCRIBE, { conversationId });
    };
  }, [socket, conversationId]);

  const splice =
    (write: typeof appendLiveMessage) => (event: ConversationMessageEvent | undefined) => {
      if (event?.conversationId !== conversationId || !event.message) {
        return;
      }
      queryClient.setQueryData<InfiniteData<MessagePage>>(threadKey(conversationId), (data) =>
        write(data, event.message),
      );
    };
  useRealtimeEvent(CONVERSATION_EVENTS.MESSAGE_NEW, splice(appendLiveMessage));
  // An edit or a withdrawal shows at once rather than after the refetch the provider starts.
  useRealtimeEvent(CONVERSATION_EVENTS.MESSAGE_EDITED, splice(applyLiveChange));
  useRealtimeEvent(CONVERSATION_EVENTS.MESSAGE_DELETED, splice(applyLiveChange));

  useEffect(() => {
    if (!focused) {
      return undefined;
    }
    setReadingConversation(conversationId);
    return () => stopReadingConversation(conversationId);
  }, [conversationId, focused]);

  return socket !== null;
}
