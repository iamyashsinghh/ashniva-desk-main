import { TASK_ACTION, type TaskDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Segmented, type SegmentOption } from '../../../shared/components/navigation-list';
import { Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { actionState } from '../task-display';
import { SheetButtons } from './SheetButtons';

type Outcome = 'APPROVE' | 'REJECT';

/**
 * The review decision: approve and complete, or return to the developer with what must change.
 *
 * Only the outcomes the API enabled for this person are offered. Returning work requires a note
 * — `ReviewTaskDto` insists, and a bare "rejected" tells the developer nothing.
 */
export function ReviewSheet({
  task,
  onClose,
  onDone,
}: {
  task: TaskDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const options: SegmentOption<Outcome>[] = [];
  if (actionState(task.actions, TASK_ACTION.APPROVE).enabled) {
    options.push({ value: 'APPROVE', label: 'Approve', icon: 'checkmark-circle-outline' });
  }
  if (actionState(task.actions, TASK_ACTION.REJECT).enabled) {
    options.push({ value: 'REJECT', label: 'Request changes', icon: 'return-down-back-outline' });
  }
  const [outcome, setOutcome] = useState<Outcome>(options[0]?.value ?? 'APPROVE');
  const [note, setNote] = useState('');
  const review = useApiMutation<{ outcome: Outcome; note?: string }, TaskDetail>({
    path: `/tasks/${task.id}/review`,
    body: (variables) => variables,
    invalidate: [['tasks']],
    onSuccess: onDone,
  });

  const rejecting = outcome === 'REJECT';
  const valid = options.length > 0 && (!rejecting || note.trim().length >= 3);

  return (
    <Sheet
      visible
      title="Review"
      subtitle={`${task.key} · ${task.assignedTo?.name ?? 'Unassigned'}`}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={rejecting ? 'Return to developer' : 'Approve and complete'}
          confirmIcon={rejecting ? 'return-down-back-outline' : 'checkmark-done-outline'}
          onConfirm={() =>
            void review.run({ outcome, ...(note.trim() ? { note: note.trim() } : {}) })
          }
          onCancel={onClose}
          busy={review.busy}
          disabled={!valid}
          danger={rejecting}
        />
      }
    >
      {options.length > 1 ? (
        <Segmented options={options} value={outcome} onChange={setOutcome} label="Outcome" />
      ) : null}
      <Field
        label={rejecting ? 'What must change?' : 'Note (optional)'}
        required={rejecting}
        {...(rejecting ? { hint: 'The developer reads this first' } : {})}
      >
        <Input
          accessibilityLabel={rejecting ? 'What must change' : 'Review note'}
          multiline
          numberOfLines={3}
          maxLength={2000}
          onChangeText={setNote}
          style={{ minHeight: 88 }}
          value={note}
        />
      </Field>
      {review.error ? (
        <Banner tone="danger" role="alert">
          {review.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
