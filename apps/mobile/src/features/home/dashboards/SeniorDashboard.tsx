import type { SeniorDashboard as SeniorDashboardData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import { SectionHeader } from '../../../shared/components/layout';
import { formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { cardTarget } from './card-targets';
import { KpiTile } from './KpiTile';
import { TaskPreviewList } from './preview-lists';
import { StatusBars, WorkloadList } from './team-lists';

/**
 * Team Lead / Senior: what they assign, review and monitor, kept apart from their own development
 * work. The own half can be switched off in Admin, and then it is not drawn at all.
 */
export function SeniorDashboard({ data }: { data: SeniorDashboardData }) {
  const theme = useTheme();
  const { management, own } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Your team" icon="people-outline" />
        <TileGrid>
          <KpiTile
            label="Assigned by me"
            value={management.assignedByMe}
            icon="send"
            iconTone="info"
            target={cardTarget('assignedByMe', 'Assigned by me')}
          />
          <KpiTile
            label="Completed today"
            value={management.completedToday}
            icon="checkmark-done"
            iconTone="success"
            target={cardTarget('teamCompletedToday', 'Team completed today')}
          />
          <KpiTile
            label="Under review"
            value={management.underReview}
            icon="eye"
            iconTone="violet"
            target={cardTarget('teamUnderReview', 'Team under review')}
          />
          <KpiTile
            label="Delayed"
            value={management.delayed}
            icon="alarm"
            iconTone="danger"
            warn
            target={cardTarget('teamDelayed', 'Team delayed')}
          />
          <KpiTile
            label="Blockers"
            value={management.blockers.length}
            icon="hand-left"
            iconTone="warning"
            warn
            caption="Listed below"
          />
          <KpiTile
            label="Updates to publish"
            value={management.updatesWaitingToPublish}
            icon="megaphone"
            iconTone="pink"
            caption="Open on the web app"
          />
        </TileGrid>
      </View>

      <TaskPreviewList
        title="Review queue"
        icon="eye-outline"
        iconTone="violet"
        tasks={management.reviewQueue}
        emptyTitle="Nothing to review"
        seeAll={cardTarget('myReviewQueue', 'My review queue')}
      />
      <TaskPreviewList
        title="Blockers"
        icon="hand-left-outline"
        iconTone="warning"
        tasks={management.blockers}
        emptyTitle="No blocked tasks"
      />
      <StatusBars counts={management.teamProgress} title="Team progress" />
      <WorkloadList entries={management.workload} />

      {own.enabled ? (
        <View style={{ gap: theme.spacing.section }}>
          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title="Your own work" icon="code-slash-outline" />
            <TileGrid>
              <KpiTile
                label="In progress"
                value={own.inProgress}
                icon="construct"
                iconTone="info"
                target={cardTarget('myInProgress', 'My tasks in progress')}
              />
              <KpiTile
                label="Overdue"
                value={own.overdue}
                icon="alarm"
                iconTone="danger"
                warn
                target={cardTarget('myOverdue', 'My overdue tasks')}
              />
              <KpiTile
                label="Dev time today"
                value={formatMinutes(own.minutesToday)}
                icon="time"
                iconTone="pink"
              />
            </TileGrid>
          </View>
          <TaskPreviewList
            title="My tasks today"
            icon="today-outline"
            tasks={own.todayTasks}
            emptyTitle="No development tasks due today"
            showAssignee={false}
            seeAll={cardTarget('myToday', 'My tasks today')}
          />
        </View>
      ) : null}
    </View>
  );
}
