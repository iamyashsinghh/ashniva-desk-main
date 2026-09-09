import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useQaMutations } from '../api';

/** Ask the developer a question. The assignment waits in Clarification until it is answered. */
export function ClarifyModal({
  assignmentId,
  onClose,
}: {
  assignmentId: string;
  onClose: () => void;
}) {
  const { clarify } = useQaMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [question, setQuestion] = useState('');

  return (
    <Modal
      open
      title="Ask the developer"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={clarify.isPending}
            disabled={question.trim().length < 3}
            disabledReason="Write the question first"
            onClick={() =>
              void wrap(() =>
                clarify.mutateAsync({ id: assignmentId, question: question.trim() }),
              )()
            }
          >
            Send the question
          </Button>
        </>
      }
    >
      <FormField
        label="What do you need to know?"
        required
        hint="Testing pauses until this is answered, so ask everything you need in one go."
      >
        <Textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
