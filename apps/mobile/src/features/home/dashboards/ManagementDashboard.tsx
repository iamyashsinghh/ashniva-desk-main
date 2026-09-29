import type { ManagementDashboard as ManagementDashboardData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { cardTarget } from './card-targets';
import { KpiTile } from './KpiTile';
import { TaskPreviewList, TicketPreviewList } from './preview-lists';
import { ProjectsList, UpdatesList, WorkloadList } from './team-lists';

const ON_WEB = 'Open on the web app';

/** Super Admin and Project Manager: the whole organization at a glance. */
export function ManagementDashboard({ data }: { data: ManagementDashboardData }) {
  const theme = useTheme();
  const { kpis } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <TileGrid>
        <KpiTile
          label="Active projects"
          value={kpis.activeProjects}
          icon="folder-open"
          iconTone="info"
          target={cardTarget('activeProjects', 'Active projects')}
        />
        <KpiTile
          label="At risk"
          value={kpis.projectsAtRisk}
          icon="warning"
          iconTone="warning"
          warn="warning"
          target={cardTarget('projectsAtRisk', 'At risk')}
        />
        <KpiTile
          label="Completed today"
          value={kpis.completedToday}
          icon="checkmark-done"
          iconTone="success"
          target={cardTarget('completedToday', 'Completed today')}
        />
        <KpiTile
          label="Overdue tasks"
          value={kpis.overdueTasks}
          icon="alarm"
          iconTone="danger"
          warn
          target={cardTarget('overdueTasks', 'Overdue tasks')}
        />
        <KpiTile
          label="Critical tickets"
          value={kpis.criticalTickets}
          icon="flame"
          iconTone="danger"
          warn
          target={cardTarget('criticalTickets', 'Critical tickets')}
        />
        <KpiTile
          label="Pending reviews"
          value={kpis.pendingReviews}
          icon="eye"
          iconTone="violet"
          target={cardTarget('pendingReviews', 'Pending reviews')}
        />
        <KpiTile
          label="Updates to publish"
          value={kpis.updatesWaitingToPublish}
          icon="megaphone"
          iconTone="pink"
          caption={ON_WEB}
          target={cardTarget('updatesWaitingToPublish', 'Updates to publish')}
        />
        <KpiTile
          label="Open tickets"
          value={kpis.openTickets}
          icon="ticket"
          iconTone="orange"
          target={cardTarget('openTickets', 'Open tickets')}
        />
        <KpiTile
          label="SLA at risk"
          value={kpis.slaAtRisk}
          icon="hourglass"
          iconTone="warning"
          warn="warning"
          target={cardTarget('slaAtRisk', 'SLA at risk')}
        />
        <KpiTile
          label="SLA breached"
          value={kpis.slaBreached}
          icon="timer"
          iconTone="danger"
          warn
          target={cardTarget('slaBreached', 'SLA breached')}
        />
        <KpiTile
          label="Contracts expiring"
          value={kpis.contractsExpiring}
          icon="document-text"
          iconTone="teal"
          warn="warning"
          caption={ON_WEB}
          target={cardTarget('contractsExpiring', 'Contracts expiring')}
        />
        <KpiTile
          label="Awaiting client"
          value={kpis.approvalsWaitingClient}
          icon="shield-checkmark"
          iconTone="success"
          target={cardTarget('approvalsWaitingClient', 'Awaiting client approval')}
        />
        <KpiTile
          label="Change requests"
          value={kpis.openChangeRequests}
          icon="git-pull-request"
          iconTone="neutral"
          caption={ON_WEB}
          target={cardTarget('openChangeRequests', 'Open change requests')}
        />
      </TileGrid>

      <ProjectsList projects={data.projects} />
      <TaskPreviewList
        title="Overdue tasks"
        icon="alarm-outline"
        tasks={data.overdueTasks}
        emptyTitle="Nothing overdue"
        seeAll={cardTarget('overdueTasks', 'Overdue tasks')}
      />
      <TicketPreviewList
        title="Critical tickets"
        icon="flame-outline"
        tickets={data.criticalTickets}
        emptyTitle="No critical tickets"
        seeAll={cardTarget('criticalTickets', 'Critical tickets')}
      />
      <WorkloadList entries={data.workload} />
      <UpdatesList updates={data.updatesWaiting} />
    </View>
  );
}
