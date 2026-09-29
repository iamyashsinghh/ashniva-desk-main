import {
  MILESTONE_STATUS_LABELS,
  type PortalMilestoneSummary,
  type PortalProjectPlan,
  type PortalProjectPlanItem,
} from '@ashniva/types';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { useResource } from '../../../shared/api/queries';
import { MetaLine, ProgressBar, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { dateRange, milestoneTone } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { MilestoneList } from './project-parts';

/**
 * The plan as the client sees it: the milestones the team shared, with the same percentages the
 * team's own chart uses — the API computes them once and narrows the payload.
 *
 * The web draws a timeline chart; on a phone's width the same bars read better as a list in date
 * order, each with its own progress bar and window.
 */
export function ProjectPlanPanel({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: readonly PortalMilestoneSummary[];
}) {
  const query = useResource<PortalProjectPlan>(
    portalKeys.plan(projectId),
    `/portal/projects/${projectId}/plan`,
  );

  let plan = <LoadingState label="Loading the plan" variant="spinner" />;
  if (query.data) {
    plan = <PlanBody plan={query.data} />;
  } else if (query.error) {
    plan = (
      <ErrorState
        message={errorMessage(query.error)}
        offline={query.error instanceof Error && query.error.name === 'NetworkError'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <>
      {plan}
      <Section title="Milestones" icon="flag-outline" count={milestones.length}>
        <AppText size="xs" tone="faint">
          Progress comes from the linked work.
        </AppText>
        <MilestoneList milestones={milestones} />
      </Section>
    </>
  );
}

function PlanBody({ plan }: { plan: PortalProjectPlan }) {
  const theme = useTheme();
  const { progress } = plan;
  return (
    <>
      <TileGrid>
        <StatTile label="Progress" value={`${progress.percent}%`} icon="trending-up" />
        <StatTile
          label="Milestones done"
          value={`${progress.milestoneCompleted} / ${progress.milestoneTotal}`}
          icon="flag-outline"
          iconTone="violet"
        />
        <StatTile
          label="Work items done"
          value={`${progress.taskCompleted} / ${progress.taskTotal}`}
          icon="checkmark-done-outline"
          iconTone="success"
        />
      </TileGrid>
      <Section title="Plan" icon="git-network-outline">
        <MetaLine icon="calendar-outline">
          {dateRange(plan.window.startDate, plan.window.endDate)} · today{' '}
          {formatDate(plan.window.todayDate)}
        </MetaLine>
        {plan.items.length === 0 ? (
          <AppText size="sm" tone="muted">
            No milestones shared yet. Your team publishes milestones here as the plan is agreed.
          </AppText>
        ) : (
          plan.items.map((item, index) => (
            <View key={item.id} style={{ gap: theme.spacing.xs + 2 }}>
              {index > 0 ? <Divider /> : null}
              <PlanRow item={item} />
            </View>
          ))
        )}
      </Section>
    </>
  );
}

function PlanRow({ item }: { item: PortalProjectPlanItem }) {
  return (
    <>
      <AppText weight="medium">{item.name}</AppText>
      <PillRow>
        <Pill label={MILESTONE_STATUS_LABELS[item.status]} tone={milestoneTone(item.status)} />
      </PillRow>
      <ProgressBar
        percent={item.progressPercent}
        tone={item.progressPercent >= 100 ? 'success' : 'primary'}
        label={`Progress on ${item.name}`}
      />
      <MetaLine icon="calendar-outline">
        {dateRange(item.startDate, item.endDate)} · {item.progressPercent}%
      </MetaLine>
      <MetaLine icon="list-outline">
        {item.tasks.completed} of {item.tasks.total} work items · {item.deliverables.completed} of{' '}
        {item.deliverables.total} deliverables
      </MetaLine>
    </>
  );
}
