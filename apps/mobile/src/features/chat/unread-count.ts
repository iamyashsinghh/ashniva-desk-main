import type { ConversationSummary } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { shouldRetry } from '../../shared/api/queries';
import { useSession } from '../auth/SessionProvider';
import { canStartPersonalChat, canUseInternalChat } from './chat-access';
import { isInboxKind } from './conversation-filters';
import {
  MAX_CONVERSATION_WINDOW,
  conversationListKey,
  fetchConversationList,
} from './conversation-list-api';

/**
 * Unread messages across the people inbox: direct messages and groups, or only groups for
 * somebody who may not hold a private conversation. The same rows the inbox lists, so the badge
 * and the list cannot disagree about what counts.
 */
export function unreadTotal(rows: readonly ConversationSummary[], personalChat: boolean): number {
  return rows
    .filter((row) => isInboxKind(row.kind, personalChat))
    .reduce((total, row) => total + row.unreadCount, 0);
}

/**
 * The figure for the Messages tab and the drawer — the web messenger dock's number.
 *
 * One request for the endpoint's widest window, which is live because every conversation event
 * the socket reports refreshes the `conversations` tree. Zero, and no request at all, for
 * somebody with no internal chat: a client has no conversations anywhere in the system.
 */
export function useChatUnreadCount(): number {
  const { user } = useSession();
  const enabled = canUseInternalChat(user);
  const personalChat = canStartPersonalChat(user);
  const query = useQuery<ConversationSummary[]>({
    queryKey: conversationListKey({}, MAX_CONVERSATION_WINDOW),
    queryFn: () => fetchConversationList({}, MAX_CONVERSATION_WINDOW),
    enabled,
    retry: shouldRetry,
  });
  // A badge feeds the tab bar itself; an answer of an unexpected shape costs the number, not
  // the whole bar.
  const rows = Array.isArray(query.data) ? query.data : [];
  return enabled ? unreadTotal(rows, personalChat) : 0;
}
