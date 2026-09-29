import { PRIORITY, PRIORITY_LABELS, type Priority, type TaskCategoryRef } from '@ashniva/types';
import { View } from 'react-native';

import { ChipGroup } from '../../../shared/components/chips';
import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Section } from '../../../shared/components/layout';
import { ProjectPicker, UserPicker } from '../../../shared/components/pickers';
import { Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ToggleRow } from '../ToggleRow';
import { isWorker } from '../task-people';
import type { TaskFormErrors, TaskFormValues } from './task-form-state';

const PRIORITIES = Object.values(PRIORITY);
/** The API files a task without a category under Development; the empty choice says so. */
const DEFAULT_CATEGORY = '';

export interface TaskFormPartProps {
  values: TaskFormValues;
  onChange: (patch: Partial<TaskFormValues>) => void;
  errors: TaskFormErrors;
}

/**
 * The essentials, in the web form's order. On an edit the project is fixed and the assignee is
 * not here at all: a task does not move between projects, and reassigning is its own action.
 */
export function TaskFormFields({
  values,
  onChange,
  errors,
  mode,
  categories,
  categoriesLoading,
}: TaskFormPartProps & {
  mode: 'create' | 'edit';
  categories: readonly TaskCategoryRef[];
  categoriesLoading: boolean;
}) {
  const theme = useTheme();
  const categoryOptions = [
    {
      value: DEFAULT_CATEGORY,
      label: 'Development (default)',
      icon: 'code-slash-outline' as const,
    },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
      icon: 'pricetag-outline' as const,
    })),
  ];

  return (
    <Section title="The task" icon="create-outline" style={{ gap: theme.spacing.md }}>
      <Field label="Title" required {...(errors.title ? { error: errors.title } : {})}>
        <Input
          accessibilityLabel="Title"
          placeholder="What needs doing"
          maxLength={200}
          onChangeText={(title) => onChange({ title })}
          value={values.title}
          invalid={Boolean(errors.title)}
        />
      </Field>
      <ProjectPicker
        value={values.projectId}
        onChange={(projectId) => onChange({ projectId })}
        required={mode === 'create'}
        disabled={mode === 'edit'}
        error={errors.projectId ?? null}
        {...(mode === 'edit' ? { hint: 'A task stays in the project it was created in' } : {})}
      />
      {mode === 'create' ? (
        <UserPicker
          label="Assign to"
          value={values.assignedToId ? [values.assignedToId] : []}
          onChange={(ids) => onChange({ assignedToId: ids[0] ?? null })}
          filter={isWorker}
          placeholder="Nobody yet (saved as a draft)"
          hint="Assigning somebody makes it Assigned; without one it stays a draft"
        />
      ) : null}
      <ChipGroup<Priority>
        label="Priority"
        options={PRIORITIES}
        selected={values.priority}
        onSelect={(priority) => onChange({ priority })}
        labelFor={(priority) => PRIORITY_LABELS[priority]}
      />
      <SelectField
        label="Category"
        icon="pricetags-outline"
        options={categoryOptions}
        value={[values.categoryId ?? DEFAULT_CATEGORY]}
        onChange={(ids) => onChange({ categoryId: ids[0] || null })}
        loading={categoriesLoading}
      />
      <DateTimeField
        label="Due date"
        value={values.dueDate}
        onChange={(dueDate) => onChange({ dueDate })}
      />
      <View style={{ gap: theme.spacing.md }}>
        <DateTimeField
          label="Starts"
          mode="datetime"
          value={values.scheduledStartAt}
          onChange={(scheduledStartAt) => onChange({ scheduledStartAt })}
          hint="Until then it waits in Upcoming and cannot be started"
        />
        <DateTimeField
          label="Expected completion"
          mode="datetime"
          value={values.dueAt}
          onChange={(dueAt) => onChange({ dueAt })}
          hint="What the on-time indicator measures"
        />
      </View>
      <Field label="Description">
        <Input
          accessibilityLabel="Description"
          multiline
          numberOfLines={4}
          maxLength={5000}
          onChangeText={(description) => onChange({ description })}
          style={{ minHeight: 96 }}
          value={values.description}
        />
      </Field>
      <ToggleRow
        label="Client-visible"
        description="When completed, an update is drafted for the client and waits for a senior to publish it"
        value={values.clientVisible}
        onChange={(clientVisible) => onChange({ clientVisible })}
      />
    </Section>
  );
}
