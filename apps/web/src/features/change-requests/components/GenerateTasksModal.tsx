import type { ChangeRequestDetail } from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Switch,
  Toolbar,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useMilestonesQuery } from '../../milestones/api';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { WORKER_ROLES } from '../../tasks/components/people-roles';
import { useChangeRequestMutations } from '../api';

interface ModalProps {
  cr: ChangeRequestDetail;
  onClose: () => void;
}

interface TaskDraft {
  title: string;
  assignedToId: string;
  dueDate: string;
}

/** Approved change → linked tasks, under an existing or new milestone. */
export function GenerateTasksModal({ cr, onClose }: ModalProps) {
  const { generateTasks } = useChangeRequestMutations(cr.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const milestones = useMilestonesQuery({ projectId: cr.project?.id }, Boolean(cr.project));
  const [milestoneMode, setMilestoneMode] = useState<'none' | 'existing' | 'new'>('new');
  const [milestoneId, setMilestoneId] = useState('');
  const [milestoneName, setMilestoneName] = useState(cr.title);
  const [clientVisible, setClientVisible] = useState(true);
  const [tasks, setTasks] = useState<TaskDraft[]>([
    { title: cr.title, assignedToId: '', dueDate: '' },
  ]);
  const valid =
    tasks.every((task) => task.title.trim().length >= 3) &&
    (milestoneMode !== 'existing' || milestoneId) &&
    (milestoneMode !== 'new' || milestoneName.trim().length >= 2);
  const updateTask = (index: number, patch: Partial<TaskDraft>) =>
    setTasks((current) => current.map((task, at) => (at === index ? { ...task, ...patch } : task)));
  return (
    <Modal
      open
      size="lg"
      title="Create the work"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={generateTasks.isPending}
            disabled={!valid}
            disabledReason="Every task needs a title"
            onClick={() =>
              void wrap(() =>
                generateTasks.mutateAsync({
                  ...(milestoneMode === 'existing' ? { milestoneId } : {}),
                  ...(milestoneMode === 'new'
                    ? { milestone: { name: milestoneName.trim(), clientVisible } }
                    : {}),
                  tasks: tasks.map((task) => ({
                    title: task.title.trim(),
                    assignedToId: task.assignedToId || undefined,
                    dueDate: task.dueDate || undefined,
                  })),
                }),
              )()
            }
          >
            Create {tasks.length === 1 ? 'task' : `${tasks.length} tasks`}
          </Button>
        </>
      }
    >
      <FormField label="Milestone">
        <Select
          value={milestoneMode}
          onChange={(event) => setMilestoneMode(event.target.value as typeof milestoneMode)}
          options={[
            { value: 'new', label: 'Create a new milestone' },
            { value: 'existing', label: 'Attach to an existing milestone' },
            { value: 'none', label: 'No milestone' },
          ]}
        />
      </FormField>
      {milestoneMode === 'existing' ? (
        <FormField label="Existing milestone" required>
          <Select
            value={milestoneId}
            placeholder="Choose"
            onChange={(event) => setMilestoneId(event.target.value)}
            options={(milestones.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
        </FormField>
      ) : null}
      {milestoneMode === 'new' ? (
        <>
          <FormField label="Milestone name" required>
            <Input
              value={milestoneName}
              onChange={(event) => setMilestoneName(event.target.value)}
            />
          </FormField>
          <Switch
            tone="success"
            checked={clientVisible}
            onChange={setClientVisible}
            label="Client-visible milestone"
          />
        </>
      ) : null}
      {tasks.map((task, index) => (
        <FormGrid key={index}>
          <FormGridFull>
            <FormField label={`Task ${index + 1}`} required>
              <Input
                value={task.title}
                onChange={(event) => updateTask(index, { title: event.target.value })}
              />
            </FormField>
          </FormGridFull>
          <FormField label="Assign to">
            <PeoplePicker
              value={task.assignedToId}
              onChange={(userId) => updateTask(index, { assignedToId: userId })}
              roles={WORKER_ROLES}
            />
          </FormField>
          <FormField label="Due">
            <Input
              type="date"
              value={task.dueDate}
              onChange={(event) => updateTask(index, { dueDate: event.target.value })}
            />
          </FormField>
        </FormGrid>
      ))}
      <Toolbar>
        <Button
          size="sm"
          onClick={() =>
            setTasks((current) => [...current, { title: '', assignedToId: '', dueDate: '' }])
          }
        >
          + Another task
        </Button>
        {tasks.length > 1 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTasks((current) => current.slice(0, -1))}
          >
            Remove last
          </Button>
        ) : null}
      </Toolbar>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
