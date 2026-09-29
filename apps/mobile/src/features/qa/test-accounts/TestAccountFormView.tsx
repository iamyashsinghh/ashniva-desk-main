import type { TestAccountSummary, TestEnvironmentRow } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Segmented } from '../../../shared/components/navigation-list';
import { AppText, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { SheetFooter, SwitchRow } from '../qa-controls';
import { ENVIRONMENT_LABELS, ENVIRONMENT_OPTIONS, ROTATION_POLICY_OPTIONS } from '../qa-labels';
import {
  createAccountBody,
  initialAccountForm,
  missingAccountFields,
  updateAccountBody,
  type AccountForm,
} from './test-account-form';

/**
 * Record or edit one test login.
 *
 * The password field exists only when recording a new login, and is a secure entry with
 * autofill off: the value is typed once, sent, and dropped with this view.
 */
export function TestAccountFormView({
  projectId,
  environments,
  existing,
  onDone,
}: {
  projectId: string;
  environments: readonly TestEnvironmentRow[];
  existing?: TestAccountSummary;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<AccountForm>(() => initialAccountForm(existing));
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  // The form is read from state, not passed as variables, so the password never lands in the
  // mutation cache, which keeps a write's variables after it finishes.
  const save = useApiMutation<void, TestAccountSummary>({
    path: existing ? `/test-accounts/${existing.id}` : `/projects/${projectId}/test-accounts`,
    method: existing ? 'PATCH' : 'POST',
    body: () => (existing ? updateAccountBody(form) : createAccountBody(form)),
    invalidate: [['qa']],
    onSuccess: onDone,
  });
  const missing = missingAccountFields(form, Boolean(existing));
  const deployments = environments.map((environment) => ({
    value: environment.id,
    label: `${ENVIRONMENT_LABELS[environment.kind]} — ${environment.url}`,
  }));

  return (
    <>
      <Field label="Label" required hint="How testers refer to it, e.g. Test Admin">
        <Input
          accessibilityLabel="Label"
          value={form.label}
          onChangeText={(value) => set('label', value)}
        />
      </Field>
      <Field label="Username" required>
        <Input
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={form.username}
          onChangeText={(value) => set('username', value)}
        />
      </Field>
      {existing ? null : (
        <>
          <Field
            label="Password"
            required
            hint="Encrypted at rest. Revealing it later is timed and logged."
          >
            <Input
              accessibilityLabel="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              value={form.secret}
              onChangeText={(value) => set('secret', value)}
            />
          </Field>
          <View style={{ gap: theme.spacing.xs }}>
            <AppText size="sm" weight="medium">
              Environment
            </AppText>
            <Segmented
              options={ENVIRONMENT_OPTIONS}
              value={form.environment}
              onChange={(value) => set('environment', value)}
              label="Environment"
            />
          </View>
        </>
      )}
      <SelectField
        label="Deployed environment"
        hint="Optional: the exact deployment this login is for"
        options={deployments}
        value={form.environmentId ? [form.environmentId] : []}
        onChange={(values) => set('environmentId', values[0] ?? '')}
        placeholder="Not tied to one"
        allowClear
        clearLabel="Not tied to one"
      />
      <SelectField
        label="Password changes"
        options={ROTATION_POLICY_OPTIONS}
        value={[form.rotationPolicy]}
        onChange={(values) => set('rotationPolicy', values[0] ?? form.rotationPolicy)}
      />
      <Field label="Notes" hint="OTP route, fixed test card, anything a tester needs">
        <Input
          accessibilityLabel="Notes"
          value={form.notes}
          onChangeText={(value) => set('notes', value)}
          multiline
          numberOfLines={2}
          style={{ minHeight: 72 }}
        />
      </Field>
      {existing ? (
        <SwitchRow
          label="In use"
          description="Retiring a login stops new grants against it."
          value={form.isActive}
          onChange={(value) => set('isActive', value)}
        />
      ) : null}
      {missing.length > 0 ? (
        <AppText size="xs" tone="muted">
          Still needed: {missing.join(', ')}.
        </AppText>
      ) : null}
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
          disabled={missing.length > 0}
          onCancel={onDone}
          onConfirm={() => void save.run()}
        />
      </View>
    </>
  );
}
