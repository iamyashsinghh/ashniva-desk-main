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
import { Avatar } from '../../shared/components/Avatar';
import { KeyValueRow, ProgressBar } from '../../shared/components/data-display';
import { Expandable } from '../../shared/components/Expandable';
import { Banner } from '../../shared/components/feedback';
import { Hero, Section, SectionHeader } from '../../shared/components/layout';
import { AppText, Card, Divider, Pill, PillRow, Screen } from '../../shared/components/primitives';
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
  const effortPercent = task.estimateMinutes
    ? Math.round((task.loggedMinutes / task.estimateMinutes) * 100)
    : null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero overline={`${task.key} · ${task.project.code}`} title={task.title}>
          <PillRow>
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
          </PillRow>
        </Hero>

        {scheduledStart || due ? (
          <Card style={{ gap: theme.spacing.xs }}>
            {scheduledStart ? (
              <KeyValueRow
                label="Starts"
                value={`${scheduledStart}${task.isUpcoming ? ' — not yet workable' : ''}`}
              />
            ) : null}
            {due ? <KeyValueRow label="Due" value={due} /> : null}
            {/*
              How late, in words, from the server's `delayMinutes`. One interpolated string rather
              than two children so a screen reader reads it as a sentence. The minutes are
              formatted by this app's own `formatMinutes` — the verdict is shared, the wording is
              native.
            */}
            {task.timing.delayMinutes !== null ? (
              <AppText size="sm" tone="danger" weight="medium">
                {`${formatMinutes(task.timing.delayMinutes)} past the expected time`}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {task.blockedReason ? (
          <Banner tone="danger" title="Blocked">
            {task.blockedReason}
          </Banner>
        ) : null}

        {/* What can be done comes before what has been done: it is why somebody opened this. */}
        <TaskActions task={task} onSubmit={() => onComplete(task.id)} onChanged={refresh} />

        {task.description || task.acceptanceCriteria ? (
          <Section>
            {task.description ? (
              <View style={{ gap: theme.spacing.xs }}>
                <SectionHeader title="Description" />
                <AppText>{task.description}</AppText>
              </View>
            ) : null}
            {task.description && task.acceptanceCriteria ? <Divider /> : null}
            {task.acceptanceCriteria ? (
              <View style={{ gap: theme.spacing.xs }}>
                <SectionHeader title="What counts as done" />
                <AppText>{task.acceptanceCriteria}</AppText>
              </View>
            ) : null}
          </Section>
        ) : null}

        <Section title="Effort">
          <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: theme.spacing.xs }}>
            <AppText variant="heading" tabular>
              {formatMinutes(task.loggedMinutes)}
            </AppText>
            {task.estimateMinutes ? (
              <AppText size="sm" tone="muted">
                {` of ${formatMinutes(task.estimateMinutes)} estimated`}
              </AppText>
            ) : null}
          </View>
          {effortPercent !== null ? (
            <ProgressBar
              percent={effortPercent}
              tone={effortPercent > 100 ? 'danger' : 'primary'}
              label="Time logged against the estimate"
            />
          ) : null}
        </Section>

        <TaskWorkLog
          taskId={task.id}
          workLogs={task.workLogs}
          canLog={actionState(task.actions, TASK_ACTION.LOG_WORK).enabled}
          onLogged={refresh}
        />

        <TaskAttachments taskId={task.id} files={task.files} onUploaded={refresh} />

        {task.comments.length > 0 ? (
          <Section title="Comments" count={task.comments.length}>
            <Expandable items={task.comments} initial={5} noun="comments">
              {(comment, index) => (
                <View key={comment.id} style={{ gap: theme.spacing.xs }}>
                  {index > 0 ? <Divider /> : null}
                  <View
                    style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
                  >
                    <Avatar name={comment.author.name} size={24} />
                    <AppText size="xs" tone="faint">
                      {comment.author.name}
                      {comment.visibility === VISIBILITY.INTERNAL
                        ? ' · internal'
                        : ' · the client sees this'}
                    </AppText>
                  </View>
                  <AppText size="sm">{comment.body}</AppText>
                </View>
              )}
            </Expandable>
          </Section>
        ) : null}

        {task.history.length > 0 ? (
          <Section title="History" count={task.history.length} collapsible initiallyOpen={false}>
            <Expandable items={task.history} initial={10} noun="changes">
              {(entry, index) => (
                <View key={entry.id} style={{ gap: 2 }}>
                  {index > 0 ? <Divider /> : null}
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
              )}
            </Expandable>
          </Section>
        ) : null}

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
