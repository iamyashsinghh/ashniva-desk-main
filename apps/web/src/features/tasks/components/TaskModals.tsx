import type { TaskDetail } from '@ashniva/types';
import { Button, FormField, Input, Modal, SegmentedControl, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { todayIso } from '../../../shared/lib/format';
import { useTaskMutations } from '../api';
import { PeoplePicker } from './PeoplePicker';
import { WORKER_ROLES } from './people-roles';

export interface ModalProps {
  open: boolean;
  task: TaskDetail;
  onClose: () => void;
}

export function AssignTaskModal({ open, task, onClose }: ModalProps) {
  const [assignedToId, setAssignedToId] = useState(task.assignedTo?.id ?? '');
  const [note, setNote] = useState('');
  const { assign } = useTaskMutations(task.id);
  const { error, wrap } = useSubmitHandler(onClose);
  return (
    <Modal
      open={open}
      title="Assign task"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={assign.isPending}
            disabled={!assignedToId}
            disabledReason="Choose a person"
            onClick={() =>
              void wrap(() => assign.mutateAsync({ assignedToId, note: note || undefined }))()
            }
          >
            Assign
          </Button>
        </>
      }
    >
      <FormField label="Assign to" required>
        <PeoplePicker
          value={assignedToId}
          onChange={setAssignedToId}
          roles={WORKER_ROLES}
          placeholder="Choose a person"
        />
      </FormField>
      <FormField label="Note (optional)">
        <Input value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

export function ReviewTaskModal({ open, task, onClose }: ModalProps) {
  const [outcome, setOutcome] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [note, setNote] = useState('');
  const { review } = useTaskMutations(task.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const canApprove = task.actions.some((action) => action.action === 'approve' && action.enabled);
  const canReject = task.actions.some((action) => action.action === 'reject' && action.enabled);
  const valid = outcome === 'APPROVE' || note.trim().length >= 3;
  return (
    <Modal
      open={open}
      title="Review / testing result"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={outcome === 'APPROVE' ? 'accent' : 'danger'}
            loading={review.isPending}
            disabled={!valid}
            disabledReason="Explain what must change"
            onClick={() =>
              void wrap(() => review.mutateAsync({ outcome, note: note.trim() || undefined }))()
            }
          >
            {outcome === 'APPROVE' ? 'Approve and complete' : 'Return to developer'}
          </Button>
        </>
      }
    >
      <SegmentedControl
        aria-label="Outcome"
        value={outcome}
        onChange={setOutcome}
        options={[
          { key: 'APPROVE', label: canApprove ? 'Approve' : 'Approve (not allowed)' },
          { key: 'REJECT', label: canReject ? 'Request changes' : 'Request changes (not allowed)' },
        ]}
      />
      <FormField
        label={outcome === 'APPROVE' ? 'Note (optional)' : 'What must change?'}
        required={outcome === 'REJECT'}
      >
        <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

export function LogWorkModal({ open, task, onClose }: ModalProps) {
  const [workDate, setWorkDate] = useState(todayIso());
  const [minutes, setMinutes] = useState('60');
  const [summary, setSummary] = useState('');
  const { logWork } = useTaskMutations(task.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const valid = summary.trim().length >= 3 && Number(minutes) > 0;
  return (
    <Modal
      open={open}
      title="Log time"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={logWork.isPending}
            disabled={!valid}
            disabledReason="Add a summary and minutes"
            onClick={() =>
              void wrap(() =>
                logWork.mutateAsync({
                  workDate,
                  minutes: Number(minutes),
                  summary: summary.trim(),
                }),
              )()
            }
          >
            Log time
          </Button>
        </>
      }
    >
      <FormField label="Date" required>
        <Input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
      </FormField>
      <FormField label="Minutes" required>
        <Input
          type="number"
          min={1}
          max={1440}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
      </FormField>
      <FormField label="What did you do?" required>
        <Textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </FormField>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

interface ReasonModalProps extends ModalProps {
  title: string;
  label: string;
  submitLabel: string;
  kind: 'block' | 'reopen' | 'cancel';
}

export function ReasonModal({
  open,
  task,
  onClose,
  title,
  label,
  submitLabel,
  kind,
}: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const mutations = useTaskMutations(task.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const mutation = { block: mutations.block, reopen: mutations.reopen, cancel: mutations.cancel }[
    kind
  ];
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant={kind === 'cancel' ? 'danger' : 'primary'}
            loading={mutation.isPending}
            disabled={reason.trim().length < 3}
            disabledReason="Give a reason"
            onClick={() => void wrap(() => mutation.mutateAsync({ reason: reason.trim() }))()}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <FormField label={label} required>
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
