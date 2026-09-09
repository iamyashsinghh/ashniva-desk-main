import type { TesterDashboard as TesterDashboardData } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { TaskTable } from '../../tasks/components/TaskTable';
import { CARD_LINKS } from '../card-links';

/** Tester / QA: the testing queue, today's verdicts, reopened work and recent history. */
export function TesterDashboard({ data }: { data: TesterDashboardData }) {
  const navigate = useNavigate();
  const { kpis } = data;
  return (
    <>
      <KpiGrid>
        <Kpi
          label="Awaiting testing"
          value={kpis.awaitingTesting}
          warn={kpis.awaitingTesting > 0}
          onClick={() => void navigate(CARD_LINKS.myReviewQueue)}
        />
        <Kpi label="Approved today" value={kpis.approvedToday} />
        <Kpi label="Rejected today" value={kpis.rejectedToday} />
        <Kpi label="Reopened" value={kpis.reopened} />
      </KpiGrid>
      <div className="dashboard__grid dashboard__grid--equal">
        <div className="dashboard__column">
          <Card title="Awaiting testing">
            <TaskTable tasks={data.awaitingTesting} emptyTitle="Nothing to test right now" />
          </Card>
        </div>
        <div className="dashboard__column">
          <Card title="Reopened">
            <TaskTable tasks={data.reopened} emptyTitle="Nothing reopened" />
          </Card>
          <Card
            title="Testing history"
            headerAddon={<span className="muted">your recent verdicts</span>}
          >
            <TaskTable tasks={data.history} emptyTitle="No verdicts yet" />
          </Card>
        </div>
      </div>
    </>
  );
}
