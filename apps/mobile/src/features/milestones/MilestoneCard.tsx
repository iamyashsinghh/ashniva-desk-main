import type { MilestoneSummary } from '@ashniva/types';

import { MetaLine, ProgressBar } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import { milestoneStatusLabel, milestoneStatusTone, progressTone } from './milestone-display';

/** One milestone in a list: name, state, how far along, and what it is waiting on. */
export function MilestoneCard({
  milestone,
  onOpen,
}: {
  milestone: MilestoneSummary;
  onOpen: () => void;
}) {
  const due = formatDate(milestone.dueDate);
  return (
    <PressableCard
      onPress={onOpen}
      icon="flag-outline"
      iconTone={milestone.isOverdue ? 'danger' : 'teal'}
      accessibilityLabel={`${milestone.name}, ${milestoneStatusLabel(milestone.status)}, ${
        milestone.progressPercent
      } percent`}
    >
      <AppText weight="medium" numberOfLines={2}>
        {milestone.name}
      </AppText>
      <PillRow>
        <Pill
          label={milestoneStatusLabel(milestone.status)}
          tone={milestoneStatusTone(milestone.status)}
        />
        {milestone.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
        {milestone.clientVisible ? null : <Pill label="Internal" tone="neutral" />}
      </PillRow>
      <ProgressBar
        percent={milestone.progressPercent}
        tone={progressTone(milestone)}
        label={`Progress on ${milestone.name}`}
      />
      <MetaLine icon="checkbox-outline">
        {milestone.progressPercent}% · {milestone.deliverablesDone}/{milestone.deliverableCount}{' '}
        deliverables · {milestone.linkedTasksCompleted}/{milestone.linkedTaskCount} tasks
      </MetaLine>
      {due ? (
        <MetaLine icon="calendar-outline" danger={milestone.isOverdue}>
          Due {due}
          {milestone.owner ? ` · ${milestone.owner.name}` : ''}
        </MetaLine>
      ) : null}
    </PressableCard>
  );
}
