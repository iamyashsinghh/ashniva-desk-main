import type { SupportDashboard as SupportDashboardData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { cardTarget } from './card-targets';
import { KpiTile } from './KpiTile';
import { TicketPreviewList } from './preview-lists';

/**
 * Support desk: new, mine, waiting for clients, critical, resolved today.
 *
 * The two SLA tiles do not link, as on the web: this dashboard counts them over the desk's own
 * tickets, and no list view reproduces that exact set.
 */
export function SupportDashboard({ data }: { data: SupportDashboardData }) {
  const theme = useTheme();
  const { kpis } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <TileGrid>
        <KpiTile
          label="New"
          value={kpis.newTickets}
          icon="sparkles"
          iconTone="info"
          warn="warning"
          target={cardTarget('newTickets', 'New tickets')}
        />
        <KpiTile
          label="Assigned to me"
          value={kpis.assignedToMe}
          icon="person"
          iconTone="primary"
          target={cardTarget('ticketsAssignedToMe', 'Assigned to me')}
        />
        <KpiTile
          label="In progress"
          value={kpis.inProgress}
          icon="construct"
          iconTone="violet"
          target={cardTarget('ticketsInProgress', 'Tickets in progress')}
        />
        <KpiTile
          label="Waiting for clients"
          value={kpis.waitingForClient}
          icon="hourglass"
          iconTone="orange"
          target={cardTarget('waitingForClient', 'Waiting for clients')}
        />
        <KpiTile
          label="Critical"
          value={kpis.critical}
          icon="flame"
          iconTone="danger"
          warn
          target={cardTarget('criticalTickets', 'Critical tickets')}
        />
        <KpiTile
          label="Resolved today"
          value={kpis.resolvedToday}
          icon="checkmark-done"
          iconTone="success"
          target={cardTarget('resolvedToday', 'Resolved today')}
        />
        <KpiTile
          label="SLA at risk"
          value={kpis.slaAtRisk}
          icon="timer"
          iconTone="warning"
          warn="warning"
          caption="See SLA deadlines below"
        />
        <KpiTile
          label="SLA breached"
          value={kpis.slaBreached}
          icon="alert-circle"
          iconTone="danger"
          warn
          caption="See SLA deadlines below"
        />
      </TileGrid>

      <TicketPreviewList
        title="SLA deadlines"
        icon="timer-outline"
        tickets={data.slaTickets}
        emptyTitle="No ticket is at risk"
      />
      <TicketPreviewList
        title="New tickets"
        icon="sparkles-outline"
        tickets={data.newTickets}
        emptyTitle="No new tickets"
        seeAll={cardTarget('newTickets', 'New tickets')}
      />
      <TicketPreviewList
        title="Critical"
        icon="flame-outline"
        tickets={data.criticalTickets}
        emptyTitle="No critical tickets"
        seeAll={cardTarget('criticalTickets', 'Critical tickets')}
      />
      <TicketPreviewList
        title="My tickets"
        icon="person-outline"
        tickets={data.myTickets}
        emptyTitle="Nothing assigned to you"
        seeAll={cardTarget('ticketsAssignedToMe', 'Assigned to me')}
      />
      <TicketPreviewList
        title="Waiting for clients"
        icon="hourglass-outline"
        tickets={data.waitingForClient}
        emptyTitle="Nobody is waiting on a client"
        seeAll={cardTarget('waitingForClient', 'Waiting for clients')}
      />
    </View>
  );
}
