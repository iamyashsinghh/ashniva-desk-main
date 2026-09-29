import { TASK_ACTION, type TaskDetail } from '@ashniva/types';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { MetaLine } from '../../shared/components/data-display';
import { Banner, SuccessNote } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { AssignSheet } from './task-actions/AssignSheet';
import { planTaskActions, type ActionKey, type PlannedAction } from './task-actions/action-plan';
import { LogTimeSheet } from './task-actions/LogTimeSheet';
import { MoreActionsSheet } from './task-actions/MoreActionsSheet';
import { ReasonSheet, type ReasonKind } from './task-actions/ReasonSheet';
import { ReviewSheet } from './task-actions/ReviewSheet';
import { SendToTestingSheet } from './task-actions/SendToTestingSheet';

type OpenSheet = 'more' | 'review' | 'assign' | 'log-work' | 'send-to-testing' | ReasonKind;

const DONE_MESSAGES: Record<Exclude<OpenSheet, 'more'>, string> = {
  review: 'Review recorded',
  assign: 'Assigned',
  'log-work': 'Time logged',
  'send-to-testing': 'Sent for testing',
  block: 'Marked as blocked',
  reopen: 'Reopened',
  cancel: 'Task cancelled',
};

/**
 * What can be done to a task, for this person.
 *
 * Every entry comes from `task.actions`, computed by the API for this caller on this task: the
 * constants name which entry to look for, not whether it is allowed. The most useful one — start,
 * send for review, review, unblock — is the big button; everything else is one tap away under
 * "More actions", so the screen leads with the next step rather than a wall of buttons.
 */
export function TaskActions({
  task,
  onSubmit,
  onChanged,
  onEdit,
  canSendToTesting = false,
}: {
  task: TaskDetail;
  /** Sending for review is a form of its own; the detail screen navigates to it. */
  onSubmit: () => void;
  onChanged: () => void;
  /** Opens the edit form. Offered only when the API enables `edit` as well. */
  onEdit?: (taskId: string) => void;
  /** `qa:assign`, on an open task. Creating a QA assignment is not a task action. */
  canSendToTesting?: boolean;
}) {
  const theme = useTheme();
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const quick = { invalidate: [['tasks']], onSuccess: onChanged } as const;
  const start = useApiMutation<void, TaskDetail>({ path: `/tasks/${task.id}/start`, ...quick });
  const unblock = useApiMutation<void, TaskDetail>({
    path: `/tasks/${task.id}/unblock`,
    ...quick,
  });

  const { primary, others } = planTaskActions(task.actions, {
    canEdit: Boolean(onEdit),
    canSendToTesting,
  });

  const perform = (key: ActionKey) => {
    setDone(null);
    if (key === TASK_ACTION.START) {
      void start.run();
    } else if (key === TASK_ACTION.UNBLOCK) {
      void unblock.run();
    } else if (key === TASK_ACTION.SUBMIT) {
      onSubmit();
    } else if (key === TASK_ACTION.EDIT) {
      onEdit?.(task.id);
    } else {
      setSheet(key);
    }
  };

  const pickFromMore = (key: ActionKey) => {
    setSheet(null);
    // iOS will not present a modal while the previous one is still animating away.
    setTimeout(() => perform(key), Platform.OS === 'ios' ? 400 : 0);
  };

  const finish = (kind: Exclude<OpenSheet, 'more'>) => () => {
    setSheet(null);
    setDone(DONE_MESSAGES[kind]);
    onChanged();
  };

  const failure = start.error ?? unblock.error;
  const busy = (entry: PlannedAction) =>
    (entry.key === TASK_ACTION.START && start.busy) ||
    (entry.key === TASK_ACTION.UNBLOCK && unblock.busy);
  const single = others.length === 1 ? others[0] : undefined;

  return (
    <Section title="Actions" icon="flash-outline">
      {!primary && others.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing to do from here right now.
        </AppText>
      ) : null}

      {primary ? (
        <Button
          label={primary.label}
          icon={primary.icon}
          loading={busy(primary)}
          disabled={!primary.enabled}
          accessibilityHint={primary.reason ?? undefined}
          onPress={() => perform(primary.key)}
        />
      ) : null}
      {primary?.reason ? <MetaLine icon="time-outline">{primary.reason}</MetaLine> : null}

      {single || others.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {single ? (
            <Button
              label={single.label}
              icon={single.icon}
              variant={single.destructive ? 'dangerGhost' : 'secondary'}
              loading={busy(single)}
              onPress={() => perform(single.key)}
              style={{ flex: 1 }}
            />
          ) : (
            <Button
              label={`More actions (${others.length})`}
              icon="ellipsis-horizontal"
              variant="secondary"
              onPress={() => setSheet('more')}
              style={{ flex: 1 }}
            />
          )}
        </View>
      ) : null}

      {done ? <SuccessNote label={done} /> : null}
      {failure ? (
        <Banner tone="danger" role="alert">
          {failure}
        </Banner>
      ) : null}

      {sheet === 'more' ? (
        <MoreActionsSheet actions={others} onPick={pickFromMore} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'review' ? (
        <ReviewSheet task={task} onClose={() => setSheet(null)} onDone={finish('review')} />
      ) : null}
      {sheet === 'assign' ? (
        <AssignSheet task={task} onClose={() => setSheet(null)} onDone={finish('assign')} />
      ) : null}
      {sheet === 'log-work' ? (
        <LogTimeSheet taskId={task.id} onClose={() => setSheet(null)} onDone={finish('log-work')} />
      ) : null}
      {sheet === 'send-to-testing' ? (
        <SendToTestingSheet
          task={task}
          onClose={() => setSheet(null)}
          onDone={finish('send-to-testing')}
        />
      ) : null}
      {sheet === 'block' || sheet === 'reopen' || sheet === 'cancel' ? (
        <ReasonSheet
          task={task}
          kind={sheet}
          onClose={() => setSheet(null)}
          onDone={finish(sheet)}
        />
      ) : null}
    </Section>
  );
}
