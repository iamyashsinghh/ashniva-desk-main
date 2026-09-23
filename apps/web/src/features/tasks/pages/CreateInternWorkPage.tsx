import { PERMISSIONS, PRIORITY, PRIORITY_LABELS, isManagerRole, type Priority } from '@ashniva/types';
import {
  Button,
  Card,
  FormField,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
} from '@ashniva/ui';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { todayIso } from '../../../shared/lib/format';
import { useSession, usePermission } from '../../auth/session-context';
import { useProjectsQuery } from '../../projects/api';
import { useTaskMutations, type CreateTaskInput } from '../api';
import { PeoplePicker } from '../components/PeoplePicker';
import { INTERN_ROLES } from '../components/people-roles';

import '../tasks.css';

const PRIORITIES = Object.values(PRIORITY);

/**
 * Assign learning work to an intern. Separate from the ordinary Create task form so the
 * section stays clear: one purpose, one audience, no review/QA noise.
 */
export function CreateInternWorkPage() {
  const navigate = useNavigate();
  const session = useSession();
  const canAssign = usePermission(PERMISSIONS.TASK_ASSIGN);
  const mayCreate = Boolean(session.user && isManagerRole(session.user.roleKey) && canAssign);
  const projects = useProjectsQuery({ status: 'ACTIVE' });
  const { create } = useTaskMutations();

  const [form, setForm] = useState<CreateTaskInput>({
    title: '',
    priority: PRIORITY.MEDIUM,
    dueDate: todayIso(),
    isInternTask: true,
    clientVisible: false,
  });
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    assignedToId?: string;
  }>({});

  const set = <TKey extends keyof CreateTaskInput>(key: TKey, value: CreateTaskInput[TKey]) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (!mayCreate) {
    return (
      <div className="tasks-page">
        <PageHeader
          breadcrumbs={[
            { key: 'intern', label: 'Intern work', href: '/intern-work' },
            { key: 'new', label: 'Assign' },
          ]}
          renderBreadcrumbLink={(href, children) => <Link to={href}>{children}</Link>}
          title="Assign intern work"
          subtitle="Only a director, project manager or team lead can assign work to interns."
        />
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    if (form.title.trim().length < 3) {
      nextErrors.title = 'Give the work a clear title';
    }
    if (!form.assignedToId) {
      nextErrors.assignedToId = 'Choose an intern';
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setError(undefined);
    try {
      const created = await create.mutateAsync({
        ...form,
        projectId: form.projectId || undefined,
        isInternTask: true,
        clientVisible: false,
        description: form.description?.trim() || undefined,
        assignedToId: form.assignedToId,
      });
      void navigate(`/tasks/${created.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <form className="tasks-page" onSubmit={(event) => void submit(event)} noValidate>
      <PageHeader
        breadcrumbs={[
          { key: 'intern', label: 'Intern work', href: '/intern-work' },
          { key: 'new', label: 'Assign' },
        ]}
        renderBreadcrumbLink={(href, children) => <Link to={href}>{children}</Link>}
        title="Assign intern work"
        subtitle="The intern sees this under Intern work, replies in comments, and uploads attachments with a short note on what each file is for. Only you and Super Admin see it besides the intern."
        actions={
          <Button type="submit" variant="primary" loading={create.isPending}>
            Assign work
          </Button>
        }
      />
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <Card title="Assignment">
        <div className="form-grid">
          <div className="form-grid__full">
            <FormField label="Title" required error={fieldErrors.title}>
              <Input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="What should the intern deliver?"
              />
            </FormField>
          </div>
          <div className="form-grid__full">
            <FormField label="Brief" hint="Context, links and acceptance notes for the intern.">
              <Textarea
                rows={5}
                value={form.description ?? ''}
                onChange={(event) => set('description', event.target.value)}
                placeholder="Describe the work clearly. The intern will reply and attach files on this task."
              />
            </FormField>
          </div>
          <FormField
            label="Project"
            hint="Optional. Leave blank for general learning work — it will sit under Intern work."
          >
            <Select
              value={form.projectId ?? ''}
              onChange={(event) => set('projectId', event.target.value || undefined)}
              placeholder="No project"
              options={[
                { value: '', label: 'No project' },
                ...(projects.data ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.code} · ${project.name}`,
                })),
              ]}
            />
          </FormField>
          <FormField label="Intern" required error={fieldErrors.assignedToId}>
            <PeoplePicker
              value={form.assignedToId ?? ''}
              onChange={(userId) => set('assignedToId', userId)}
              roles={INTERN_ROLES}
              placeholder="Choose an intern"
            />
          </FormField>
          <FormField label="Due date">
            <Input
              type="date"
              value={form.dueDate ?? ''}
              onChange={(event) => set('dueDate', event.target.value)}
            />
          </FormField>
          <div className="segmented-field">
            <span className="segmented-field__label">Priority</span>
            <SegmentedControl
              aria-label="Priority"
              size="sm"
              value={form.priority ?? PRIORITY.MEDIUM}
              onChange={(value) => set('priority', value as Priority)}
              options={PRIORITIES.map((priority) => ({
                key: priority,
                label: PRIORITY_LABELS[priority],
              }))}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
