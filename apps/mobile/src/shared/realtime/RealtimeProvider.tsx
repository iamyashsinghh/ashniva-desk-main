import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { mobileEnv } from '../../config/env';
import { getAccessToken, subscribeToSession } from '../../features/auth/session-store';
import { refreshSession } from '../api/client';

/** The least time between two refreshes prompted by the gateway closing the connection. */
const KICK_REFRESH_INTERVAL_MS = 30_000;

/** Query-key prefixes refreshed by each realtime event — the same map the web app uses. */
export const REALTIME_INVALIDATIONS: Record<string, string[][]> = {
  'task.updated': [['tasks'], ['dashboard'], ['projects'], ['work-plan'], ['client-updates']],
  'ticket.updated': [['tickets'], ['dashboard'], ['portal'], ['projects']],
  'update.published': [['portal'], ['client-updates'], ['dashboard']],
  'notification.new': [['notifications']],
  'conversation.message': [['conversations'], ['notifications']],
  'conversation.message.edited': [['conversations']],
  'conversation.message.deleted': [['conversations']],
  'conversation.read': [['conversations']],
  'conversation.call': [['conversations']],
};

/** The gateway is served from the API's origin, not under its `/api/v1` prefix. */
export function realtimeOrigin(apiBaseUrl: string): string {
  const match = /^(https?:\/\/[^/]+)/.exec(apiBaseUrl);
  return match?.[1] ?? apiBaseUrl;
}

const RealtimeContext = createContext<Socket | null>(null);

/**
 * Keeps screens live on the phone the way the web app is: one Socket.IO connection, opened with
 * the access token, refreshing the queries an event affects.
 *
 * Two things differ from the browser. The token is read from the session store and the
 * connection is re-opened whenever a refresh replaces it, since the gateway authenticates once at
 * the handshake. And the socket is closed while the app is in the background: the OS would
 * suspend it anyway, and a reconnect on return — followed by a refetch — is cheaper than a zombie
 * connection. Push notifications cover the time in between.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(getAccessToken());
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [socket, setSocket] = useState<Socket | null>(null);
  const wasConnected = useRef(false);
  const lastKickRefresh = useRef(0);

  useEffect(() => subscribeToSession((session) => setToken(session?.accessToken ?? null)), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!token || !foreground) {
      return undefined;
    }
    const connection = io(realtimeOrigin(mobileEnv.apiBaseUrl), {
      path: '/ws',
      // Read at every handshake, reconnections included, so a reconnect after a dropped
      // connection presents the current token rather than the one this socket was opened with.
      auth: (callback) => callback({ token: getAccessToken() ?? token }),
      transports: ['websocket'],
    });
    for (const [event, keys] of Object.entries(REALTIME_INVALIDATIONS)) {
      connection.on(event, () => {
        for (const key of keys) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }
    connection.on('connect', () => {
      // Anything that changed while we were away was not announced to us; catch up once.
      if (wasConnected.current) {
        void queryClient.invalidateQueries();
      }
      wasConnected.current = true;
      setSocket(connection);
    });
    connection.on('disconnect', (reason) => {
      setSocket(null);
      // The gateway checks the token only as a connection opens and closes the ones it refuses —
      // after which Socket.IO does not retry. An access token lives fifteen minutes, so a
      // reconnect on a quiet screen is usually refused for that reason, and nothing else would
      // ever refresh it: live messages would just stop. A refresh changes the token, which opens
      // a new connection above. Rate-limited so a refusal for any other reason cannot loop.
      if (
        reason === 'io server disconnect' &&
        Date.now() - lastKickRefresh.current > KICK_REFRESH_INTERVAL_MS
      ) {
        lastKickRefresh.current = Date.now();
        void refreshSession();
      }
    });
    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      setSocket(null);
    };
  }, [token, foreground, queryClient]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

/** The live socket, or null while disconnected. */
export function useRealtimeSocket(): Socket | null {
  return useContext(RealtimeContext);
}

/**
 * Runs `handler` for every `event` the server sends while connected.
 *
 * The handler is held in a ref so a caller can pass an inline function without re-subscribing on
 * every render.
 */
export function useRealtimeEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
  const socket = useRealtimeSocket();
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    const listener = (payload: T) => latest.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
