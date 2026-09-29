import { PRIORITY_LABELS, type Priority, type ProjectSummary } from '@ashniva/types';
import { useMemo } from 'react';

import { useResource } from '../../shared/api/queries';
import { ChipGroup } from '../../shared/components/chips';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Section } from '../../shared/components/layout';
import { UserPicker } from '../../shared/components/pickers';
import { Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  PRIORITIES,
  isIntern,
  projectOptions,
  type InternWorkErrors,
  type InternWorkValues,
} from './intern-work';

const ACTIVE_PROJECTS_KEY = ['projects', 'list', { status: 'ACTIVE' }] as const;

/** The assignment's fields, in the web form's order. */
export function InternWorkFormFields({
  values,
  onChange,
  errors,
}: {
  values: InternWorkValues;
  onChange: (patch: Partial<InternWorkValues>) => void;
  errors: InternWorkErrors;
}) {
  const theme = useTheme();
  const projects = useResource<ProjectSummary[]>(ACTIVE_PROJECTS_KEY, '/projects', {
    query: { status: 'ACTIVE' },
  });
  const { data } = projects;
  const options = useMemo(() => projectOptions(data ?? []), [data]);

  return (
    <Section title="Assignment" icon="school-outline" style={{ gap: theme.spacing.md }}>
      <Field label="Title" required {...(errors.title ? { error: errors.title } : {})}>
        <Input
          accessibilityLabel="Title"
          placeholder="What should the intern deliver?"
          maxLength={200}
          value={values.title}
          onChangeText={(title) => onChange({ title })}
          invalid={Boolean(errors.title)}
        />
      </Field>
      <Field label="Brief" hint="Context, links and acceptance notes for the intern.">
        <Input
          accessibilityLabel="Brief"
          placeholder="Describe the work clearly. The intern will reply and attach files on this task."
          multiline
          numberOfLines={5}
          maxLength={5000}
          style={{ minHeight: 120 }}
          value={values.description}
          onChangeText={(description) => onChange({ description })}
        />
      </Field>
      <SelectField
        label="Project"
        icon="folder-outline"
        options={options}
        value={values.projectId ? [values.projectId] : []}
        onChange={(ids) => onChange({ projectId: ids[0] ?? null })}
        allowClear
        clearLabel="No project"
        placeholder="No project"
        loading={projects.isLoading}
        hint="Optional. Leave blank for general learning work — it will sit under Intern work."
      />
      <UserPicker
        label="Intern"
        value={values.assignedToId ? [values.assignedToId] : []}
        onChange={(ids) => onChange({ assignedToId: ids[0] ?? null })}
        filter={isIntern}
        allowClear={false}
        placeholder="Pick an intern"
        required
        {...(errors.assignedToId ? { error: errors.assignedToId } : {})}
      />
      <DateTimeField
        label="Due date"
        value={values.dueDate}
        onChange={(dueDate) => onChange({ dueDate })}
      />
      <ChipGroup<Priority>
        label="Priority"
        options={PRIORITIES}
        selected={values.priority}
        onSelect={(priority) => onChange({ priority })}
        labelFor={(priority) => PRIORITY_LABELS[priority]}
      />
    </Section>
  );
}
