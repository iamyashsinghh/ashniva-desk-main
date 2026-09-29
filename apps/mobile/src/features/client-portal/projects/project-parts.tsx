import {
  CLIENT_VISIBLE_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  PRIORITY_LABELS,
  type PortalClientUpdate,
  type PortalMilestoneSummary,
  type PortalTaskSummary,
} from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine, ProgressBar } from '../../../shared/components/data-display';
import { Icon } from '../../../shared/components/Icon';
import { AppText, Divider, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate, formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { clientStatusTone, milestoneApproval, milestoneTone } from '../portal-display';

/**
 * The rows a portal project is made of: work items, published updates and shared milestones.
 *
 * None of them opens anything. The portal has no task screen — a client sees a work item's
 * client-visible status and nothing behind it, as on the web.
 */

/** Divides rows with a hairline, the way a grouped list does. */
function Rows({ children }: { children: React.ReactNode[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      {children.map((child, index) => (
        <View key={index} style={{ gap: theme.spacing.md }}>
          {index > 0 ? <Divider /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export function PortalTaskList({
  tasks,
  emptyText,
}: {
  tasks: readonly PortalTaskSummary[];
  emptyText: string;
}) {
  const theme = useTheme();
  if (tasks.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        {emptyText}
      </AppText>
    );
  }
  return (
    <Rows>
      {tasks.map((task) => (
        <View key={task.id} style={{ gap: theme.spacing.xs }}>
          <AppText size="xs" tone="faint">
            {task.key} · {PRIORITY_LABELS[task.priority]}
          </AppText>
          <AppText weight="medium">{task.title}</AppText>
          <PillRow>
            <Pill
              label={CLIENT_VISIBLE_STATUS_LABELS[task.status]}
              tone={clientStatusTone(task.status)}
            />
          </PillRow>
          <MetaLine icon="calendar-outline">
            {task.completedAt
              ? `Completed ${formatDate(task.completedAt)}`
              : `Expected ${formatDate(task.dueDate) ?? 'not set'} · updated ${formatSince(task.updatedAt)}`}
          </MetaLine>
        </View>
      ))}
    </Rows>
  );
}

export function UpdateList({
  updates,
  emptyText,
}: {
  updates: readonly PortalClientUpdate[];
  emptyText: string;
}) {
  const theme = useTheme();
  if (updates.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        {emptyText}
      </AppText>
    );
  }
  return (
    <Rows>
      {updates.map((update) => (
        <View key={update.id} style={{ gap: theme.spacing.xs }}>
          <MetaLine icon="calendar-outline">{formatDate(update.workDate)}</MetaLine>
          <AppText weight="medium">{update.title}</AppText>
          <AppText size="sm">{update.body}</AppText>
          {update.task ? <MetaLine icon="pricetag-outline">{update.task.key}</MetaLine> : null}
        </View>
      ))}
    </Rows>
  );
}

export function MilestoneList({ milestones }: { milestones: readonly PortalMilestoneSummary[] }) {
  const theme = useTheme();
  if (milestones.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        No milestones shared yet.
      </AppText>
    );
  }
  return (
    <Rows>
      {milestones.map((milestone) => (
        <View key={milestone.id} style={{ gap: theme.spacing.xs + 2 }}>
          <AppText weight="medium">{milestone.name}</AppText>
          <PillRow>
            <Pill
              label={MILESTONE_STATUS_LABELS[milestone.status]}
              tone={milestoneTone(milestone.status)}
            />
            {milestone.approvalStatus ? <ApprovalPill status={milestone.approvalStatus} /> : null}
          </PillRow>
          <ProgressBar
            percent={milestone.progressPercent}
            tone={milestone.progressPercent >= 100 ? 'success' : 'primary'}
            label={`Progress on ${milestone.name}`}
          />
          <MetaLine icon="flag-outline">
            {milestone.progressPercent}% · due {formatDate(milestone.dueDate) ?? 'not set'}
            {milestone.completedAt ? ` · completed ${formatDate(milestone.completedAt)}` : ''}
          </MetaLine>
          {milestone.description ? (
            <AppText size="sm" tone="muted">
              {milestone.description}
            </AppText>
          ) : null}
          {milestone.deliverables.map((item) => (
            <View
              key={item.id}
              style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
            >
              <Icon
                name={item.isDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={item.isDone ? theme.colors.success : theme.colors.textFaint}
              />
              <AppText size="sm" tone={item.isDone ? 'muted' : 'default'} style={{ flex: 1 }}>
                {item.title}
              </AppText>
            </View>
          ))}
        </View>
      ))}
    </Rows>
  );
}

function ApprovalPill({ status }: { status: string }) {
  const approval = milestoneApproval(status);
  return <Pill label={`Approval: ${approval.label}`} tone={approval.tone} />;
}
