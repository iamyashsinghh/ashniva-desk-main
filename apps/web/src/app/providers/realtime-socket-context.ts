import { createContext, useContext } from 'react';
import type { Socket } from 'socket.io-client';

/**
 * The live socket, for the screens that have something to say to the server rather than only
 * something to hear from it.
 *
 * Null until the connection exists, and null again after sign-out, so a consumer has to cope with
 * not having one — which is the honest shape, because a websocket is not always there.
 *
 * In its own file rather than beside the provider so that `RealtimeProvider.tsx` exports only a
 * component, which is what keeps fast refresh working for it.
 */
export const RealtimeSocketContext = createContext<Socket | null>(null);

export function useRealtimeSocket(): Socket | null {
  return useContext(RealtimeSocketContext);
}
