import type { ProblemDetail } from '@ashniva/types';
import { useState } from 'react';

import { useDebounced } from '../../../shared/components/FilterSheet';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useTaskOptions } from '../components/work-pickers';
import { useProblemWrite } from '../problem-api';

/**
 * Naming the task that carries the permanent fix.
 *
 * A link, not a second copy of the work: the fix is tracked on the board like anything else, and
 * closing the problem reads that task's status rather than a tick set here. The tasks offered are
 * the problem's own project's, searched on the server, as in the web's dialog.
 */
export function AssignFixSheet({
  problem,
  onClose,
}: {
  problem: ProblemDetail;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [taskId, setTaskId] = useState<string | null>(problem.fixTask?.id ?? null);
  const term = useDebounced(search.trim());
  const tasks = useTaskOptions({ projectId: problem.project?.id, search: term, enabled: true });

  const assign = useProblemWrite<string>({
    path: `/problems/${problem.id}/assign-fix`,
    body: (id) => ({ taskId: id }),
    onDone: onClose,
  });

  return (
    <Sheet
      visible
      title="Assign the permanent fix"
      subtitle={`${problem.key} · ${problem.title}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Assign"
            icon="construct-outline"
            loading={assign.busy}
            disabled={!taskId}
            onPress={() => (taskId ? void assign.run(taskId) : undefined)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <AppText size="sm" tone="muted">
        Closing this problem reads that task’s status, so the fix counts as out when the work
        carrying it is finished.
      </AppText>
      <Field label="Find the task" hint="Matches the title and the key">
        <Input
          icon="search"
          accessibilityLabel="Find the task"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          placeholder="Invoice printing"
        />
      </Field>
      <SelectField
        label="The task carrying the fix"
        required
        icon="checkbox-outline"
        options={tasks.options}
        value={taskId ? [taskId] : []}
        onChange={(ids) => setTaskId(ids[0] ?? null)}
        loading={tasks.isLoading}
        hint={
          problem.project
            ? `On ${problem.project.name}`
            : 'This problem names no project, so everything is offered'
        }
        placeholder={tasks.isLoading ? 'Loading…' : 'Choose a task'}
      />
      {assign.error ? (
        <Banner tone="danger" role="alert">
          {assign.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
