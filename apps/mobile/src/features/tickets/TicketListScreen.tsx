import { View } from 'react-native';

import { ChipScroller } from '../../shared/components/chips';
import { Icon } from '../../shared/components/Icon';
import { AppText, Pill, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { TicketListBody, useTicketList } from './TicketListBody';
import { queryChips } from './ticket-query-chips';

/**
 * A ticket list opened from a dashboard tile, with the tile's filters already applied.
 *
 * The query is the tile's, passed straight to the list endpoint — `{ view: 'sla-at-risk' }`, or a
 * view plus statuses and a project — so the list is exactly the set the tile counted. The filters
 * are shown as chips rather than editable controls: this screen answers "which ones are those?",
 * and changing the question belongs on the Tickets tab.
 */
export function TicketListScreen({
  title,
  query,
  onOpen,
}: {
  title?: string;
  query: Readonly<Record<string, string>>;
  onOpen: (ticketId: string) => void;
}) {
  const theme = useTheme();
  const result = useTicketList(query);
  const chips = queryChips(query, result.list.items);

  const header =
    title || chips.length > 0 ? (
      <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
        {title ? <AppText variant="heading">{title}</AppText> : null}
        {chips.length > 0 ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <Icon name="funnel-outline" size={14} color={theme.colors.textFaint} />
            <View style={{ flex: 1 }}>
              <ChipScroller>
                {chips.map((chip) => (
                  <Pill key={chip.key} label={chip.label} tone="info" />
                ))}
              </ChipScroller>
            </View>
          </View>
        ) : null}
      </View>
    ) : undefined;

  return (
    <Screen>
      <TicketListBody
        result={result}
        onOpen={onOpen}
        emptyTitle="Nothing here right now"
        emptyDescription="No tickets match these filters at the moment."
        {...(header ? { header } : {})}
      />
    </Screen>
  );
}
