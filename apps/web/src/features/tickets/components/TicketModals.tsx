import { PRIORITY, PRIORITY_LABELS, type Priority, type TicketDetail } from '@ashniva/types';
import {
  Alert,
  Button,
  FieldGroup,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Switch,
  Toolbar,
} from '@ashniva/ui';
import { useState } from 'react';

import { todayIso } from '../../../shared/lib/format';
import { useProjectsQuery } from '../../projects/api';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { TESTER_ROLES, WORKER_ROLES } from '../../tasks/components/people-roles';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTicketMutations } from '../api';

export interface ModalProps {
  open: boolean;
  ticket: TicketDetail;
  onClose: () => void;
}

export function AssignTicketModal({ open, ticket, onClose }: ModalProps) {
  const [assignedToId, setAssignedToId] = useState(ticket.assignedTo?.id ?? '');
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [note, setNote] = useState('');
  const { assign } = useTicketMutations(ticket.id);
  const { error, wrap } = useSubmitHandler(onClose);
  return (
    <Modal
      open={open}
      title="Assign ticket"
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
              void wrap(() =>
                assign.mutateAsync({ assignedToId, priority, note: note || undefined }),
              )()
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
      <FieldGroup legend="Priority">
        <SegmentedControl
          aria-label="Priority"
          size="sm"
          value={priority}
          onChange={setPriority}
          options={Object.values(PRIORITY).map((value) => ({
            key: value,
            label: PRIORITY_LABELS[value],
          }))}
        />
      </FieldGroup>
      <FormField label="Note (optional)">
        <Input value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}

interface TaskDraft {
  title: string;
  assignedToId: string;
  dueDate: string;
}

/** One ticket → one or many linked tasks. */
export function ConvertTicketModal({ open, ticket, onClose }: ModalProps) {
  // Loaded only while the modal is open, so viewers who cannot convert never request projects.
  const projects = useProjectsQuery({ status: 'ACTIVE' }, open);
  const [projectId, setProjectId] = useState(ticket.project?.id ?? '');
  const [testerId, setTesterId] = useState('');
  const [clientVisible, setClientVisible] = useState(true);
  const [tasks, setTasks] = useState<TaskDraft[]>([
    { title: ticket.title, assignedToId: ticket.assignedTo?.id ?? '', dueDate: todayIso() },
  ]);
  const { convert } = useTicketMutations(ticket.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const valid = Boolean(projectId) && tasks.every((task) => task.title.trim().length >= 3);
  const projectOptions = (projects.data ?? []).filter(
    (project) =>
      !project.clientOrganization || project.clientOrganization.id === ticket.clientOrganization.id,
  );

  const updateTask = (index: number, patch: Partial<TaskDraft>) =>
    setTasks((current) => current.map((task, at) => (at === index ? { ...task, ...patch } : task)));

  return (
    <Modal
      open={open}
      title="Convert to task"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={convert.isPending}
            disabled={!valid}
            disabledReason="Choose a project and give every task a title"
            onClick={() =>
              void wrap(() =>
                convert.mutateAsync({
                  projectId,
                  clientVisible,
                  testerId: testerId || undefined,
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
      <FormField label="Project" required>
        <Select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="Choose a project"
          options={projectOptions.map((project) => ({
            value: project.id,
            label: `${project.code} · ${project.name}`,
          }))}
        />
      </FormField>
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
            setTasks((current) => [
              ...current,
              { title: '', assignedToId: '', dueDate: todayIso() },
            ])
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
      <FormField label="Tester (optional)">
        <PeoplePicker
          value={testerId}
          onChange={setTesterId}
          roles={TESTER_ROLES}
          placeholder="Any tester"
        />
      </FormField>
      <Switch
        tone="success"
        checked={clientVisible}
        onChange={setClientVisible}
        label="Client-visible"
        description="The requester sees progress and a published update when it is done"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
