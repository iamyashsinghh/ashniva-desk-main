import type { TestEnvironmentRow } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Banner } from '../../../shared/components/feedback';
import { Segmented } from '../../../shared/components/navigation-list';
import { AppText, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { SheetFooter } from '../qa-controls';
import { ENVIRONMENT_OPTIONS, ENVIRONMENT_STATUS_OPTIONS } from '../qa-labels';
import {
  environmentBody,
  initialEnvironmentForm,
  isEnvironmentValid,
  type EnvironmentForm,
} from './environment-form';

/** Record or update one deployed environment a tester can reach. */
export function EnvironmentFormView({
  projectId,
  existing,
  onDone,
}: {
  projectId: string;
  existing?: TestEnvironmentRow;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<EnvironmentForm>(() => initialEnvironmentForm(existing));
  const set = <K extends keyof EnvironmentForm>(key: K, value: EnvironmentForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = useApiMutation<EnvironmentForm, TestEnvironmentRow>({
    path: existing ? `/environments/${existing.id}` : `/projects/${projectId}/environments`,
    method: existing ? 'PATCH' : 'POST',
    body: (values) => environmentBody(values, Boolean(existing)),
    invalidate: [['qa', 'environments', projectId]],
    onSuccess: onDone,
  });
  const valid = isEnvironmentValid(form);

  return (
    <>
      {existing ? null : (
        <View style={{ gap: theme.spacing.xs }}>
          <AppText size="sm" weight="medium">
            Environment
          </AppText>
          <Segmented
            options={ENVIRONMENT_OPTIONS}
            value={form.kind}
            onChange={(value) => set('kind', value)}
            label="Environment"
          />
        </View>
      )}
      <Field label="URL" required hint="Where a tester goes, e.g. https://staging.acme.test">
        <Input
          accessibilityLabel="URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={form.url}
          onChangeText={(value) => set('url', value)}
        />
      </Field>
      <SelectField
        label="Status"
        options={ENVIRONMENT_STATUS_OPTIONS}
        value={[form.status]}
        onChange={(values) => set('status', values[0] ?? form.status)}
      />
      <Field label="Deployed version">
        <Input
          accessibilityLabel="Deployed version"
          autoCapitalize="none"
          value={form.deployedVersion}
          onChangeText={(value) => set('deployedVersion', value)}
        />
      </Field>
      <DateTimeField
        label="Deployed at"
        mode="datetime"
        value={form.deployedAt}
        onChange={(value) => set('deployedAt', value)}
      />
      <Field
        label="GitHub environment"
        hint="The matching GitHub environment name, so deploy webhooks land here"
      >
        <Input
          accessibilityLabel="GitHub environment"
          autoCapitalize="none"
          autoCorrect={false}
          value={form.githubEnvironmentName}
          onChangeText={(value) => set('githubEnvironmentName', value)}
        />
      </Field>
      {valid ? null : (
        <AppText size="xs" tone="muted">
          An environment needs the URL a tester actually opens.
        </AppText>
      )}
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <SheetFooter
          confirmLabel="Save"
          confirmIcon="checkmark"
          busy={save.busy}
          disabled={!valid}
          onCancel={onDone}
          onConfirm={() => void save.run(form)}
        />
      </View>
    </>
  );
}
