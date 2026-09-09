import { TASK_ACTION, type TaskDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';
import { actionState } from './task-display';

/**
 * What can be done to a task from a phone.
 *
 * Four actions, and the boundary is deliberate. Start, block, unblock and send-for-review are all
 * statements about *your own* work — you know whether you have begun, whether you are stuck, and
 * whether you are finished, and none of them need a screen full of history to answer.
 *
 * Review, reassign, override and cancel stay on the web. They are decisions about somebody else's
 * work, taken with the whole task in front of you, and a phone-sized version of one invites a
 * mistake that is awkward to undo.
 *
 * Every button comes from `task.actions`, which the API computed for this caller on this task —
 * the constants name which entry to look for, not whether it is allowed.
 */
export function TaskActions({
  task,
  onSubmit,
  onChanged,
}: {
  task: TaskDetail;
  /** Sending for review is a form of its own; the detail screen navigates to it. */
  onSubmit: () => void;
  onChanged: () => void;
}) {
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState('');

  const invalidate = [['tasks', task.id], ['tasks']];

  const start = useApiMutation<void, TaskDetail>({
    path: `/tasks/${task.id}/start`,
    invalidate,
    onSuccess: onChanged,
  });
  const block = useApiMutation<{ reason: string }, TaskDetail>({
    path: `/tasks/${task.id}/block`,
    body: (variables) => variables,
    invalidate,
    onSuccess: () => {
      setReason('');
      setBlockOpen(false);
      onChanged();
    },
  });
  const unblock = useApiMutation<void, TaskDetail>({
    path: `/tasks/${task.id}/unblock`,
    invalidate,
    onSuccess: onChanged,
  });

  // Start is the one action whose refusal is worth showing. "This task is scheduled to start
  // later" is a fact about the task; every other refusal here is a fact about the person, and
  // greying out a control to tell somebody they are not the assignee is noise.
  const startState = actionState(task.actions, TASK_ACTION.START, {
    showReasonWhenDisabled: true,
  });
  const submitState = actionState(task.actions, TASK_ACTION.SUBMIT);
  const blockState = actionState(task.actions, TASK_ACTION.BLOCK);
  const unblockState = actionState(task.actions, TASK_ACTION.UNBLOCK);

  const failure = start.error ?? block.error ?? unblock.error;

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Actions
      </AppText>

      {startState.offered ? (
        <>
          <Button
            label="Start work"
            loading={start.busy}
            disabled={!startState.enabled}
            accessibilityHint={startState.reason ?? 'Marks the task as in progress'}
            onPress={() => void start.run()}
          />
          {startState.reason ? (
            <AppText size="xs" tone="faint">
              {startState.reason}
            </AppText>
          ) : null}
        </>
      ) : null}

      {submitState.offered ? (
        <Button
          label="Send for review"
          accessibilityHint="Opens the form for what you completed"
          onPress={onSubmit}
        />
      ) : null}

      {unblockState.offered ? (
        <Button
          label="Unblock"
          variant="secondary"
          loading={unblock.busy}
          accessibilityHint="Says the blocker is gone and the work can continue"
          onPress={() => void unblock.run()}
        />
      ) : null}

      {blockState.offered && !blockOpen ? (
        <Button
          label="Blocked"
          variant="secondary"
          accessibilityHint="Says the work cannot continue, and why"
          onPress={() => setBlockOpen(true)}
        />
      ) : null}

      {blockState.offered && blockOpen ? (
        <>
          <Field label="What is blocking it?" hint="Whoever picks this up reads this first.">
            <Input
              accessibilityLabel="What is blocking it"
              multiline
              numberOfLines={2}
              onChangeText={setReason}
              placeholder="Waiting on the staging database credentials"
              style={{ minHeight: 64, textAlignVertical: 'top' }}
              value={reason}
            />
          </Field>
          <Button
            label="Mark as blocked"
            loading={block.busy}
            disabled={reason.trim().length < 3}
            onPress={() => void block.run({ reason: reason.trim() })}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setBlockOpen(false)} />
        </>
      ) : null}

      {failure ? (
        <AppText tone="danger" size="sm">
          {failure}
        </AppText>
      ) : null}
    </Card>
  );
}
