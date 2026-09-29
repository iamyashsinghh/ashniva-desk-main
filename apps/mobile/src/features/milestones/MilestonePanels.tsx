import {
  MILESTONE_PROGRESS_MODE,
  MILESTONE_STATUS,
  type MilestoneDetail,
  type MilestoneRef,
} from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, ListRow, ProgressBar } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText } from '../../shared/components/primitives';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ToggleRow } from '../tasks/ToggleRow';
import { historyLine, progressTone } from './milestone-display';

export function ProgressPanel({ milestone }: { milestone: MilestoneDetail }) {
  return (
    <Section title="Progress" icon="stats-chart-outline">
      <AppText size="sm" tone="muted">
        {milestone.progressPercent}% ·{' '}
        {milestone.progressMode === MILESTONE_PROGRESS_MODE.MANUAL
          ? 'Set manually'
          : 'From deliverables and tasks'}
      </AppText>
      <ProgressBar
        percent={milestone.progressPercent}
        tone={progressTone(milestone)}
        label={`Progress on ${milestone.name}`}
      />
      {milestone.description ? <AppText>{milestone.description}</AppText> : null}
    </Section>
  );
}

/**
 * Ticking a deliverable is `task:work`, not `milestone:manage` — the people doing the work mark
 * what they delivered — and a completed milestone's list is frozen, as on the web.
 */
export function DeliverablesPanel({
  milestone,
  canWork,
  busyId,
  onToggle,
}: {
  milestone: MilestoneDetail;
  canWork: boolean;
  busyId: string | null;
  onToggle: (deliverableId: string, isDone: boolean) => void;
}) {
  const locked = !canWork || milestone.status === MILESTONE_STATUS.COMPLETED;
  return (
    <Section title="Deliverables" icon="checkbox-outline" count={milestone.deliverables.length}>
      {milestone.deliverables.length === 0 ? (
        <AppText tone="muted">No deliverables listed.</AppText>
      ) : (
        milestone.deliverables.map((item) => (
          <ToggleRow
            key={item.id}
            label={item.title}
            description={
              item.isDone ? `Done ${formatDate(item.doneAt) ?? ''}`.trim() : 'Not done yet'
            }
            icon={item.isDone ? 'checkmark-circle-outline' : 'ellipse-outline'}
            value={item.isDone}
            disabled={locked || busyId !== null}
            onChange={(isDone) => onToggle(item.id, isDone)}
          />
        ))
      )}
    </Section>
  );
}

export function LinkedTasksPanel({
  milestone,
  onOpenTask,
}: {
  milestone: MilestoneDetail;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <Section title="Linked tasks" icon="list-outline" count={milestone.linkedTasks.length}>
      {milestone.linkedTasks.length === 0 ? (
        <AppText tone="muted">
          No tasks linked. Set the milestone when creating or editing a task.
        </AppText>
      ) : (
        milestone.linkedTasks.map((task) => (
          <ListRow
            key={task.id}
            title={`${task.key} ${task.title}`}
            subtitle={task.status}
            icon="checkbox-outline"
            iconTone="info"
            onPress={() => onOpenTask(task.id)}
            accessibilityLabel={`Open task ${task.key} ${task.title}`}
          />
        ))
      )}
    </Section>
  );
}

export function HistoryPanel({ milestone }: { milestone: MilestoneDetail }) {
  const theme = useTheme();
  return (
    <Section title="History" icon="time-outline" count={milestone.history.length} collapsible>
      {milestone.history.map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.xs }}>
          <AppText size="sm">{historyLine(entry)}</AppText>
          <AppText size="xs" tone="muted">
            {formatDateTime(entry.createdAt)} · {entry.changedBy.name}
          </AppText>
        </View>
      ))}
    </Section>
  );
}

export interface MilestoneLinks {
  onOpenProject: (projectId: string) => void;
  onOpenContract: (contractId: string) => void;
  onOpenChangeRequest: (changeRequestId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
}

function MilestoneRefs({
  label,
  refs,
  onOpen,
}: {
  label: string;
  refs: readonly MilestoneRef[];
  onOpen: (milestoneId: string) => void;
}) {
  if (refs.length === 0) {
    return <KeyValueRow label={label} value="—" />;
  }
  return (
    <>
      {refs.map((ref) => (
        <ListRow
          key={ref.id}
          title={ref.name}
          subtitle={label}
          icon="flag-outline"
          iconTone="violet"
          onPress={() => onOpen(ref.id)}
          accessibilityLabel={`${label}: open milestone ${ref.name}`}
        />
      ))}
    </>
  );
}

export function DetailsPanel({
  milestone,
  links,
}: {
  milestone: MilestoneDetail;
  links: MilestoneLinks;
}) {
  const { project, contract, changeRequest } = milestone;
  return (
    <Section title="Details" icon="information-circle-outline">
      <ListRow
        title={project.name}
        subtitle="Project"
        icon="folder-open-outline"
        iconTone="teal"
        onPress={() => links.onOpenProject(project.id)}
        accessibilityLabel={`Open project ${project.name}`}
      />
      {contract ? (
        <ListRow
          title={`${contract.number} ${contract.title}`}
          subtitle="Contract"
          icon="document-text-outline"
          iconTone="info"
          onPress={() => links.onOpenContract(contract.id)}
          accessibilityLabel={`Open contract ${contract.number}`}
        />
      ) : (
        <KeyValueRow label="Contract" value="—" />
      )}
      {changeRequest ? (
        <ListRow
          title={`${changeRequest.number} ${changeRequest.title}`}
          subtitle="Change request"
          icon="git-pull-request-outline"
          iconTone="violet"
          onPress={() => links.onOpenChangeRequest(changeRequest.id)}
          accessibilityLabel={`Open change request ${changeRequest.number}`}
        />
      ) : null}
      <KeyValueRow label="Owner" value={milestone.owner?.name ?? '—'} />
      <KeyValueRow
        label="Dates"
        value={`${formatDate(milestone.startDate) ?? '—'} → ${formatDate(milestone.dueDate) ?? '—'}`}
      />
      <MilestoneRefs label="Depends on" refs={milestone.dependsOn} onOpen={links.onOpenMilestone} />
      <MilestoneRefs label="Unblocks" refs={milestone.dependents} onOpen={links.onOpenMilestone} />
      <KeyValueRow label="Completed" value={formatDate(milestone.completedAt) ?? '—'} />
    </Section>
  );
}
