import { useChatUnreadCount } from '../../features/chat/unread-count';

/** Unread chat messages, for the Messages tab and the menu's Messages entry. */
export function useChatBadge(): number {
  return useChatUnreadCount();
}
