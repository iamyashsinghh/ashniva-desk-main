import type { EmployeeDashboard as EmployeeDashboardData } from '@ashniva/types';
import { Button, Card, Kpi, KpiGrid } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { TicketTable } from '../../tickets/components/TicketTable';

/** Internal employees of group companies: their own tickets. */
export function EmployeeDashboard({ data }: { data: EmployeeDashboardData }) {
  const navigate = useNavigate();
  return (
    <>
      <KpiGrid>
        <Kpi
          label="My open tickets"
          value={data.kpis.open}
          onClick={() => void navigate('/tickets')}
        />
        <Kpi
          label="Waiting for me"
          value={data.kpis.waitingForYou}
          warn={data.kpis.waitingForYou > 0}
        />
        <Kpi label="Resolved" value={data.kpis.resolved} />
      </KpiGrid>
      <Card
        title="My tickets"
        headerAddon={
          <Button size="sm" variant="primary" onClick={() => void navigate('/tickets/new')}>
            + Raise a ticket
          </Button>
        }
      >
        <TicketTable
          tickets={data.tickets}
          showClient={false}
          emptyTitle="You have not raised any tickets"
        />
      </Card>
    </>
  );
}
