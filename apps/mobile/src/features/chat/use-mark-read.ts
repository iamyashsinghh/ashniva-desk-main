import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { apiRequest } from '../../shared/api/client';

/**
 * Moves this viewer's read cursor to the newest line, and brings the unread figures with it.
 *
 * Runs once the thread has actually been shown, and again whenever a newer line arrives while it is
 * in front; a thread that failed to load anything has not been read.
 *
 * **The inbox is refreshed here rather than left to the socket.** The server answers a read with a
 * `conversation.read` event to the reader, which does refresh the list — when a socket is up.
 * Without one, the row and the tab badge kept their count until something else happened to refetch
 * them, so opening a thread appeared not to have read it. The web does the same on its own.
 */
export function useMarkRead(conversationId: string, newestId: string | null, active: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!newestId || !active) {
      return;
    }
    // Not cancelled when the screen goes: somebody who backs out the moment the thread appears has
    // still read it, and the badge on the tab they land on should say so.
    apiRequest(`/conversations/${conversationId}/read`, { method: 'POST' })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      // An unread badge one refresh out of date is not worth an error over something the person
      // did not ask for.
      .catch(() => undefined);
  }, [conversationId, newestId, active, queryClient]);
}
