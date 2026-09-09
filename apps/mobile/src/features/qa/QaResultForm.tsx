import {
  TEST_RESULT,
  TEST_SEVERITY,
  type TestResult,
  type TestSeverity,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The pass/fail form.
 *
 * A bare "failed" helps nobody, which is why the API requires the narrative fields on a failure
 * and why this form asks for them before the button is available rather than after the request
 * comes back. A tester who has just reproduced a bug on a train has the detail in their head; a
 * tester who is told to go and add it is a tester who writes "doesn't work".
 *
 * Evidence — a screenshot — is uploaded from the task or ticket the assignment is about, and its
 * id is what this endpoint takes. There is no second upload path here for the same reason there
 * is none in the messages endpoint: one upload route, one set of rules about what may be stored.
 */
const RESULTS: readonly SegmentOption<TestResult>[] = [
  { value: TEST_RESULT.PASS, label: 'It passed' },
  { value: TEST_RESULT.FAIL, label: 'It failed' },
];

const SEVERITIES: readonly SegmentOption<TestSeverity>[] = [
  { value: TEST_SEVERITY.LOW, label: 'Low' },
  { value: TEST_SEVERITY.MEDIUM, label: 'Medium' },
  { value: TEST_SEVERITY.HIGH, label: 'High' },
  { value: TEST_SEVERITY.CRITICAL, label: 'Critical' },
];

export function QaResultForm({
  assignmentId,
  onRecorded,
}: {
  assignmentId: string;
  onRecorded: () => void;
}) {
  const theme = useTheme();
  const [result, setResult] = useState<TestResult>(TEST_RESULT.PASS);
  const [whatTested, setWhatTested] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [failureDescription, setFailureDescription] = useState('');
  const [severity, setSeverity] = useState<TestSeverity>(TEST_SEVERITY.MEDIUM);

  const record = useApiMutation<void, TestingAssignmentDetail>({
    path: `/qa/assignments/${assignmentId}/result`,
    body: () => ({
      result,
      whatTested: whatTested.trim(),
      actualResult: actualResult.trim(),
      ...(result === TEST_RESULT.FAIL
        ? {
            failureDescription: failureDescription.trim(),
            severity,
            // A failure that nobody re-checks is a failure that ships. The API defaults this to
            // false; the phone says yes, because a tester recording a failure expects to see it
            // again.
            retestRequired: true,
          }
        : {}),
    }),
    invalidate: [
      ['qa', 'assignments', assignmentId],
      ['qa', 'assignments'],
    ],
    onSuccess: onRecorded,
  });

  const failed = result === TEST_RESULT.FAIL;
  const valid =
    whatTested.trim().length >= 3 &&
    actualResult.trim().length >= 3 &&
    (!failed || failureDescription.trim().length >= 3);

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Record the result
      </AppText>

      <Segmented options={RESULTS} value={result} onChange={setResult} label="Pass or fail" />

      <Field label="What you tested" hint="The steps you took">
        <Input
          accessibilityLabel="What you tested"
          multiline
          numberOfLines={3}
          onChangeText={setWhatTested}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
          value={whatTested}
        />
      </Field>

      <Field label="What happened" hint="What the system actually did">
        <Input
          accessibilityLabel="What happened"
          multiline
          numberOfLines={3}
          onChangeText={setActualResult}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
          value={actualResult}
        />
      </Field>

      {failed ? (
        <View style={{ gap: theme.spacing.md }}>
          <Field label="What is wrong" hint="The developer reads this first">
            <Input
              accessibilityLabel="What is wrong"
              multiline
              numberOfLines={3}
              onChangeText={setFailureDescription}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
              value={failureDescription}
            />
          </Field>
          <Field label="How bad is it?">
            <Segmented
              options={SEVERITIES}
              value={severity}
              onChange={setSeverity}
              label="Severity"
            />
          </Field>
        </View>
      ) : null}

      {record.error ? (
        <AppText tone="danger" size="sm">
          {record.error}
        </AppText>
      ) : null}

      <Button
        label={failed ? 'Record the failure' : 'Record the pass'}
        loading={record.busy}
        disabled={!valid}
        onPress={() => void record.run()}
      />
      {!valid ? (
        <AppText size="xs" tone="faint">
          Say what you tested and what happened
          {failed ? ', and what is wrong' : ''}.
        </AppText>
      ) : null}
    </Card>
  );
}
