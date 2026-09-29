import { EmptyState } from '../../shared/components/states';
import { CONVERSATION_FILTER, type ConversationFilter } from './conversation-filters';

/**
 * Nothing to show, and why.
 *
 * Three different reasons, because "No conversations" under an active filter is a lie about the
 * account rather than an answer about the filter.
 */
export function InboxEmpty({
  filter,
  searching,
  personalChat,
}: {
  filter: ConversationFilter;
  searching: boolean;
  personalChat: boolean;
}) {
  if (searching) {
    return (
      <EmptyState
        title="Nothing matches"
        description="Try a different search, or choose All."
        icon="search-outline"
        iconTone="neutral"
      />
    );
  }
  if (filter !== CONVERSATION_FILTER.ALL) {
    return (
      <EmptyState
        title="Nothing here"
        description="Nothing under this filter. Try All to see everything you are in."
        icon="filter-outline"
        iconTone="neutral"
      />
    );
  }
  return (
    <EmptyState
      icon={personalChat ? 'chatbubbles-outline' : 'people-outline'}
      title={personalChat ? 'No conversations' : 'No team group yet'}
      description={
        personalChat
          ? 'People you can message will show up here once there is someone on your projects or teams.'
          : 'The group for your project team will show up here. You can write there, not in a private chat.'
      }
    />
  );
}
