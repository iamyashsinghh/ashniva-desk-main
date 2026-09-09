import type { DeveloperDashboard as DeveloperDashboardData } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { formatMinutes } from '../../../shared/lib/format';
import { TaskTable } from '../../tasks/components/TaskTable';
import { CARD_LINKS } from '../card-links';

/** Developer "Today": what to do now, what is stuck, what came back from review. */
export function DeveloperDashboard({ data }: { data: DeveloperDashboardData }) {
  const navigate = useNavigate();
  const { kpis } = data;
  return (
    <>
      <KpiGrid>
        <Kpi
          label="Due today"
          value={kpis.today}
          onClick={() => void navigate(CARD_LINKS.myToday)}
        />
        <Kpi
          label="In progress"
          value={kpis.inProgress}
          onClick={() => void navigate(CARD_LINKS.myInProgress)}
        />
        <Kpi
          label="Overdue"
          value={kpis.overdue}
          warn={kpis.overdue > 0}
          onClick={() => void navigate(CARD_LINKS.myOverdue)}
        />
        <Kpi label="Blocked" value={kpis.blocked} warn={kpis.blocked > 0} />
        <Kpi
          label="Completed today"
          value={kpis.completedToday}
          onClick={() => void navigate(CARD_LINKS.myCompletedToday)}
        />
        <Kpi
          label="Time today"
          value={formatMinutes(kpis.minutesToday)}
          onClick={() => void navigate(CARD_LINKS.myReports)}
        />
      </KpiGrid>
      <div className="dashboard__grid dashboard__grid--equal">
        <div className="dashboard__column">
          <Card title="Today’s tasks">
            <TaskTable
              tasks={data.todayTasks}
              showAssignee={false}
              emptyTitle="Nothing due today"
            />
          </Card>
          <Card title="In progress">
            <TaskTable
              tasks={data.inProgressTasks}
              showAssignee={false}
              emptyTitle="Nothing in progress"
              description-hint="Start a task from My tasks"
            />
          </Card>
        </div>
        <div className="dashboard__column">
          <Card
            title="Review results"
            headerAddon={<span className="muted">returned or reopened</span>}
          >
            <TaskTable
              tasks={data.reviewResults}
              showAssignee={false}
              emptyTitle="No review feedback"
            />
          </Card>
          <Card title="Overdue">
            <TaskTable
              tasks={data.overdueTasks}
              showAssignee={false}
              emptyTitle="Nothing overdue"
            />
          </Card>
          <Card title="Blocked">
            <TaskTable
              tasks={data.blockedTasks}
              showAssignee={false}
              emptyTitle="Nothing blocked"
            />
          </Card>
        </div>
      </div>
    </>
  );
}
