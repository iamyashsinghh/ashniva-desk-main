import {
  MILESTONE_PROGRESS_MODE,
  MILESTONE_STATUS_LABELS,
  PROJECT_PLAN_ITEM_KIND,
  PROJECT_PROGRESS_BASIS,
  type ProjectPlan,
  type ProjectPlanItem,
} from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { MetaLine, ProgressBar, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Card, Pill, PillRow } from '../../../shared/components/primitives';
import { QueryState } from '../../../shared/components/states';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { milestoneTone } from '../project-display';

export function projectPlanKey(projectId: string) {
  return ['projects', projectId, 'plan'] as const;
}

/**
 * The plan: milestones and the work under them, with dates and progress.
 *
 * Its own request, made only while this tab is open — the plan reads milestones and grouped task
 * counts the project detail does not carry. Every number is the API's; none is recomputed here.
 */
export function ProjectPlanTab({
  projectId,
  onOpenMilestone,
  onAddMilestone,
}: {
  projectId: string;
  onOpenMilestone?: (milestoneId: string) => void;
  /** Present only for somebody who may create milestones. */
  onAddMilestone?: () => void;
}) {
  const theme = useTheme();
  const query = useResource<ProjectPlan>(projectPlanKey(projectId), `/projects/${projectId}/plan`);
  const plan = query.data;

  return (
    <QueryState
      isLoading={query.isLoading}
      error={plan ? null : query.error}
      onRetry={() => void query.refetch()}
      loadingLabel="Loading the plan"
    >
      {plan ? (
        <View style={{ gap: theme.spacing.md }}>
          <TileGrid>
            <StatTile label="Progress" value={`${plan.progress.percent}%`} tone="primary" />
            <StatTile
              label="Tasks done"
              value={`${plan.progress.taskCompleted}/${plan.progress.taskTotal}`}
              caption="Cancelled work is not counted"
            />
            <StatTile
              label="Milestones"
              value={`${plan.progress.milestoneCompleted}/${plan.progress.milestoneTotal}`}
            />
            <StatTile
              label="Deliverables"
              value={`${plan.progress.deliverableCompleted}/${plan.progress.deliverableTotal}`}
            />
          </TileGrid>
          <Section title="Timeline" icon="calendar-outline">
            <AppText size="sm" tone="muted">
              {plan.progress.basis === PROJECT_PROGRESS_BASIS.TASKS
                ? `${plan.progress.percent}% is completed tasks over tasks that are not cancelled.`
                : 'No task to count yet, so progress reads 0%. What is planned is still shown.'}
            </AppText>
            <MetaLine icon="calendar-outline">
              {formatDate(plan.window.startDate) ?? 'No start'} →{' '}
              {formatDate(plan.window.endDate) ?? 'no end'}
            </MetaLine>
          </Section>
          {onAddMilestone ? (
            <Button
              label="Add milestone"
              icon="add"
              variant="secondary"
              size="sm"
              onPress={onAddMilestone}
            />
          ) : null}
          {plan.items.length === 0 ? (
            <Card>
              <AppText weight="medium">Nothing on the plan yet</AppText>
              <AppText size="sm" tone="muted">
                Add a milestone, or give the project’s tasks dates, and they appear here.
              </AppText>
            </Card>
          ) : (
            plan.items.map((item) =>
              item.kind === PROJECT_PLAN_ITEM_KIND.UNGROUPED || !onOpenMilestone ? (
                <PlanItemCard key={item.id} item={item} />
              ) : (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open milestone ${item.name}`}
                  onPress={() => onOpenMilestone(item.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <PlanItemCard item={item} />
                </Pressable>
              ),
            )
          )}
        </View>
      ) : null}
    </QueryState>
  );
}

function PlanItemCard({ item }: { item: ProjectPlanItem }) {
  const theme = useTheme();
  const ungrouped = item.kind === PROJECT_PLAN_ITEM_KIND.UNGROUPED;
  const facts = [
    `${item.tasks.completed}/${item.tasks.total} tasks`,
    item.deliverables.total > 0
      ? `${item.deliverables.completed}/${item.deliverables.total} deliverables`
      : null,
    item.owner?.name ?? null,
  ].filter(Boolean);

  return (
    <Card>
      <AppText weight="medium">{ungrouped ? 'Work outside any milestone' : item.name}</AppText>
      <PillRow>
        {item.status ? (
          <Pill label={MILESTONE_STATUS_LABELS[item.status]} tone={milestoneTone(item.status)} />
        ) : null}
        {ungrouped ? null : (
          <Pill
            label={item.clientVisible ? 'Client' : 'Internal'}
            tone={item.clientVisible ? 'success' : 'neutral'}
          />
        )}
        {item.progressMode === MILESTONE_PROGRESS_MODE.MANUAL ? (
          <Pill label="Manual progress" tone="warning" />
        ) : null}
        {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      <View style={{ gap: theme.spacing.xs }}>
        <ProgressBar
          percent={item.progressPercent}
          tone={item.progressPercent >= 100 ? 'success' : 'primary'}
          label={`${item.name} progress`}
        />
        <MetaLine icon="calendar-outline" danger={item.isOverdue}>
          {formatDate(item.startDate) ?? 'No start'} → {formatDate(item.endDate) ?? 'no end'}
          {item.datesFromTasks ? ' · from the work' : ''}
        </MetaLine>
        <MetaLine icon="trending-up">
          {item.progressPercent}% · {facts.join(' · ')}
        </MetaLine>
      </View>
    </Card>
  );
}
