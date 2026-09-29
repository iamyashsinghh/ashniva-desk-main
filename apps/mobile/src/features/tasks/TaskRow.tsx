import { PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskSummary } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { Icon } from '../../shared/components/Icon';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { taskTone } from './task-display';
import { TaskTimingPill } from './TaskTimingPill';

/** One task in a list: key and project, priority, title, states, and when it starts or is due. */
export function TaskRow({
  task,
  onOpen,
  showAssignee = false,
}: {
  task: TaskSummary;
  onOpen: (taskId: string) => void;
  /** On for views of other people's work, where "whose is this" is the first question. */
  showAssignee?: boolean;
}) {
  const theme = useTheme();
  const priorityColor = theme.priority[task.priority];
  return (
    <PressableCard
      accessibilityLabel={`${task.key} ${task.title}`}
      accessibilityHint="Opens the task"
      onPress={() => onOpen(task.id)}
      highlight={task.isOverdue}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 4 }}>
          <Icon name="folder-outline" size={12} color={theme.colors.textFaint} />
          <AppText size="xs" tone="faint" numberOfLines={1} style={{ flexShrink: 1 }}>
            {task.key} · {task.project.name}
          </AppText>
        </View>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 3 }}>
          <Icon name="flag" size={12} color={priorityColor} />
          <AppText size="xs" weight="medium" style={{ color: priorityColor }}>
            {PRIORITY_LABELS[task.priority]}
          </AppText>
        </View>
      </View>
      <AppText weight="medium" numberOfLines={2}>
        {task.title}
      </AppText>
      <PillRow>
        <Pill label={TASK_STATUS_LABELS[task.status]} tone={taskTone(task.status)} />
        {/*
          On time or late, from the server's own verdict. `isOverdue` below is a different
          question — it compares the calendar due *date* and is what the list views filter on —
          so both are shown rather than one standing in for the other.
        */}
        <TaskTimingPill timing={task.timing} />
        {task.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      {showAssignee ? (
        <MetaLine icon="person-outline">{task.assignedTo?.name ?? 'Unassigned'}</MetaLine>
      ) : null}
      {task.isUpcoming && task.scheduledStartAt ? (
        <MetaLine icon="play-circle-outline">
          Starts {formatDateTime(task.scheduledStartAt)}
        </MetaLine>
      ) : null}
      {!task.isUpcoming && task.dueAt ? (
        <MetaLine icon="alarm-outline" danger={task.isOverdue}>
          Due {formatDateTime(task.dueAt)}
        </MetaLine>
      ) : null}
    </PressableCard>
  );
}
