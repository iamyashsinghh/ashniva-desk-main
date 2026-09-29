import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

import { useSession } from '../../features/auth/session-context';
import { getAccessToken } from '../../features/auth/session-store';
import { refreshSession } from '../../shared/lib/api-client';
import { RealtimeSocketContext } from './realtime-socket-context';

/** The least time between two refreshes prompted by the gateway closing the connection. */
const KICK_REFRESH_INTERVAL_MS = 30_000;

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
  const lastKickRefresh = useRef(0);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }
    // `path` (not a namespace): the handshake goes to /ws/, which the dev proxy and nginx forward.
    // `auth` is read at every handshake, so a reconnect presents the current token rather than
    // the one this socket was opened with.
    const connection = io({
      path: '/ws',
      auth: (callback) => callback({ token: getAccessToken() ?? accessToken }),
      transports: ['websocket'],
    });
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
    connection.on('disconnect', (reason) => {
      setSocket(null);
      // The gateway checks the token only as a connection opens and closes the ones it refuses,
      // after which Socket.IO does not retry. A reconnect after the fifteen-minute access token
      // has lapsed is refused for exactly that reason, and on a quiet page nothing else would
      // refresh it — the chat would silently stop updating. A refresh changes the token, which
      // opens a new connection. Rate-limited so a refusal for another reason cannot loop.
      if (
        reason === 'io server disconnect' &&
        Date.now() - lastKickRefresh.current > KICK_REFRESH_INTERVAL_MS
      ) {
        lastKickRefresh.current = Date.now();
        void refreshSession();
      }
    });
    return () => {
      connection.disconnect();
    };
  }, [accessToken, queryClient]);

  return <RealtimeSocketContext.Provider value={socket}>{children}</RealtimeSocketContext.Provider>;
}
