import type { SupportDashboard as SupportDashboardData } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { CARD_LINKS } from '../card-links';

import { TicketTable } from '../../tickets/components/TicketTable';

/** Support desk: new, mine, waiting for clients, critical, resolved today. */
export function SupportDashboard({ data }: { data: SupportDashboardData }) {
  const navigate = useNavigate();
  const { kpis } = data;
  return (
    <>
      <KpiGrid>
        <Kpi
          label="New"
          value={kpis.newTickets}
          warn={kpis.newTickets > 0}
          onClick={() => void navigate(CARD_LINKS.newTickets)}
        />
        <Kpi
          label="Assigned to me"
          value={kpis.assignedToMe}
          onClick={() => void navigate(CARD_LINKS.ticketsAssignedToMe)}
        />
        <Kpi
          label="In progress"
          value={kpis.inProgress}
          onClick={() => void navigate(CARD_LINKS.ticketsInProgress)}
        />
        <Kpi
          label="Waiting for clients"
          value={kpis.waitingForClient}
          onClick={() => void navigate(CARD_LINKS.waitingForClient)}
        />
        <Kpi
          label="Critical"
          value={kpis.critical}
          warn={kpis.critical > 0}
          onClick={() => void navigate(CARD_LINKS.criticalTickets)}
        />
        <Kpi
          label="Resolved today"
          value={kpis.resolvedToday}
          onClick={() => void navigate(CARD_LINKS.resolvedToday)}
        />
        <Kpi label="SLA at risk" value={kpis.slaAtRisk} warn={kpis.slaAtRisk > 0} />
        <Kpi label="SLA breached" value={kpis.slaBreached} warn={kpis.slaBreached > 0} />
      </KpiGrid>
      <div className="dashboard__grid dashboard__grid--equal">
        <div className="dashboard__column">
          <Card title="SLA deadlines" headerAddon={<span className="muted">soonest first</span>}>
            <TicketTable tickets={data.slaTickets} emptyTitle="No ticket is at risk" />
          </Card>
          <Card title="New tickets" headerAddon={<span className="muted">assign or convert</span>}>
            <TicketTable tickets={data.newTickets} emptyTitle="No new tickets" />
          </Card>
          <Card title="Critical">
            <TicketTable tickets={data.criticalTickets} emptyTitle="No critical tickets" />
          </Card>
        </div>
        <div className="dashboard__column">
          <Card title="My tickets">
            <TicketTable tickets={data.myTickets} emptyTitle="Nothing assigned to you" />
          </Card>
          <Card title="Waiting for clients">
            <TicketTable
              tickets={data.waitingForClient}
              emptyTitle="Nobody is waiting on a client"
            />
          </Card>
        </div>
      </div>
    </>
  );
}
