import { NOTIFICATION_TYPE } from '@ashniva/types';
import { useMemo } from 'react';

import { useNotificationsQuery } from '../notifications/api';

/**
 * The conversations where somebody has been named and has not read it yet.
 *
 * There is no mention count on `ConversationSummary`, and inventing one in the client would mean
 * scanning every message body for the viewer's id — which the client does not hold for the
 * conversations it has not opened. What *is* real is the notification: the server writes a
 * `CONVERSATION_MENTION` row, addressed to this person, carrying the conversation's id, and it
 * writes it only for people who were in the audience at the time.
 *
 * So the badge is read from the unread notifications rather than from the conversation list. That
 * is one request the notification centre already makes — the query key is shared, so opening the
 * messages screen adds nothing — and it is the same fact the bell is showing.
 */
export function useMentionedConversationIds(): ReadonlySet<string> {
  const unread = useNotificationsQuery(true);
  const pages = unread.data?.pages;

  return useMemo(() => {
    const ids = new Set<string>();
    for (const page of pages ?? []) {
      for (const row of page.items) {
        if (
          row.type === NOTIFICATION_TYPE.CONVERSATION_MENTION &&
          row.entityType === 'conversation' &&
          row.entityId
        ) {
          ids.add(row.entityId);
        }
      }
    }
    return ids;
  }, [pages]);
}
