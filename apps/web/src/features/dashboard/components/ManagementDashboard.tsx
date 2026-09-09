import type { ManagementDashboard as ManagementDashboardData } from '@ashniva/types';
import { Card, Kpi, KpiGrid } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { TaskTable } from '../../tasks/components/TaskTable';
import { TicketTable } from '../../tickets/components/TicketTable';
import { CARD_LINKS } from '../card-links';
import { ProjectsCard, UpdatesCard, WorkloadCard } from './DashboardWidgets';

/** Super Admin and Project Manager: the whole organization at a glance. */
export function ManagementDashboard({ data }: { data: ManagementDashboardData }) {
  const navigate = useNavigate();
  const { kpis } = data;
  return (
    <>
      <KpiGrid>
        <Kpi
          label="Active projects"
          value={kpis.activeProjects}
          onClick={() => void navigate(CARD_LINKS.activeProjects)}
        />
        <Kpi
          label="At risk"
          value={kpis.projectsAtRisk}
          warn={kpis.projectsAtRisk > 0}
          onClick={() => void navigate(CARD_LINKS.projectsAtRisk)}
        />
        <Kpi
          label="Completed today"
          value={kpis.completedToday}
          onClick={() => void navigate(CARD_LINKS.completedToday)}
        />
        <Kpi
          label="Overdue tasks"
          value={kpis.overdueTasks}
          warn={kpis.overdueTasks > 0}
          onClick={() => void navigate(CARD_LINKS.overdueTasks)}
        />
        <Kpi
          label="Critical tickets"
          value={kpis.criticalTickets}
          warn={kpis.criticalTickets > 0}
          onClick={() => void navigate(CARD_LINKS.criticalTickets)}
        />
        <Kpi
          label="Pending reviews"
          value={kpis.pendingReviews}
          onClick={() => void navigate(CARD_LINKS.pendingReviews)}
        />
        <Kpi
          label="Updates to publish"
          value={kpis.updatesWaitingToPublish}
          onClick={() => void navigate(CARD_LINKS.updatesWaitingToPublish)}
        />
        <Kpi
          label="Open tickets"
          value={kpis.openTickets}
          onClick={() => void navigate(CARD_LINKS.openTickets)}
        />
        <Kpi
          label="SLA at risk"
          value={kpis.slaAtRisk}
          warn={kpis.slaAtRisk > 0}
          onClick={() => void navigate(CARD_LINKS.slaAtRisk)}
        />
        <Kpi
          label="SLA breached"
          value={kpis.slaBreached}
          warn={kpis.slaBreached > 0}
          onClick={() => void navigate(CARD_LINKS.slaBreached)}
        />
        <Kpi
          label="Contracts expiring"
          value={kpis.contractsExpiring}
          warn={kpis.contractsExpiring > 0}
          onClick={() => void navigate(CARD_LINKS.contractsExpiring)}
        />
        <Kpi
          label="Awaiting client approval"
          value={kpis.approvalsWaitingClient}
          onClick={() => void navigate(CARD_LINKS.approvalsWaitingClient)}
        />
        <Kpi
          label="Open change requests"
          value={kpis.openChangeRequests}
          onClick={() => void navigate(CARD_LINKS.openChangeRequests)}
        />
      </KpiGrid>
      <div className="dashboard__grid">
        <div className="dashboard__column">
          <ProjectsCard projects={data.projects} title="Active projects" />
          <Card title="Overdue tasks">
            <TaskTable tasks={data.overdueTasks} emptyTitle="Nothing overdue" />
          </Card>
        </div>
        <div className="dashboard__column">
          <WorkloadCard entries={data.workload} />
          <UpdatesCard updates={data.updatesWaiting} />
          <Card title="Critical tickets">
            <TicketTable tickets={data.criticalTickets} emptyTitle="No critical tickets" />
          </Card>
        </div>
      </div>
    </>
  );
}
