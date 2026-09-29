import { PERMISSIONS, type ProjectDetail } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { Button, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import {
  initialProjectForm,
  projectPayload,
  validateProjectForm,
  type ProjectBody,
  type ProjectFormState,
} from './project-form';
import { ProjectFormFields } from './ProjectFormFields';

/**
 * Create a project, or edit one: the same fields as the web form.
 *
 * Editing loads the project first and only then builds the form, so the fields start from what is
 * saved rather than from blanks that a quick "Save" would write over it.
 */
export function ProjectFormScreen({
  projectId,
  onSaved,
}: {
  /** Omit to create a project. */
  projectId?: string;
  onSaved: (projectId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const query = useResource<ProjectDetail>(['projects', projectId], `/projects/${projectId}`, {
    enabled: Boolean(projectId),
  });

  if (!can(PERMISSIONS.PROJECT_MANAGE)) {
    return (
      <Screen>
        <View style={{ padding: theme.spacing.screen }}>
          <Banner tone="warning" title="Not available to you">
            Creating and editing projects needs the project management permission.
          </Banner>
        </View>
      </Screen>
    );
  }
  if (projectId && !query.data) {
    return (
      <Screen>
        {query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            offline={query.error instanceof Error && query.error.name === 'NetworkError'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingState label="Loading the project" variant="spinner" />
        )}
      </Screen>
    );
  }
  return <ProjectForm project={query.data ?? null} onSaved={onSaved} />;
}

function ProjectForm({
  project,
  onSaved,
}: {
  project: ProjectDetail | null;
  onSaved: (projectId: string) => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const { user } = useSession();
  const editing = project !== null;
  const [form, setForm] = useState<ProjectFormState>(() => initialProjectForm(project, user));
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateProjectForm(form, editing) : {};

  const save = useApiMutation<ProjectBody, ProjectDetail>({
    path: project ? `/projects/${project.id}` : '/projects',
    method: project ? 'PATCH' : 'POST',
    body: (body) => body,
    invalidate: [['projects'], ['dashboard']],
    onSuccess: (saved) => onSaved(saved.id),
  });

  const set = <K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) => {
    save.reset();
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    setAttempted(true);
    if (Object.keys(validateProjectForm(form, editing)).length > 0) {
      return;
    }
    void save.run(projectPayload(form, editing));
  };

  const invalid = Object.keys(errors).length > 0;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: theme.spacing.lg,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          {save.error ? (
            <Banner tone="danger" title="Could not save the project" role="alert">
              {save.error}
            </Banner>
          ) : null}
          {invalid ? (
            <Banner tone="warning">Some fields need attention before this can be saved.</Banner>
          ) : null}
          <ProjectFormFields
            form={form}
            set={set}
            errors={errors}
            editing={editing}
            savedLeadId={project?.lead?.id ?? null}
            savedManagerId={project?.manager?.id ?? null}
          />
        </ScrollView>
        <StickyActionBar>
          <Button
            label={editing ? 'Save changes' : 'Create project'}
            icon="checkmark"
            loading={save.busy}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
