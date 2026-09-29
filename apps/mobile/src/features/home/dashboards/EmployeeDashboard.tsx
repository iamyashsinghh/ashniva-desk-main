import type { EmployeeDashboard as EmployeeDashboardData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { cardTarget } from './card-targets';
import { KpiTile } from './KpiTile';
import { TicketPreviewList } from './preview-lists';

/** Internal employees of group companies: the tickets they raised. */
export function EmployeeDashboard({ data }: { data: EmployeeDashboardData }) {
  const theme = useTheme();
  const { kpis } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <TileGrid>
        <KpiTile
          label="My open tickets"
          value={kpis.open}
          icon="ticket"
          iconTone="orange"
          target={cardTarget('myTickets', 'My tickets')}
        />
        <KpiTile
          label="Waiting for me"
          value={kpis.waitingForYou}
          icon="hand-left"
          iconTone="warning"
          warn="warning"
        />
        <KpiTile label="Resolved" value={kpis.resolved} icon="checkmark-done" iconTone="success" />
      </TileGrid>

      <TicketPreviewList
        title="My tickets"
        icon="ticket-outline"
        tickets={data.tickets}
        emptyTitle="You have not raised any tickets"
        showClient={false}
        seeAll={cardTarget('myTickets', 'My tickets')}
      />
    </View>
  );
}
