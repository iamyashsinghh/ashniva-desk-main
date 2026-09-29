import type { ChangeRequestDetail } from '@ashniva/types';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { KeyValueRow, ListRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Pill } from '../../shared/components/primitives';
import { EmptyState } from '../../shared/components/states';
import { formatDate, formatDateTime, formatMinutes } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { changeRequestStatusLabel, formatCost } from './change-request-display';

/** The request as written: what, why, scope and impact. Both sides read this. */
export function RequestOverview({ cr }: { cr: ChangeRequestDetail }) {
  return (
    <Section title="The request" icon="reader-outline">
      <Pill label="Client-visible" tone="success" />
      <AppText>{cr.description}</AppText>
      <KeyValueRow label="Business reason" value={cr.businessReason ?? '—'} />
      <KeyValueRow label="Scope" value={cr.scope ?? '—'} />
      <KeyValueRow label="Impact" value={cr.impact ?? '—'} />
      {cr.decisionNote ? (
        <AppText size="sm" tone="muted">
          Decision note: {cr.decisionNote}
        </AppText>
      ) : null}
    </Section>
  );
}

/** Effort, cost and timeline — the numbers the client is asked to approve. */
export function RequestImpact({ cr, action }: { cr: ChangeRequestDetail; action?: ReactNode }) {
  const empty =
    cr.estimatedMinutes === null && cr.costImpact === null && cr.timelineImpactDays === null;
  const days = cr.timelineImpactDays;
  return (
    <Section title="Estimate and impact" icon="calculator-outline" action={action}>
      {empty ? (
        <EmptyState
          title="Not estimated yet"
          description="The provider adds effort, cost and timeline impact during internal review."
          icon="calculator-outline"
        />
      ) : (
        <>
          <KeyValueRow
            label="Effort"
            value={cr.estimatedMinutes !== null ? formatMinutes(cr.estimatedMinutes) : '—'}
          />
          <KeyValueRow label="Cost impact" value={formatCost(cr.costImpact, cr.currency)} />
          <KeyValueRow
            label="Timeline impact"
            value={days !== null ? `${days} day${days === 1 ? '' : 's'}` : '—'}
          />
          <KeyValueRow label="Scheduled for" value={formatDate(cr.scheduledFor) ?? '—'} />
        </>
      )}
    </Section>
  );
}

/** Tasks and milestones created from the approved change. Hidden until there are some. */
export function LinkedWork({
  cr,
  onOpenTask,
  onOpenMilestone,
}: {
  cr: ChangeRequestDetail;
  onOpenTask: (taskId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
}) {
  if (cr.linkedTasks.length === 0 && cr.milestones.length === 0) {
    return null;
  }
  return (
    <Section
      title="Work created from this change"
      icon="git-branch-outline"
      count={cr.linkedTasks.length + cr.milestones.length}
    >
      {cr.milestones.map((milestone) => (
        <ListRow
          key={milestone.id}
          title={milestone.name}
          subtitle="Milestone"
          icon="flag-outline"
          iconTone="violet"
          onPress={() => onOpenMilestone(milestone.id)}
          accessibilityLabel={`Open milestone ${milestone.name}`}
        />
      ))}
      {cr.linkedTasks.map((task) => (
        <ListRow
          key={task.id}
          title={`${task.key} ${task.title}`}
          subtitle={task.status}
          icon="checkbox-outline"
          iconTone="info"
          onPress={() => onOpenTask(task.id)}
          accessibilityLabel={`Open task ${task.key} ${task.title}`}
        />
      ))}
    </Section>
  );
}

export function RequestHistory({ cr }: { cr: ChangeRequestDetail }) {
  const theme = useTheme();
  return (
    <Section title="History" icon="time-outline" count={cr.history.length} collapsible>
      {cr.history.length === 0 ? (
        <AppText tone="muted">No history yet.</AppText>
      ) : (
        cr.history.map((entry) => (
          <View key={entry.id} style={{ gap: theme.spacing.xs }}>
            <AppText weight="medium">{changeRequestStatusLabel(entry.toStatus)}</AppText>
            <AppText size="sm" tone="muted">
              {formatDateTime(entry.createdAt)} · {entry.changedBy.name}
              {entry.note ? ` · “${entry.note}”` : ''}
            </AppText>
          </View>
        ))
      )}
    </Section>
  );
}

export function RequestDetails({
  cr,
  onOpenProject,
  onOpenContract,
}: {
  cr: ChangeRequestDetail;
  onOpenProject: (projectId: string) => void;
  onOpenContract: (contractId: string) => void;
}) {
  const { project, contract } = cr;
  return (
    <Section title="Details" icon="information-circle-outline">
      <KeyValueRow label="Number" value={cr.number} />
      <KeyValueRow label="Client" value={cr.clientOrganization.name} />
      {project ? (
        <ListRow
          title={project.name}
          subtitle="Project"
          icon="folder-open-outline"
          iconTone="teal"
          onPress={() => onOpenProject(project.id)}
          accessibilityLabel={`Open project ${project.name}`}
        />
      ) : (
        <KeyValueRow label="Project" value="—" />
      )}
      {contract ? (
        <ListRow
          title={`${contract.number} ${contract.title}`}
          subtitle="Contract"
          icon="document-text-outline"
          iconTone="info"
          onPress={() => onOpenContract(contract.id)}
          accessibilityLabel={`Open contract ${contract.number}`}
        />
      ) : (
        <KeyValueRow label="Contract" value="—" />
      )}
      <KeyValueRow label="Requested by" value={cr.requestedBy.name} />
      <KeyValueRow label="Raised by" value={cr.createdBy.name} />
      <KeyValueRow label="Submitted" value={formatDateTime(cr.submittedAt) ?? '—'} />
      <KeyValueRow label="Approved" value={formatDateTime(cr.approvedAt) ?? '—'} />
      <KeyValueRow label="Completed" value={formatDateTime(cr.completedAt) ?? '—'} />
      <KeyValueRow label="Linked tasks" value={String(cr.linkedTaskCount)} />
    </Section>
  );
}
