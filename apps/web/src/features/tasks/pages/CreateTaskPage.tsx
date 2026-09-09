import { PRIORITY, PRIORITY_LABELS, type Priority, type TaskCategoryRef } from '@ashniva/types';
import {
  Button,
  Card,
  FormField,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
} from '@ashniva/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { apiRequest, errorMessage } from '../../../shared/lib/api-client';
import { todayIso } from '../../../shared/lib/format';
import { useProjectsQuery } from '../../projects/api';
import { useTaskMutations, type CreateTaskInput } from '../api';
import { PeoplePicker } from '../components/PeoplePicker';
import { REVIEWER_ROLES, TESTER_ROLES, WORKER_ROLES } from '../components/people-roles';
import { TaskScheduleFields, localToIso } from '../components/TaskScheduleFields';

import '../tasks.css';

const PRIORITIES = Object.values(PRIORITY);

/** The approved Create Task form: essentials first, "More options" folded away. */
export function CreateTaskPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const projects = useProjectsQuery({ status: 'ACTIVE' });
  const categories = useQuery({
    queryKey: ['tasks', 'categories'],
    queryFn: () => apiRequest<TaskCategoryRef[]>('/tasks/categories'),
  });
  const { create } = useTaskMutations();

  const [form, setForm] = useState<CreateTaskInput>({
    title: '',
    projectId: params.get('projectId') ?? '',
    priority: PRIORITY.MEDIUM,
    dueDate: todayIso(),
    clientVisible: false,
    ticketId: params.get('ticketId') ?? undefined,
  });
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; projectId?: string }>({});

  const set = <TKey extends keyof CreateTaskInput>(key: TKey, value: CreateTaskInput[TKey]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent, mode: 'draft' | 'create' | 'another') {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    if (form.title.trim().length < 3) {
      nextErrors.title = 'Give the task a title (at least 3 characters)';
    }
    if (!form.projectId) {
      nextErrors.projectId = 'Choose a project';
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setError(undefined);
    try {
      const created = await create.mutateAsync({
        ...form,
        saveAsDraft: mode === 'draft',
        assignedToId: form.assignedToId || undefined,
        reviewerId: form.reviewerId || undefined,
        testerId: form.testerId || undefined,
        categoryId: form.categoryId || undefined,
        dueDate: form.dueDate || undefined,
        // `datetime-local` gives a local wall-clock string; the API stores instants.
        scheduledStartAt: localToIso(form.scheduledStartAt),
        dueAt: localToIso(form.dueAt),
        workAreas: form.workAreas?.length ? form.workAreas : undefined,
        description: form.description?.trim() || undefined,
      });
      if (mode === 'another') {
        setForm((current) => ({ ...current, title: '', description: '' }));
      } else {
        void navigate(`/tasks/${created.id}`);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <form className="task-detail" onSubmit={(event) => void submit(event, 'create')} noValidate>
      <PageHeader
        crumbs="Tasks / New"
        title="Create task"
        subtitle="Assigning someone makes it Assigned; without an assignee it is saved as a draft."
      />
      <Card>
        <div className="form-grid">
          <div className="form-grid__full">
            <FormField label="Title" required error={fieldErrors.title}>
              <Input value={form.title} onChange={(event) => set('title', event.target.value)} />
            </FormField>
          </div>
          <FormField label="Project" required error={fieldErrors.projectId}>
            <Select
              value={form.projectId}
              onChange={(event) => set('projectId', event.target.value)}
              placeholder="Choose a project"
              options={(projects.data ?? []).map((project) => ({
                value: project.id,
                label: `${project.code} · ${project.name}`,
              }))}
            />
          </FormField>
          <FormField label="Assign to">
            <PeoplePicker
              value={form.assignedToId ?? ''}
              onChange={(userId) => set('assignedToId', userId)}
              roles={WORKER_ROLES}
            />
          </FormField>
          <FormField label="Due date">
            <Input
              type="date"
              value={form.dueDate ?? ''}
              onChange={(event) => set('dueDate', event.target.value)}
            />
          </FormField>
          <TaskScheduleFields
            value={form}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          />
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
          <FormField label="Category">
            <Select
              value={form.categoryId ?? ''}
              onChange={(event) => set('categoryId', event.target.value)}
              options={[
                { value: '', label: 'Development (default)' },
                ...(categories.data ?? []).map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
          </FormField>
          <div className="form-grid__full">
            <FormField label="Description">
              <Textarea
                rows={4}
                value={form.description ?? ''}
                onChange={(event) => set('description', event.target.value)}
              />
            </FormField>
          </div>
          <div className="form-grid__full">
            <Switch
              tone="success"
              checked={form.clientVisible ?? false}
              onChange={(checked) => set('clientVisible', checked)}
              label="Client-visible"
              description="When completed, an update is drafted for the client and waits for a senior to publish it."
            />
          </div>
        </div>
      </Card>

      <Button variant="ghost" onClick={() => setMore((open) => !open)} aria-expanded={more}>
        {more ? 'Hide options' : 'More options'}
      </Button>
      {more ? (
        <Card title="More options">
          <div className="form-grid">
            <FormField label="Module">
              <Input
                value={form.module ?? ''}
                onChange={(event) => set('module', event.target.value)}
              />
            </FormField>
            <FormField label="Estimate (minutes)" hint="Internal only — never shown to the client">
              <Input
                type="number"
                min={1}
                value={form.estimateMinutes ?? ''}
                onChange={(event) =>
                  set(
                    'estimateMinutes',
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
              />
            </FormField>
            <FormField label="Reviewer">
              <PeoplePicker
                value={form.reviewerId ?? ''}
                onChange={(userId) => set('reviewerId', userId)}
                roles={REVIEWER_ROLES}
                placeholder="Default (senior / PM)"
              />
            </FormField>
            <FormField label="Tester">
              <PeoplePicker
                value={form.testerId ?? ''}
                onChange={(userId) => set('testerId', userId)}
                roles={TESTER_ROLES}
                placeholder="Any tester"
              />
            </FormField>
            <div className="form-grid__full">
              <FormField label="Acceptance criteria">
                <Textarea
                  rows={3}
                  value={form.acceptanceCriteria ?? ''}
                  onChange={(event) => set('acceptanceCriteria', event.target.value)}
                />
              </FormField>
            </div>
          </div>
        </Card>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <Button onClick={() => void navigate(-1)}>Cancel</Button>
        <Button onClick={(event) => void submit(event, 'draft')} loading={create.isPending}>
          Save as draft
        </Button>
        <Button onClick={(event) => void submit(event, 'another')} loading={create.isPending}>
          Create another
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {form.assignedToId ? 'Create and assign' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
