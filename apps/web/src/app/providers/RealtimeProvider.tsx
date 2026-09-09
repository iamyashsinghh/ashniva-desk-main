import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

import { useSession } from '../../features/auth/session-context';
import { RealtimeSocketContext } from './realtime-socket-context';

/** Query-key prefixes refreshed by each realtime event. */
const INVALIDATIONS: Record<string, string[][]> = {
  'task.updated': [['tasks'], ['dashboard'], ['projects'], ['reports'], ['client-updates']],
  'ticket.updated': [['tickets'], ['dashboard'], ['portal'], ['projects']],
  'update.published': [['portal'], ['client-updates'], ['dashboard']],
  'notification.new': [['notifications']],
  // Package 9b emitted all four of these from the day it shipped and nothing listened, so a chat
  // only moved when something else happened to refetch it. The payloads are deliberately thin —
  // the server's answer to "what may I do to this message" is per viewer — so the client refetches
  // rather than splicing the payload into its cache.
  'conversation.message': [['conversations'], ['notifications']],
  'conversation.message.edited': [['conversations']],
  'conversation.message.deleted': [['conversations']],
  'conversation.read': [['conversations']],
  'conversation.call': [['conversations']],
};

/**
 * Keeps screens live: connects to the Socket.IO gateway with the access token and refreshes
 * the affected queries when the server reports a change. Reconnects with a new token after a
 * refresh; disconnects on sign-out.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useSession();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }
    // `path` (not a namespace): the handshake goes to /ws/, which the dev proxy and nginx forward.
    const connection = io({ path: '/ws', auth: { token: accessToken }, transports: ['websocket'] });
    for (const [event, keys] of Object.entries(INVALIDATIONS)) {
      connection.on(event, () => {
        for (const key of keys) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }
    // Published on connect rather than on creation, so a consumer never holds a socket that can
    // only queue what it emits. Withdrawn again the moment the connection drops, for the same
    // reason: a screen that thinks it is subscribed and is not is worse than one that knows.
    connection.on('connect', () => setSocket(connection));
    connection.on('disconnect', () => setSocket(null));
    return () => {
      connection.disconnect();
    };
  }, [accessToken, queryClient]);

  return <RealtimeSocketContext.Provider value={socket}>{children}</RealtimeSocketContext.Provider>;
}
