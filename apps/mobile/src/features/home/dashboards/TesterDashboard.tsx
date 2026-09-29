import type { TesterDashboard as TesterDashboardData } from '@ashniva/types';
import { View } from 'react-native';

import { TileGrid } from '../../../shared/components/data-display';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { cardTarget } from './card-targets';
import { KpiTile } from './KpiTile';
import { TaskPreviewList } from './preview-lists';

/** Tester / QA: the testing queue, today's verdicts, reopened work and recent history. */
export function TesterDashboard({ data }: { data: TesterDashboardData }) {
  const theme = useTheme();
  const { kpis } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <TileGrid>
        <KpiTile
          label="Awaiting testing"
          value={kpis.awaitingTesting}
          icon="flask"
          iconTone="teal"
          warn="warning"
          target={cardTarget('myReviewQueue', 'Awaiting testing')}
        />
        <KpiTile
          label="Approved today"
          value={kpis.approvedToday}
          icon="checkmark-circle"
          iconTone="success"
        />
        <KpiTile
          label="Rejected today"
          value={kpis.rejectedToday}
          icon="close-circle"
          iconTone="danger"
        />
        <KpiTile label="Reopened" value={kpis.reopened} icon="refresh-circle" iconTone="orange" />
      </TileGrid>

      <TaskPreviewList
        title="Awaiting testing"
        icon="flask-outline"
        iconTone="teal"
        tasks={data.awaitingTesting}
        emptyTitle="Nothing to test right now"
        seeAll={cardTarget('myReviewQueue', 'Awaiting testing')}
      />
      <TaskPreviewList
        title="Reopened"
        icon="refresh-outline"
        iconTone="orange"
        tasks={data.reopened}
        emptyTitle="Nothing reopened"
      />
      <TaskPreviewList
        title="Testing history"
        icon="document-text-outline"
        iconTone="neutral"
        tasks={data.history}
        emptyTitle="No verdicts yet"
      />
    </View>
  );
}
