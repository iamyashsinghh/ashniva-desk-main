import { PRIORITY_LABELS, type TaskDetail } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, ProgressBar } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate, formatDateTime, formatMinutes } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

const CLIENT_UPDATE_LABELS = {
  PUBLISHED: 'Published',
  PENDING: 'Waiting to publish',
  WITHDRAWN: 'Withdrawn',
} as const;

/** What the client will hear about this task, in the web app's words. */
function describeClientUpdate(task: TaskDetail): string {
  if (task.clientUpdate) {
    return CLIENT_UPDATE_LABELS[task.clientUpdate.status];
  }
  return task.clientVisible ? 'Created when the task is approved' : 'Hidden from the client';
}

/**
 * The task's facts: where it belongs, who is on it, when it happens and how much time it has
 * taken. Rows with nothing to say are left out rather than drawn as dashes, except the people —
 * "no reviewer named" is itself worth knowing.
 */
export function TaskDetailsCard({ task }: { task: TaskDetail }) {
  const theme = useTheme();
  const scheduledStart = formatDateTime(task.scheduledStartAt);
  const dueAt = formatDateTime(task.dueAt);
  const dueDate = formatDate(task.dueDate);
  const effortPercent = task.estimateMinutes
    ? Math.round((task.loggedMinutes / task.estimateMinutes) * 100)
    : null;

  return (
    <Section title="Details" icon="information-circle-outline" style={{ gap: theme.spacing.xs }}>
      <KeyValueRow
        label="Project"
        value={
          task.clientOrganization
            ? `${task.project.name} · ${task.clientOrganization.name}`
            : task.project.name
        }
      />
      <KeyValueRow label="Category" value={task.category?.name ?? 'Development'} />
      {task.module ? <KeyValueRow label="Module" value={task.module} /> : null}
      {task.ticket ? <KeyValueRow label="From ticket" value={`T-${task.ticket.number}`} /> : null}
      {task.milestone ? <KeyValueRow label="Milestone" value={task.milestone.name} /> : null}
      <KeyValueRow label="Priority" value={PRIORITY_LABELS[task.priority]} />

      <Divider />
      <KeyValueRow label="Created by" value={task.createdBy.name} />
      <KeyValueRow label="Assignee" value={task.assignedTo?.name ?? 'Unassigned'} />
      <KeyValueRow label="Reviewer" value={task.reviewer?.name ?? 'Nobody named'} />
      <KeyValueRow label="Tester" value={task.tester?.name ?? 'Nobody named'} />

      {scheduledStart || dueAt || dueDate ? <Divider /> : null}
      {scheduledStart ? (
        <KeyValueRow
          label="Starts"
          value={`${scheduledStart}${task.isUpcoming ? ' — not yet workable' : ''}`}
        />
      ) : null}
      {dueDate ? (
        <KeyValueRow
          label="Due date"
          value={dueDate}
          {...(task.isOverdue ? { tone: 'danger' } : {})}
        />
      ) : null}
      {dueAt ? <KeyValueRow label="Expected completion" value={dueAt} /> : null}
      {/*
        How late, in words, from the server's `delayMinutes`. One interpolated string rather than
        two children so a screen reader reads it as a sentence.
      */}
      {task.timing.delayMinutes !== null ? (
        <AppText size="sm" tone="danger" weight="medium">
          {`${formatMinutes(task.timing.delayMinutes)} past the expected time`}
        </AppText>
      ) : null}

      <Divider />
      <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: theme.spacing.xs }}>
        <AppText variant="heading" tabular>
          {formatMinutes(task.loggedMinutes)}
        </AppText>
        <AppText size="sm" tone="muted">
          {task.estimateMinutes
            ? ` logged of ${formatMinutes(task.estimateMinutes)} estimated`
            : ' logged · no estimate'}
        </AppText>
      </View>
      {effortPercent !== null ? (
        <ProgressBar
          percent={effortPercent}
          tone={effortPercent > 100 ? 'danger' : 'primary'}
          label="Time logged against the estimate"
        />
      ) : null}

      {task.workAreas.length > 0 ? (
        <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
          <AppText size="sm" tone="muted">
            Work areas
          </AppText>
          <PillRow>
            {task.workAreas.map((area) => (
              <Pill key={area} label={area} tone="info" />
            ))}
          </PillRow>
        </View>
      ) : null}
      <KeyValueRow label="Client update" value={describeClientUpdate(task)} />
    </Section>
  );
}
