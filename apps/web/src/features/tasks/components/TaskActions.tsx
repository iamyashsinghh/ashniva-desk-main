import { TASK_ACTION, type TaskAction, type TaskDetail } from '@ashniva/types';
import { Button, type ButtonVariant } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useTaskMutations } from '../api';
import { EditTaskModal } from './EditTaskModal';
import { SubmitTaskModal } from './SubmitTaskModal';
import { AssignTaskModal, LogWorkModal, ReasonModal, ReviewTaskModal } from './TaskModals';

type ModalKind =
  'assign' | 'block' | 'submit' | 'review' | 'reopen' | 'cancel' | 'log-work' | 'edit' | null;

const ORDER: Array<{ action: TaskAction; label: string; variant: ButtonVariant }> = [
  { action: TASK_ACTION.START, label: 'Start work', variant: 'primary' },
  { action: TASK_ACTION.SUBMIT, label: 'Submit for review', variant: 'accent' },
  { action: TASK_ACTION.APPROVE, label: 'Approve', variant: 'accent' },
  { action: TASK_ACTION.REJECT, label: 'Request changes', variant: 'danger' },
  { action: TASK_ACTION.LOG_WORK, label: 'Log time', variant: 'secondary' },
  // `PATCH /tasks/:id` and this action shipped together and nothing ever called them, so a task's
  // title, description, acceptance criteria, dates, estimate, reviewer and tester were fixed at
  // creation — a task created without a tester said "No tester named" for ever.
  { action: TASK_ACTION.EDIT, label: 'Edit task', variant: 'secondary' },
  { action: TASK_ACTION.ASSIGN, label: 'Assign / reassign', variant: 'secondary' },
  { action: TASK_ACTION.BLOCK, label: 'Block', variant: 'secondary' },
  { action: TASK_ACTION.UNBLOCK, label: 'Unblock', variant: 'primary' },
  { action: TASK_ACTION.REOPEN, label: 'Reopen', variant: 'secondary' },
  { action: TASK_ACTION.CANCEL, label: 'Cancel task', variant: 'ghost' },
];

/**
 * "Actions for your role": every button the API knows about, enabled exactly when the API says
 * so, with the API's reason as the disabled explanation. Nothing here is decided by the UI.
 */
export function TaskActions({ task }: { task: TaskDetail }) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [error, setError] = useState<string | undefined>();
  const mutations = useTaskMutations(task.id);
  const availability = new Map(task.actions.map((entry) => [entry.action, entry]));

  async function run(action: TaskAction) {
    setError(undefined);
    try {
      if (action === TASK_ACTION.START) {
        await mutations.start.mutateAsync({});
      } else if (action === TASK_ACTION.UNBLOCK) {
        await mutations.unblock.mutateAsync({});
      } else if (action === TASK_ACTION.APPROVE || action === TASK_ACTION.REJECT) {
        setModal('review');
      } else if (action === TASK_ACTION.ASSIGN) {
        setModal('assign');
      } else if (action === TASK_ACTION.BLOCK) {
        setModal('block');
      } else if (action === TASK_ACTION.SUBMIT) {
        setModal('submit');
      } else if (action === TASK_ACTION.REOPEN) {
        setModal('reopen');
      } else if (action === TASK_ACTION.CANCEL) {
        setModal('cancel');
      } else if (action === TASK_ACTION.LOG_WORK) {
        setModal('log-work');
      } else if (action === TASK_ACTION.EDIT) {
        setModal('edit');
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const visible = ORDER.filter((entry) => {
    const state = availability.get(entry.action);
    if (!state) {
      return false;
    }
    // Show enabled actions, plus disabled ones that are only blocked by role (not by status),
    // so people learn who can do what — the approved "disabled buttons explain themselves" rule.
    return state.enabled || !state.reason?.startsWith('Not available while');
  });

  return (
    <div className="actions-card">
      {visible.length === 0 ? (
        <p className="actions-card__hint">Nothing to do on this task right now.</p>
      ) : null}
      {visible.map((entry) => {
        const state = availability.get(entry.action);
        return (
          <Button
            key={entry.action}
            variant={entry.variant}
            disabled={!state?.enabled}
            disabledReason={state?.reason}
            onClick={() => void run(entry.action)}
            loading={mutations.start.isPending || mutations.unblock.isPending}
          >
            {entry.label}
          </Button>
        );
      })}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {modal === 'edit' ? <EditTaskModal task={task} onClose={() => setModal(null)} /> : null}
      <AssignTaskModal open={modal === 'assign'} task={task} onClose={() => setModal(null)} />
      <SubmitTaskModal open={modal === 'submit'} task={task} onClose={() => setModal(null)} />
      <ReviewTaskModal open={modal === 'review'} task={task} onClose={() => setModal(null)} />
      <LogWorkModal open={modal === 'log-work'} task={task} onClose={() => setModal(null)} />
      <ReasonModal
        open={modal === 'block'}
        title="Block this task"
        label="What is blocking it?"
        submitLabel="Block"
        task={task}
        kind="block"
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'reopen'}
        title="Reopen this task"
        label="Why is it being reopened?"
        submitLabel="Reopen"
        task={task}
        kind="reopen"
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'cancel'}
        title="Cancel this task"
        label="Reason"
        submitLabel="Cancel task"
        task={task}
        kind="cancel"
        onClose={() => setModal(null)}
      />
    </div>
  );
}
