import type { TaskDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { isWorker } from '../task-people';
import { SheetButtons } from './SheetButtons';

/**
 * Assigning or reassigning. `POST /tasks/:id/assign` rather than an edit, because an assignment
 * writes a history entry and notifies the new assignee — which a field change would not.
 */
export function AssignSheet({
  task,
  onClose,
  onDone,
}: {
  task: TaskDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [assignee, setAssignee] = useState<string[]>(task.assignedTo ? [task.assignedTo.id] : []);
  const [note, setNote] = useState('');
  const assign = useApiMutation<{ assignedToId: string; note?: string }, TaskDetail>({
    path: `/tasks/${task.id}/assign`,
    body: (variables) => variables,
    invalidate: [['tasks']],
    onSuccess: onDone,
  });
  const chosen = assignee[0];
  const unchanged = chosen === task.assignedTo?.id;

  return (
    <Sheet
      visible
      title={task.assignedTo ? 'Reassign task' : 'Assign task'}
      subtitle={task.assignedTo ? `Currently with ${task.assignedTo.name}` : 'Nobody has it yet'}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel="Assign"
          confirmIcon="person-add-outline"
          onConfirm={() => {
            if (chosen) {
              void assign.run({
                assignedToId: chosen,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
            }
          }}
          onCancel={onClose}
          busy={assign.busy}
          disabled={!chosen || unchanged}
        />
      }
    >
      <UserPicker
        label="Assign to"
        value={assignee}
        onChange={setAssignee}
        filter={isWorker}
        allowClear={false}
        placeholder="Choose a person"
        required
      />
      <Field label="Note (optional)" hint="Sent to the new assignee with the task">
        <Input
          accessibilityLabel="Note for the assignee"
          maxLength={500}
          onChangeText={setNote}
          value={note}
        />
      </Field>
      {assign.error ? (
        <Banner tone="danger" role="alert">
          {assign.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
