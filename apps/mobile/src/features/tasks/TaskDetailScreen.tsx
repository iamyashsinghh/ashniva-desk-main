import {
  CONVERSATION_KIND,
  TASK_ACTION,
  TASK_STATUS_LABELS,
  VISIBILITY,
  type TaskDetail,
} from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Divider, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime, formatMinutes } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { OpenConversationButton } from '../chat/OpenConversationButton';
import { TaskActions } from './TaskActions';
import { TaskAttachments } from './TaskAttachments';
import { TaskWorkLog } from './TaskWorkLog';
import { actionState, taskTone } from './task-display';
import { TaskTimingPill } from './TaskTimingPill';

/**
 * One task.
 *
 * The screen answers, in order, four questions somebody standing away from their desk actually
 * has: what is this, when is it meant to happen, what has been done, and what can I do now. The
 * scheduled start is on the card rather than only in the queue, because "why can I not start
 * this" is the question a task with one produces.
 *
 * The doing is split out — `TaskActions`, `TaskWorkLog`, `TaskAttachments` — so each stays small
 * enough to read, and so the one that decides what a person may do is a file of its own.
 */
export function TaskDetailScreen({
  taskId,
  onComplete,
  onOpenChat,
}: {
  taskId: string;
  onComplete: (taskId: string) => void;
  /** Null when this person has no internal chat — a client, or a role without the permission. */
  onOpenChat: ((conversationId: string) => void) | null;
}) {
  const theme = useTheme();
  const query = useResource<TaskDetail>(['tasks', taskId], `/tasks/${taskId}`);
  const task = query.data ?? null;
  const refresh = () => void query.refetch();

  if (!task && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }
  if (!task) {
    return (
      <Screen>
        <LoadingState label="Loading the task" />
      </Screen>
    );
  }

  const scheduledStart = formatDateTime(task.scheduledStartAt);
  const due = formatDateTime(task.dueAt);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Card>
          <AppText size="xs" tone="faint">
            {task.key} · {task.project.code}
          </AppText>
          <AppText size="lg" weight="bold">
            {task.title}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Pill label={TASK_STATUS_LABELS[task.status]} tone={taskTone(task.status)} />
            {/*
              The same verdict the list row shows, so opening a task never changes the answer.
              `isOverdue` below asks a different question — the calendar due date, which is what the
              list views filter on — so both appear rather than one standing in for the other.
            */}
            <TaskTimingPill timing={task.timing} />
            {task.isUpcoming ? <Pill label="Starts later" tone="info" /> : null}
            {task.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            {task.clientVisible ? <Pill label="Client sees this" tone="info" /> : null}
          </View>
        </Card>

        {scheduledStart || due ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              When
            </AppText>
            {scheduledStart ? (
              <AppText size="sm">
                Starts {scheduledStart}
                {task.isUpcoming ? ' — not yet workable' : ''}
              </AppText>
            ) : null}
            {due ? <AppText size="sm">Due {due}</AppText> : null}
            {/*
              How late, in words, from the server's `delayMinutes`. One interpolated string rather
              than two children so a screen reader reads it as a sentence. The minutes are
              formatted by this app's own `formatMinutes` — the verdict is shared, the wording is
              native.
            */}
            {task.timing.delayMinutes !== null ? (
              <AppText size="sm" tone="danger">
                {`${formatMinutes(task.timing.delayMinutes)} past the expected time`}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {task.description ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Description
            </AppText>
            <AppText>{task.description}</AppText>
          </Card>
        ) : null}

        {task.acceptanceCriteria ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              What counts as done
            </AppText>
            <AppText>{task.acceptanceCriteria}</AppText>
          </Card>
        ) : null}

        {task.blockedReason ? (
          <Card>
            <AppText tone="danger" weight="medium">
              Blocked
            </AppText>
            <AppText>{task.blockedReason}</AppText>
          </Card>
        ) : null}

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Effort
          </AppText>
          <AppText>
            {formatMinutes(task.loggedMinutes)}
            {task.estimateMinutes ? ` of ${formatMinutes(task.estimateMinutes)} estimated` : ''}
          </AppText>
        </Card>

        <TaskWorkLog
          taskId={task.id}
          workLogs={task.workLogs}
          canLog={actionState(task.actions, TASK_ACTION.LOG_WORK).enabled}
          onLogged={refresh}
        />

        <TaskAttachments taskId={task.id} files={task.files} onUploaded={refresh} />

        {task.comments.length > 0 ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Comments
            </AppText>
            {task.comments.slice(0, 5).map((comment) => (
              <View key={comment.id} style={{ gap: theme.spacing.xs }}>
                <Divider />
                <AppText size="xs" tone="faint">
                  {comment.author.name}
                  {comment.visibility === VISIBILITY.INTERNAL
                    ? ' · internal'
                    : ' · the client sees this'}
                </AppText>
                <AppText size="sm">{comment.body}</AppText>
              </View>
            ))}
          </Card>
        ) : null}

        {task.history.length > 0 ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              History
            </AppText>
            {task.history.slice(0, 10).map((entry) => (
              <View key={entry.id} style={{ gap: theme.spacing.xs }}>
                <Divider />
                <AppText size="xs" tone="faint">
                  {formatDateTime(entry.createdAt)} · {entry.changedBy.name}
                </AppText>
                <AppText size="sm">
                  {entry.fromStatus ? `${TASK_STATUS_LABELS[entry.fromStatus]} → ` : ''}
                  {TASK_STATUS_LABELS[entry.toStatus]}
                </AppText>
                {entry.note ? (
                  <AppText size="xs" tone="muted">
                    {entry.note}
                  </AppText>
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}

        <TaskActions task={task} onSubmit={() => onComplete(task.id)} onChanged={refresh} />

        {onOpenChat ? (
          <OpenConversationButton
            anchor={{ kind: CONVERSATION_KIND.TASK, taskId: task.id }}
            label="Discuss this task"
            hint="Opens the internal conversation about this task"
            onOpened={onOpenChat}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
