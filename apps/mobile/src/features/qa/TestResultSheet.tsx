import {
  TEST_RESULT,
  type FileSummary,
  type TestingAssignmentDetail,
  type TestResult,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { EvidencePicker } from './EvidencePicker';
import { SheetFooter } from './qa-controls';
import { evidenceTarget, missingResultFields } from './qa-display';
import { ResultFields, type ResultForm } from './ResultFields';

const OUTCOMES: readonly SegmentOption<TestResult>[] = [
  { value: TEST_RESULT.PASS, label: 'Passed', icon: 'checkmark-circle-outline' },
  { value: TEST_RESULT.FAIL, label: 'Failed', icon: 'close-circle-outline' },
];

/**
 * The pass/fail sheet — every field the web form has.
 *
 * The narrative fields are required on both outcomes and the failure fields on top of them, the
 * same rule the API enforces. It is repeated here so the tester who has just reproduced a bug on a
 * train finds out before they submit, while the detail is still in their head.
 */
export function TestResultSheet({
  assignment,
  initialOutcome = TEST_RESULT.PASS,
  onClose,
  onRecorded,
}: {
  assignment: TestingAssignmentDetail;
  initialOutcome?: TestResult;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [evidence, setEvidence] = useState<FileSummary | null>(null);
  const [form, setForm] = useState<ResultForm>({
    result: initialOutcome,
    environment: assignment.environment,
    whatTested: assignment.whatToTest?.slice(0, 500) ?? '',
    actualResult: '',
    failureDescription: '',
    severity: null,
    browserDevice: assignment.browserDevice[0] ?? '',
    commentForDeveloper: '',
    retestRequired: false,
  });

  const record = useApiMutation<
    { form: ResultForm; evidenceFileId: string | undefined },
    TestingAssignmentDetail
  >({
    path: `/qa/assignments/${assignment.id}/result`,
    body: (variables) => resultBody(variables.form, variables.evidenceFileId),
    invalidate: [['qa'], ['tasks'], ['tickets'], ['releases']],
    onSuccess: onRecorded,
  });

  const failing = form.result === TEST_RESULT.FAIL;
  const missing = missingResultFields(form);

  return (
    <Sheet
      visible
      title="Record a test result"
      subtitle={assignment.subjectLabel}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetFooter
          confirmLabel={failing ? 'Record failure' : 'Record pass'}
          confirmIcon={failing ? 'close-circle-outline' : 'checkmark-circle-outline'}
          danger={failing}
          busy={record.busy}
          disabled={missing.length > 0}
          onCancel={onClose}
          onConfirm={() => void record.run({ form, evidenceFileId: evidence?.id })}
        />
      }
    >
      <Segmented
        options={OUTCOMES}
        value={form.result}
        onChange={(result) => setForm({ ...form, result })}
        label="Outcome"
      />
      <ResultFields form={form} onChange={setForm} />
      <EvidencePicker target={evidenceTarget(assignment)} file={evidence} onChange={setEvidence} />
      {missing.length > 0 ? (
        <AppText size="xs" tone="muted">
          Still needed: {missing.join(', ')}.
        </AppText>
      ) : null}
      {record.error ? (
        <Banner tone="danger" role="alert">
          {record.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}

/** The body `POST /qa/assignments/:id/result` takes; optional fields only when they say something. */
export function resultBody(form: ResultForm, evidenceFileId: string | undefined) {
  const failing = form.result === TEST_RESULT.FAIL;
  const optional = (value: string) => value.trim() || undefined;
  return {
    result: form.result,
    environment: form.environment,
    whatTested: form.whatTested.trim(),
    actualResult: form.actualResult.trim(),
    failureDescription: failing ? form.failureDescription.trim() : undefined,
    severity: failing && form.severity ? form.severity : undefined,
    browserDevice: optional(form.browserDevice),
    commentForDeveloper: optional(form.commentForDeveloper),
    retestRequired: failing ? form.retestRequired : false,
    evidenceFileId,
  };
}
