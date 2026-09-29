import type { ProblemDetail } from '@ashniva/types';
import { useState } from 'react';

import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useProblemWrite } from '../problem-api';
import {
  initialAnswers,
  missingAnswers,
  RCA_QUESTIONS,
  rcaBody,
  type RcaAnswers,
} from './rca-questions';

/**
 * Writing the root-cause analysis: the approved form's questions, saved as a draft or submitted.
 *
 * A ten-question form written over two days has to be saveable half-finished, so Save draft is
 * always on; Submit waits for the six the API insists on and says which are still missing.
 */
export function RcaFormSheet({
  problem,
  onClose,
}: {
  problem: ProblemDetail;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<RcaAnswers>(() => initialAnswers(problem.rca));
  const [targetDate, setTargetDate] = useState<string | null>(problem.rca?.targetDate ?? null);
  const missing = missingAnswers(answers);

  const save = useProblemWrite<boolean>({
    path: `/problems/${problem.id}/rca`,
    body: (draft) => rcaBody(answers, targetDate, draft),
    onDone: onClose,
  });

  return (
    <Sheet
      visible
      title="Root-cause analysis"
      subtitle={`${problem.key} · internal — never shown to a client`}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <>
          <Button
            label="Save draft"
            icon="save-outline"
            variant="secondary"
            loading={save.busy}
            onPress={() => void save.run(true)}
            style={{ flex: 1 }}
          />
          <Button
            label="Submit"
            icon="send-outline"
            loading={save.busy}
            disabled={missing.length > 0}
            onPress={() => void save.run(false)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      {RCA_QUESTIONS.map((question, index) => (
        <Field
          key={question.key}
          label={`${index + 1}. ${question.label}`}
          required={question.required}
        >
          <Input
            accessibilityLabel={question.label}
            value={answers[question.key]}
            onChangeText={(text) => setAnswers((current) => ({ ...current, [question.key]: text }))}
            multiline
            numberOfLines={3}
            maxLength={5000}
            style={{ minHeight: 88 }}
          />
        </Field>
      ))}
      <Field label="9. Owner">
        <AppText tone={problem.rca?.owner ? 'default' : 'muted'}>
          {problem.rca?.owner?.name ?? problem.owner?.name ?? 'Not named'}
        </AppText>
      </Field>
      <DateTimeField label="10. Target date" value={targetDate} onChange={setTargetDate} />
      {missing.length > 0 ? (
        <AppText size="xs" tone="muted">
          Still to answer before submitting: {missing.join(', ')}
        </AppText>
      ) : null}
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
