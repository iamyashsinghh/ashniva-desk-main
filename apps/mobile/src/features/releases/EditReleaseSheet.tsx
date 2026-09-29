import type { ReleaseDetail, TestEnvironment } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { RELEASE_INVALIDATES } from './release-api';
import { ENVIRONMENT_OPTIONS, versionProblem } from './release-display';
import { SheetButtons } from './SheetButtons';

interface EditForm {
  version: string;
  title: string;
  environment: TestEnvironment;
  notes: string;
}

/**
 * Version, title, notes and environment, while the release is still a draft.
 *
 * The version is editable here and nowhere else: from the moment approval is requested it is what
 * the approvers signed and what the operator types back at publish. Cleared notes are sent as
 * null, which is how the API is told to remove them rather than leave them alone.
 */
export function EditReleaseSheet({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<EditForm>({
    version: release.version,
    title: release.title,
    environment: release.environment,
    notes: release.notes ?? '',
  });
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useApiMutation<EditForm, ReleaseDetail>({
    path: `/releases/${release.id}`,
    method: 'PATCH',
    body: (values) => ({
      version: values.version.trim(),
      title: values.title.trim(),
      environment: values.environment,
      notes: values.notes.trim() || null,
    }),
    invalidate: RELEASE_INVALIDATES,
    onSuccess: onClose,
  });

  const badVersion = versionProblem(form.version);
  const valid = form.version.trim().length > 0 && !badVersion && form.title.trim().length >= 3;

  return (
    <Sheet
      visible
      title={`Edit ${release.version}`}
      subtitle={release.projectName}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetButtons
          confirmLabel="Save"
          confirmIcon="checkmark"
          busy={save.busy}
          disabled={!valid}
          onCancel={onClose}
          onConfirm={() => void save.run(form)}
        />
      }
    >
      <Field
        label="Version"
        required
        hint="Letters, digits, . _ + and - — it is typed back to confirm the publish"
        error={badVersion}
      >
        <Input
          accessibilityLabel="Version"
          autoCapitalize="none"
          autoCorrect={false}
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
        label="Notes"
        hint="Internal: the plan, and what to watch after it goes out. Never shown to a client."
      >
        <Input
          accessibilityLabel="Notes"
          multiline
          numberOfLines={4}
          style={{ minHeight: 96 }}
          value={form.notes}
          onChangeText={(value) => set('notes', value)}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
