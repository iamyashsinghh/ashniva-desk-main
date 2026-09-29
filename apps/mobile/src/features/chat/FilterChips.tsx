import { Chip, ChipScroller } from '../../shared/components/chips';
import {
  CONVERSATION_FILTER,
  CONVERSATION_FILTERS,
  CONVERSATION_FILTER_LABELS,
  unreadBadge,
  type ConversationFilter,
} from './conversation-filters';

/**
 * The filters, as a scrollable row of chips.
 *
 * A row rather than the web app's sidebar, and scrollable rather than a segmented control: there
 * are four of them and a segmented control that holds four on a phone holds none of them
 * legibly, least of all at a large text size. Horizontal scrolling keeps every label whole.
 *
 * `accessibilityState.selected` rather than colour alone, so which one is on is not carried by a
 * colour difference.
 */
export function FilterChips({
  value,
  onChange,
  filters = CONVERSATION_FILTERS,
  unreadCount = null,
}: {
  value: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
  filters?: readonly ConversationFilter[];
  /** The Unread chip's figure, as on the web. `null` or zero draws the plain label. */
  unreadCount?: number | null;
}) {
  return (
    <ChipScroller>
      {filters.map((filter) => {
        const label = CONVERSATION_FILTER_LABELS[filter];
        const count = filter === CONVERSATION_FILTER.UNREAD && unreadCount ? unreadCount : 0;
        return (
          <Chip
            key={filter}
            label={count > 0 ? `${label} ${unreadBadge(count)}` : label}
            accessibilityLabel={
              count > 0 ? `${label} conversations, ${count} unread` : `${label} conversations`
            }
            selected={filter === value}
            onPress={() => onChange(filter)}
          />
        );
      })}
    </ChipScroller>
  );
}
