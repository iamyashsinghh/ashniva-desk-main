import type { ProblemDetail } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTasksQuery } from '../../tasks/api';
import { useProblemMutations } from '../api';

/**
 * Naming the task that carries the permanent fix.
 *
 * This asked for "the id of the task carrying the fix" as free text, and `problemClosureGate`
 * requires `fixAssigned` — so closing a problem meant copying a uuid out of the address bar and
 * hoping. The list comes from the ordinary `/tasks` read, narrowed to the problem's project and
 * filtered by the search box it already supports; there is no picker endpoint to add.
 *
 * The problem's own project is the scope because a permanent fix is work on the product the fault
 * is in. The server checks the task belongs to this organization whatever is sent.
 */
export function AssignFixModal({
  problem,
  onClose,
}: {
  problem: ProblemDetail;
  onClose: () => void;
}) {
  const { assignFix } = useProblemMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [search, setSearch] = useState('');
  const [taskId, setTaskId] = useState('');

  const tasks = useTasksQuery({
    projectId: problem.project?.id,
    search: search.trim() || undefined,
    limit: 100,
  });
  const options = (tasks.data?.items ?? []).map((task) => ({
    value: task.id,
    label: `${task.key} · ${task.title}`,
  }));

  return (
    <Modal
      open
      title="Assign the permanent fix"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="primary"
            loading={assignFix.isPending}
            disabled={!taskId}
            disabledReason="Choose the task carrying the fix"
            onClick={() => void wrap(() => assignFix.mutateAsync({ id: problem.id, taskId }))()}
          >
            Assign
          </Button>
        </>
      }
    >
      <p className="muted">
        A link, not a second copy of the work: the fix is tracked on the board like anything else,
        and closing this problem reads that task’s status rather than a tick set here.
      </p>
      <FormField label="Find the task" hint="Matches the title and the key">
        <Input
          value={search}
          placeholder="Invoice printing"
          onChange={(event) => setSearch(event.target.value)}
        />
      </FormField>
      <FormField
        label="The task carrying the fix"
        required
        hint={
          problem.project
            ? `On ${problem.project.name}`
            : 'This problem names no project, so everything is offered'
        }
      >
        <Select
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          placeholder={tasks.isLoading ? 'Loading…' : 'Choose a task'}
          options={options}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
