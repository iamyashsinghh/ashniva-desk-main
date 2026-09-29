import type { TaskCategoryRef, TaskDetail } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { Button, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { todayIsoDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { TaskFormFields } from './task-form/TaskFormFields';
import { TaskFormMore } from './task-form/TaskFormMore';
import {
  emptyTaskForm,
  taskFormFrom,
  toCreateBody,
  toPatchBody,
  validateTaskForm,
  type CreateTaskBody,
  type PatchTaskBody,
  type TaskFormErrors,
  type TaskFormValues,
} from './task-form/task-form-state';

/**
 * Creating a task (`POST /tasks`) or editing one (`PATCH /tasks/:id`).
 *
 * The same fields as the web form, essentials first and the rest folded under "More options".
 * The checks here are the API's own rules repeated for a quicker answer; the API applies them
 * again, and any refusal it gives is shown as it gave it.
 */
export function TaskFormScreen({
  taskId,
  projectId,
  onSaved,
}: {
  /** Set to edit that task; absent to create one. */
  taskId?: string;
  /** Preselects the project on create, e.g. when opened from a project. */
  projectId?: string;
  onSaved: (taskId: string) => void;
}) {
  const existing = useResource<TaskDetail>(['tasks', taskId], `/tasks/${taskId ?? ''}`, {
    enabled: Boolean(taskId),
  });

  if (!taskId) {
    return (
      <TaskForm initial={emptyTaskForm(projectId ?? null, todayIsoDate())} onSaved={onSaved} />
    );
  }
  if (!existing.data && existing.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(existing.error)}
          onRetry={() => void existing.refetch()}
        />
      </Screen>
    );
  }
  if (!existing.data) {
    return (
      <Screen>
        <LoadingState label="Loading the task" />
      </Screen>
    );
  }
  return <TaskForm initial={taskFormFrom(existing.data)} taskId={taskId} onSaved={onSaved} />;
}

/** The form itself, mounted once its starting values are known so they seed its state. */
function TaskForm({
  initial,
  taskId,
  onSaved,
}: {
  initial: TaskFormValues;
  taskId?: string;
  onSaved: (taskId: string) => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const mode = taskId ? 'edit' : 'create';
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const categories = useResource<TaskCategoryRef[]>(['tasks', 'categories'], '/tasks/categories');

  const saved = (task: TaskDetail) => onSaved(task.id);
  const create = useApiMutation<CreateTaskBody, TaskDetail>({
    path: '/tasks',
    body: (body) => body,
    invalidate: [['tasks']],
    onSuccess: saved,
  });
  const update = useApiMutation<PatchTaskBody, TaskDetail>({
    path: `/tasks/${taskId ?? ''}`,
    method: 'PATCH',
    body: (body) => body,
    invalidate: [['tasks']],
    onSuccess: saved,
  });

  const patch = taskId ? toPatchBody(initial, values) : null;
  const unchanged = patch !== null && Object.keys(patch).length === 0;
  const busy = create.busy || update.busy;
  const failure = create.error ?? update.error;

  const submit = (saveAsDraft: boolean) => {
    const found = validateTaskForm(values, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    if (patch) {
      void update.run(patch);
    } else {
      void create.run(toCreateBody(values, saveAsDraft));
    }
  };

  const change = (next: Partial<TaskFormValues>) =>
    setValues((current) => ({ ...current, ...next }));
  const invalid = Object.keys(errors).length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
          keyboardShouldPersistTaps="handled"
        >
          <TaskFormFields
            values={values}
            onChange={change}
            errors={errors}
            mode={mode}
            categories={categories.data ?? []}
            categoriesLoading={categories.isLoading}
          />
          {/* Remounted when the estimate is refused, so the section opens onto the error. */}
          <TaskFormMore
            key={errors.estimate ? 'more-with-error' : 'more'}
            values={values}
            onChange={change}
            errors={errors}
            initiallyOpen={mode === 'edit' || Boolean(errors.estimate)}
          />
          {invalid ? (
            <Banner tone="warning" title="Check the form">
              Fix the fields marked above, then save again.
            </Banner>
          ) : null}
          {failure ? (
            <Banner tone="danger" role="alert" title="Not saved">
              {failure}
            </Banner>
          ) : null}
        </ScrollView>

        <StickyActionBar>
          {mode === 'create' ? (
            <>
              <Grow>
                <Button
                  label="Save as draft"
                  variant="secondary"
                  icon="document-outline"
                  disabled={busy}
                  onPress={() => submit(true)}
                />
              </Grow>
              <Grow>
                <Button
                  label={values.assignedToId ? 'Create and assign' : 'Create'}
                  icon="add-circle-outline"
                  loading={busy}
                  onPress={() => submit(false)}
                />
              </Grow>
            </>
          ) : (
            <Grow>
              <Button
                label={unchanged ? 'No changes yet' : 'Save changes'}
                icon="save-outline"
                loading={busy}
                disabled={unchanged}
                onPress={() => submit(false)}
              />
            </Grow>
          )}
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
