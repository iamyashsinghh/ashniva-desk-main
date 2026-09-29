import {
  PRIORITY_LABELS,
  TASK_LIST_VIEW,
  TASK_STATUS_LABELS,
  type TaskSummary,
} from '@ashniva/types';

import { usePagedResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';
import { taskStatusTone } from '../project-display';
import { PagedRows } from './PagedRows';

export function projectTasksKey(projectId: string) {
  return ['tasks', 'project', projectId] as const;
}

/**
 * The project's tasks: the `all` view narrowed to this project, as on the web. The API still
 * decides which of them this person may see.
 */
export function ProjectTasksTab({
  projectId,
  onOpenTask,
}: {
  projectId: string;
  onOpenTask: ((taskId: string) => void) | null;
}) {
  const result = usePagedResource<TaskSummary>(projectTasksKey(projectId), '/tasks', {
    view: TASK_LIST_VIEW.ALL,
    projectId,
  });
  return (
    <PagedRows
      result={result}
      keyOf={(task) => task.id}
      renderRow={(task) => <ProjectTaskRow task={task} onOpen={onOpenTask} />}
      emptyTitle="No tasks in this project yet"
      emptyIcon="checkbox-outline"
      loadingLabel="Loading tasks"
    />
  );
}

function ProjectTaskRow({
  task,
  onOpen,
}: {
  task: TaskSummary;
  onOpen: ((taskId: string) => void) | null;
}) {
  const due = formatDate(task.dueDate);
  return (
    <PressableCard
      accessibilityLabel={`${task.key} ${task.title}`}
      accessibilityHint="Opens the task"
      onPress={() => onOpen?.(task.id)}
      chevron={Boolean(onOpen)}
      icon="checkbox-outline"
      iconTone={task.isOverdue ? 'danger' : 'info'}
    >
      <MetaLine icon="pricetag-outline">
        {task.key} · {PRIORITY_LABELS[task.priority]}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {task.title}
      </AppText>
      <PillRow>
        <Pill label={TASK_STATUS_LABELS[task.status]} tone={taskStatusTone(task.status)} />
        {task.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      <MetaLine icon="person-outline">{task.assignedTo?.name ?? 'Unassigned'}</MetaLine>
      {due ? (
        <MetaLine icon="calendar-outline" danger={task.isOverdue}>
          Due {due}
        </MetaLine>
      ) : null}
    </PressableCard>
  );
}
