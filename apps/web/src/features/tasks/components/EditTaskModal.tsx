import { PRIORITY, PRIORITY_LABELS, type Priority, type TaskDetail } from '@ashniva/types';
import { Button, FormField, Input, Modal, Select, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTaskMutations, type UpdateTaskInput } from '../api';
import { PeoplePicker } from './PeoplePicker';
import { REVIEWER_ROLES, TESTER_ROLES } from './people-roles';

const PRIORITIES = Object.values(PRIORITY);

/**
 * Correcting a task after it was created.
 *
 * `PATCH /tasks/:id` and the `edit` action have existed since tasks did, and nothing called them:
 * every field below was frozen at creation. The one that hurt most was the tester — a task created
 * without one showed "No tester named" for ever and every QA hand-over from it went to the
 * unassigned queue, because "Send to testing" takes the tester from the task and there was no way
 * to put one there.
 *
 * Exactly the fields `UpdateTaskDto` already accepts, and only the ones a person corrects on this
 * screen: the status is the workflow's, the assignee is `assign` (which writes a history entry and
 * notifies), and the milestone belongs to the milestone screen. Whether the edit is allowed at all
 * is the server's answer — the `edit` action off `task.actions` — not this component's.
 */
export function EditTaskModal({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const { update } = useTaskMutations(task.id);
  const { error, wrap } = useSubmitHandler(onClose);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(task.acceptanceCriteria ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [estimate, setEstimate] = useState(
    task.estimateMinutes === null ? '' : String(task.estimateMinutes),
  );
  const [reviewerId, setReviewerId] = useState(task.reviewer?.id ?? '');
  const [testerId, setTesterId] = useState(task.tester?.id ?? '');

  const tooShort = title.trim().length < 3;

  /**
   * Only what changed.
   *
   * `null` is how the DTO says "clear this", and `undefined` is how it says "leave it alone" — so
   * a field somebody never touched must not be sent at all. Sending the whole form would let this
   * modal quietly clear a reviewer that a different screen had just set.
   */
  const changes = (): UpdateTaskInput => {
    const patch: UpdateTaskInput = {};
    if (title.trim() !== task.title) {
      patch.title = title.trim();
    }
    if (description.trim() !== (task.description ?? '')) {
      patch.description = description.trim() || null;
    }
    if (acceptanceCriteria.trim() !== (task.acceptanceCriteria ?? '')) {
      patch.acceptanceCriteria = acceptanceCriteria.trim() || null;
    }
    if (priority !== task.priority) {
      patch.priority = priority;
    }
    if (dueDate !== (task.dueDate ?? '')) {
      patch.dueDate = dueDate || null;
    }
    if (estimate !== (task.estimateMinutes === null ? '' : String(task.estimateMinutes))) {
      patch.estimateMinutes = estimate ? Number(estimate) : null;
    }
    if (reviewerId !== (task.reviewer?.id ?? '')) {
      patch.reviewerId = reviewerId || null;
    }
    if (testerId !== (task.tester?.id ?? '')) {
      patch.testerId = testerId || null;
    }
    return patch;
  };

  return (
    <Modal
      open
      title={`Edit ${task.key}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={update.isPending}
            disabled={tooShort}
            disabledReason="Give the task a title (at least 3 characters)"
            onClick={() => void wrap(() => update.mutateAsync(changes()))()}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-grid__full">
          <FormField label="Title" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </FormField>
        </div>
        <div className="form-grid__full">
          <FormField label="Description">
            <Textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
        </div>
        <div className="form-grid__full">
          <FormField
            label="Acceptance criteria"
            hint="What the reviewer and the tester check it against"
          >
            <Textarea
              rows={3}
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Priority">
          <Select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
          />
        </FormField>
        <FormField label="Due date">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
        <FormField label="Estimate (minutes)">
          <Input
            type="number"
            min={1}
            max={100000}
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
          />
        </FormField>
        <FormField label="Reviewer">
          <PeoplePicker
            value={reviewerId}
            onChange={setReviewerId}
            roles={REVIEWER_ROLES}
            placeholder="Nobody named"
          />
        </FormField>
        <FormField label="Tester" hint="Who a QA hand-over from this task goes to">
          <PeoplePicker
            value={testerId}
            onChange={setTesterId}
            roles={TESTER_ROLES}
            placeholder="Nobody named"
          />
        </FormField>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
