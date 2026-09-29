import {
  CONVERSATION_KIND,
  PERMISSIONS,
  TASK_ACTION,
  isTaskClosed,
  type TaskDetail,
} from '@ashniva/types';
import { ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { OpenConversationButton } from '../chat/OpenConversationButton';
import { TaskActions } from './TaskActions';
import { TaskAttachments } from './TaskAttachments';
import { TaskDetailsCard } from './TaskDetailsCard';
import { TaskHistory } from './TaskHistory';
import { TaskDescription, TaskHero } from './TaskOverview';
import { TaskSteps } from './TaskSteps';
import { TaskWorkLog } from './TaskWorkLog';
import { TaskComments } from './task-comments/TaskComments';
import { actionState } from './task-display';
import { PullRefresh } from '../../shared/components/PullRefresh';

/**
 * One task.
 *
 * The screen answers, in order, the questions somebody away from their desk has: what is this and
 * where does it stand, what can I do now, what is it about, and what has happened on it. What can
 * be done comes before what has been done: it is why somebody opened this.
 *
 * Every control follows the API: `task.actions` for the task's own actions, the session's
 * permissions for the two that are not task actions (sending to testing, internal notes). Hiding
 * is a courtesy — the API refuses regardless.
 */
export function TaskDetailScreen({
  taskId,
  onComplete,
  onOpenChat,
  onEdit,
}: {
  taskId: string;
  onComplete: (taskId: string) => void;
  /** Null when this person has no internal chat — a client, or a role without the permission. */
  onOpenChat: ((conversationId: string) => void) | null;
  /** Opens the edit form; offered when the API enables `edit` for this person. */
  onEdit?: (taskId: string) => void;
}) {
  const theme = useTheme();
  const { can, user } = useSession();
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

  const canInternal = can(PERMISSIONS.COMMENT_INTERNAL);
  const canLog = actionState(task.actions, TASK_ACTION.LOG_WORK).enabled;
  const canEdit = actionState(task.actions, TASK_ACTION.EDIT).enabled;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <TaskHero task={task} />
        <TaskSteps status={task.status} />

        {task.blockedReason ? (
          <Banner tone="danger" title="Blocked">
            {task.blockedReason}
          </Banner>
        ) : null}

        <TaskActions
          task={task}
          onSubmit={() => onComplete(task.id)}
          onChanged={refresh}
          {...(onEdit ? { onEdit } : {})}
          canSendToTesting={can(PERMISSIONS.QA_ASSIGN) && !isTaskClosed(task.status)}
        />

        <TaskDescription task={task} />
        <TaskDetailsCard task={task} />

        <TaskComments
          task={task}
          canInternal={canInternal}
          viewerId={user?.id ?? null}
          onPosted={refresh}
        />

        <TaskWorkLog taskId={task.id} workLogs={task.workLogs} canLog={canLog} onLogged={refresh} />

        {/*
          A client can only ever see client files, so choosing is for staff on a task that has a
          client at all; an intern task never reaches one.
        */}
        <TaskAttachments
          taskId={task.id}
          files={task.files}
          onUploaded={refresh}
          canUpload={canLog || canEdit}
          chooseVisibility={canInternal && Boolean(task.clientOrganization) && !task.isInternTask}
        />

        <TaskHistory history={task.history} />

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
