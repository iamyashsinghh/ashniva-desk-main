import { TEST_RESULT, type TestEnvironment } from '@ashniva/types';
import { View } from 'react-native';

import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { SwitchRow } from './qa-controls';
import type { ResultDraft } from './qa-display';
import { ENVIRONMENT_OPTIONS, SEVERITY_OPTIONS } from './qa-labels';

export interface ResultForm extends ResultDraft {
  environment: TestEnvironment;
  browserDevice: string;
  commentForDeveloper: string;
  retestRequired: boolean;
}

const multiline = { multiline: true, numberOfLines: 3, style: { minHeight: 88 } } as const;

/** The pass/fail form's fields; the failure ones appear only when the outcome is a failure. */
export function ResultFields({
  form,
  onChange,
}: {
  form: ResultForm;
  onChange: (next: ResultForm) => void;
}) {
  const theme = useTheme();
  const set = <K extends keyof ResultForm>(key: K, value: ResultForm[K]) =>
    onChange({ ...form, [key]: value });
  const failing = form.result === TEST_RESULT.FAIL;

  return (
    <>
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
      <Field label="Browser / device" hint="Where you saw this, e.g. Chrome 131 on Windows">
        <Input
          accessibilityLabel="Browser or device"
          value={form.browserDevice}
          onChangeText={(value) => set('browserDevice', value)}
          maxLength={200}
        />
      </Field>
      <Field label="What you tested" required>
        <Input
          accessibilityLabel="What you tested"
          value={form.whatTested}
          onChangeText={(value) => set('whatTested', value)}
          maxLength={5000}
          {...multiline}
        />
      </Field>
      <Field label="What actually happened" required>
        <Input
          accessibilityLabel="What actually happened"
          value={form.actualResult}
          onChangeText={(value) => set('actualResult', value)}
          maxLength={5000}
          {...multiline}
        />
      </Field>
      {failing ? (
        <>
          <Field
            label="What is broken"
            required
            hint="The developer reads this first — steps, expected, actual"
          >
            <Input
              accessibilityLabel="What is broken"
              value={form.failureDescription}
              onChangeText={(value) => set('failureDescription', value)}
              maxLength={5000}
              {...multiline}
            />
          </Field>
          <SelectField
            label="Severity"
            required
            icon="warning-outline"
            options={SEVERITY_OPTIONS}
            value={form.severity ? [form.severity] : []}
            onChange={(values) => set('severity', values[0] ?? null)}
            placeholder="How bad is it?"
            allowClear={false}
          />
          <SwitchRow
            label="Needs a retest once it is fixed"
            description="Keeps this in the retest queue instead of closing it."
            value={form.retestRequired}
            onChange={(value) => set('retestRequired', value)}
          />
        </>
      ) : null}
      <Field label="Comment for the developer" hint="Optional. Internal — never shown to a client.">
        <Input
          accessibilityLabel="Comment for the developer"
          value={form.commentForDeveloper}
          onChangeText={(value) => set('commentForDeveloper', value)}
          maxLength={5000}
          multiline
          numberOfLines={2}
          style={{ minHeight: 72 }}
        />
      </Field>
    </>
  );
}
