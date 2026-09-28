import { Chip, ChipScroller } from '../../shared/components/chips';
import {
  CONVERSATION_FILTERS,
  CONVERSATION_FILTER_LABELS,
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
}: {
  value: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
  filters?: readonly ConversationFilter[];
}) {
  return (
    <ChipScroller>
      {filters.map((filter) => (
        <Chip
          key={filter}
          label={CONVERSATION_FILTER_LABELS[filter]}
          accessibilityLabel={`${CONVERSATION_FILTER_LABELS[filter]} conversations`}
          selected={filter === value}
          onPress={() => onChange(filter)}
        />
      ))}
    </ChipScroller>
  );
}
