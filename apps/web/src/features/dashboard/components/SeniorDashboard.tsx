import type { SeniorDashboard as SeniorDashboardData } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { formatMinutes } from '../../../shared/lib/format';
import { TaskTable } from '../../tasks/components/TaskTable';
import { CARD_LINKS } from '../card-links';
import { SectionTitle, StatusBarsCard, WorkloadCard } from './DashboardWidgets';

/**
 * Team Lead / Senior: what they manage (assigned, reviewed, monitored) is kept separate from
 * their own development work, as required. The "own" section can be switched off in Admin.
 */
export function SeniorDashboard({ data }: { data: SeniorDashboardData }) {
  const navigate = useNavigate();
  const { management, own } = data;
  return (
    <>
      <SectionTitle hint="work you assign, review and monitor">Management</SectionTitle>
      <KpiGrid>
        <Kpi
          label="Assigned by me"
          value={management.assignedByMe}
          onClick={() => void navigate(CARD_LINKS.assignedByMe)}
        />
        <Kpi
          label="Completed today"
          value={management.completedToday}
          onClick={() => void navigate(CARD_LINKS.teamCompletedToday)}
        />
        <Kpi
          label="Under review"
          value={management.underReview}
          onClick={() => void navigate(CARD_LINKS.teamUnderReview)}
        />
        <Kpi
          label="Delayed"
          value={management.delayed}
          warn={management.delayed > 0}
          onClick={() => void navigate(CARD_LINKS.teamDelayed)}
        />
        <Kpi
          label="Blockers"
          value={management.blockers.length}
          warn={management.blockers.length > 0}
        />
        <Kpi
          label="Updates to publish"
          value={management.updatesWaitingToPublish}
          onClick={() => void navigate(CARD_LINKS.updatesWaitingToPublish)}
        />
      </KpiGrid>
      <div className="dashboard__grid">
        <div className="dashboard__column">
          <Card title="Review queue" headerAddon={<span className="muted">waiting for you</span>}>
            <TaskTable tasks={management.reviewQueue} emptyTitle="Nothing to review" />
          </Card>
          <Card title="Blockers">
            <TaskTable tasks={management.blockers} emptyTitle="No blocked tasks" />
          </Card>
        </div>
        <div className="dashboard__column">
          <StatusBarsCard counts={management.teamProgress} title="Team progress" />
          <WorkloadCard entries={management.workload} />
        </div>
      </div>

      {own.enabled ? (
        <>
          <SectionTitle hint="your own tasks and time">Development</SectionTitle>
          <KpiGrid>
            <Kpi
              label="In progress"
              value={own.inProgress}
              onClick={() => void navigate(CARD_LINKS.myInProgress)}
            />
            <Kpi
              label="Overdue"
              value={own.overdue}
              warn={own.overdue > 0}
              onClick={() => void navigate(CARD_LINKS.myOverdue)}
            />
            <Kpi label="Dev time today" value={formatMinutes(own.minutesToday)} />
          </KpiGrid>
          <Card title="My tasks today">
            <TaskTable
              tasks={own.todayTasks}
              showAssignee={false}
              emptyTitle="No development tasks due today"
            />
          </Card>
        </>
      ) : null}
    </>
  );
}
