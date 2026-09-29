import type { DeveloperDashboard as DeveloperDashboardData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import { formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { cardTarget } from './card-targets';
import { KpiTile } from './KpiTile';
import { TaskPreviewList } from './preview-lists';

/** Developer "Today": what to do now, what is stuck, what came back from review. */
export function DeveloperDashboard({ data }: { data: DeveloperDashboardData }) {
  const theme = useTheme();
  const { kpis } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <TileGrid>
        <KpiTile
          label="Due today"
          value={kpis.today}
          icon="today"
          iconTone="info"
          target={cardTarget('myToday', 'Due today')}
        />
        <KpiTile
          label="In progress"
          value={kpis.inProgress}
          icon="construct"
          iconTone="primary"
          target={cardTarget('myInProgress', 'In progress')}
        />
        <KpiTile
          label="Overdue"
          value={kpis.overdue}
          icon="alarm"
          iconTone="danger"
          warn
          target={cardTarget('myOverdue', 'Overdue')}
        />
        <KpiTile
          label="Blocked"
          value={kpis.blocked}
          icon="hand-left"
          iconTone="warning"
          warn="warning"
          caption="Listed below"
        />
        <KpiTile
          label="Completed today"
          value={kpis.completedToday}
          icon="checkmark-done"
          iconTone="success"
          target={cardTarget('myCompletedToday', 'Completed today')}
        />
        <KpiTile
          label="Time today"
          value={formatMinutes(kpis.minutesToday)}
          icon="time"
          iconTone="pink"
        />
      </TileGrid>

      <TaskPreviewList
        title="Today’s tasks"
        icon="today-outline"
        tasks={data.todayTasks}
        emptyTitle="Nothing due today"
        showAssignee={false}
        seeAll={cardTarget('myToday', 'Due today')}
      />
      <TaskPreviewList
        title="In progress"
        icon="construct-outline"
        tasks={data.inProgressTasks}
        emptyTitle="Nothing in progress — start a task from Tasks"
        showAssignee={false}
        seeAll={cardTarget('myInProgress', 'In progress')}
      />
      <TaskPreviewList
        title="Review results"
        icon="return-down-back-outline"
        iconTone="violet"
        tasks={data.reviewResults}
        emptyTitle="No review feedback"
        showAssignee={false}
      />
      <TaskPreviewList
        title="Overdue"
        icon="alarm-outline"
        tasks={data.overdueTasks}
        emptyTitle="Nothing overdue"
        showAssignee={false}
        seeAll={cardTarget('myOverdue', 'Overdue')}
      />
      <TaskPreviewList
        title="Blocked"
        icon="hand-left-outline"
        iconTone="warning"
        tasks={data.blockedTasks}
        emptyTitle="Nothing blocked"
        showAssignee={false}
      />
    </View>
  );
}
