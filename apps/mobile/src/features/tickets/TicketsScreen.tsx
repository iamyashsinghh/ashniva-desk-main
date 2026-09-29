import { PERMISSIONS, type TicketListView } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { Button, Screen } from '../../shared/components/primitives';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { usePermission, useSession } from '../auth/SessionProvider';
import { TicketFilterSheet } from './TicketFilterSheet';
import { TicketListBody, useTicketList } from './TicketListBody';
import {
  NO_FILTERS,
  activeFilterCount,
  defaultView,
  ticketAudience,
  ticketListQuery,
  viewOptions,
} from './ticket-views';

/**
 * Tickets: the desk for staff, "my tickets" for an internal employee, the portal list for a client.
 *
 * The views are the web's, per audience (see `ticket-views.ts`), and the list comes from the
 * endpoint that audience is allowed — so a client's list is built by the portal's allow-list
 * mapper and never carries an internal status. Changing view clears the status filter, as the
 * web does, because most views are themselves a set of statuses.
 */
export function TicketsScreen({
  onOpen,
  onRaise,
}: {
  onOpen: (ticketId: string) => void;
  onRaise: () => void;
}) {
  const theme = useTheme();
  const { user } = useSession();
  const canRaise = usePermission(PERMISSIONS.TICKET_RAISE);
  const audience = ticketAudience(user);
  const [view, setView] = useState<TicketListView>(defaultView(audience));
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const settledSearch = useDebounced(search.trim());

  const result = useTicketList(ticketListQuery(view, filters, settledSearch));
  const filtered = activeFilterCount(filters) > 0 || settledSearch.length > 0;

  return (
    <Screen>
      <TabBar
        accessibilityLabel="Ticket views"
        options={viewOptions(audience)}
        value={view}
        onChange={(next) => {
          setView(next);
          setFilters((current) => ({ ...current, status: [] }));
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.screen,
          paddingTop: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <SearchFilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search number, title…"
            activeFilters={activeFilterCount(filters)}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </View>
        {canRaise ? (
          <Button
            label="Raise a ticket"
            icon="add-circle-outline"
            onPress={onRaise}
            accessibilityHint="Opens a new ticket"
          />
        ) : null}
      </View>

      <TicketListBody
        result={result}
        onOpen={onOpen}
        {...(filtered
          ? {
              emptyTitle: 'No tickets match',
              emptyDescription: 'Try another view, or clear the search and filters.',
            }
          : {})}
      />

      <TicketFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        audience={audience}
        filters={filters}
        onChange={setFilters}
      />
    </Screen>
  );
}
