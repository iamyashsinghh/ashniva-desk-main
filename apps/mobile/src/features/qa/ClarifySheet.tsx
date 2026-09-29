import type { TestingAssignmentDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { SheetFooter } from './qa-controls';

/** Ask the developer a question. The assignment waits in Clarification until it is answered. */
export function ClarifySheet({
  assignmentId,
  onClose,
  onSent,
}: {
  assignmentId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [question, setQuestion] = useState('');
  const clarify = useApiMutation<{ question: string }, TestingAssignmentDetail>({
    path: `/qa/assignments/${assignmentId}/clarify`,
    body: (variables) => variables,
    invalidate: [['qa']],
    onSuccess: onSent,
  });

  return (
    <Sheet
      visible
      title="Ask the developer"
      subtitle="Testing pauses until this is answered, so ask everything you need in one go."
      onClose={onClose}
      footer={
        <SheetFooter
          confirmLabel="Send the question"
          confirmIcon="send"
          busy={clarify.busy}
          disabled={question.trim().length < 3}
          onCancel={onClose}
          onConfirm={() => void clarify.run({ question: question.trim() })}
        />
      }
    >
      <Field label="What do you need to know?" required>
        <Input
          accessibilityLabel="Your question for the developer"
          value={question}
          onChangeText={setQuestion}
          multiline
          numberOfLines={4}
          maxLength={2000}
          style={{ minHeight: 110 }}
        />
      </Field>
      {clarify.error ? (
        <Banner tone="danger" role="alert">
          {clarify.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
