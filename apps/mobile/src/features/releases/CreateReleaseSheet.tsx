import { TEST_ENVIRONMENT, type ReleaseDetail, type TestEnvironment } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Segmented } from '../../shared/components/navigation-list';
import { ProjectPicker } from '../../shared/components/pickers';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { RELEASE_INVALIDATES } from './release-api';
import { ENVIRONMENT_OPTIONS, versionProblem } from './release-display';
import { SheetButtons } from './SheetButtons';

interface CreateForm {
  projectId: string | null;
  version: string;
  title: string;
  environment: TestEnvironment;
  notes: string;
}

/**
 * Starting a release: a draft on one project, with the version everyone will sign and type back.
 *
 * `POST /releases` needs `release:manage`, the same permission the list itself needs, so the
 * button that opens this is only drawn for somebody who can use it.
 */
export function CreateReleaseSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (releaseId: string) => void;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<CreateForm>({
    projectId: null,
    version: '',
    title: '',
    environment: TEST_ENVIRONMENT.PRODUCTION,
    notes: '',
  });
  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const create = useApiMutation<CreateForm, ReleaseDetail>({
    path: '/releases',
    body: (values) => ({
      projectId: values.projectId,
      version: values.version.trim(),
      title: values.title.trim(),
      environment: values.environment,
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    }),
    invalidate: RELEASE_INVALIDATES,
    onSuccess: (release) => onCreated(release.id),
  });

  const badVersion = versionProblem(form.version);
  const valid =
    Boolean(form.projectId) &&
    form.version.trim().length > 0 &&
    !badVersion &&
    form.title.trim().length >= 3;

  return (
    <Sheet
      visible
      title="New release"
      subtitle="Starts as a draft; nothing ships until it is approved and published"
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetButtons
          confirmLabel="Create draft"
          confirmIcon="add"
          busy={create.busy}
          disabled={!valid}
          onCancel={onClose}
          onConfirm={() => void create.run(form)}
        />
      }
    >
      <ProjectPicker
        value={form.projectId}
        onChange={(id) => set('projectId', id)}
        required
        hint="A release carries one project's work, never another client's"
      />
      <Field
        label="Version"
        required
        hint="Typed back to confirm the publish, e.g. 2026.09.1"
        error={badVersion}
      >
        <Input
          accessibilityLabel="Version"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="2026.09.1"
          value={form.version}
          invalid={Boolean(badVersion)}
          onChangeText={(value) => set('version', value)}
        />
      </Field>
      <Field label="Title" required hint="At least three characters">
        <Input
          accessibilityLabel="Title"
          value={form.title}
          onChangeText={(value) => set('title', value)}
        />
      </Field>
      <View style={{ gap: theme.spacing.xs }}>
        <AppText size="sm" weight="medium">
          Environment
        </AppText>
        <Segmented
          label="Environment"
          options={ENVIRONMENT_OPTIONS}
          value={form.environment}
          onChange={(value) => set('environment', value)}
        />
      </View>
      <Field
        label="Plan"
        hint="Internal: what goes out and what to watch. Never shown to a client."
      >
        <Input
          accessibilityLabel="Plan"
          multiline
          numberOfLines={4}
          style={{ minHeight: 96 }}
          value={form.notes}
          onChangeText={(value) => set('notes', value)}
        />
      </Field>
      {create.error ? (
        <Banner tone="danger" role="alert">
          {create.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
