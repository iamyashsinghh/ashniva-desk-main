import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useAiSummaryStep } from './api';

export type ReasonAction = 'request-changes' | 'cancel';

/** The API's bounds on a reason. */
const MIN_LENGTH = 3;
const MAX_LENGTH = 1000;

const COPY: Record<ReasonAction, { title: string; confirm: string; hint: string }> = {
  'request-changes': {
    title: 'Send back for changes',
    confirm: 'Send back',
    hint: 'Say what to change, so the next person knows.',
  },
  cancel: {
    title: 'Cancel this summary',
    confirm: 'Cancel summary',
    hint: 'Say why, so the history explains it.',
  },
};

/** Both steps that need a reason share this, because both refuse an empty one. */
export function ReasonSheet({
  summaryId,
  action,
  onClose,
}: {
  summaryId: string;
  action: ReasonAction | null;
  onClose: () => void;
}) {
  const step = useAiSummaryStep(summaryId);
  const [note, setNote] = useState('');
  const copy = COPY[action ?? 'cancel'];
  const trimmed = note.trim();

  const close = () => {
    setNote('');
    step.reset();
    onClose();
  };

  const confirm = async () => {
    if (!action) {
      return;
    }
    if (await step.run({ step: action, note: trimmed })) {
      close();
    }
  };

  return (
    <Sheet
      visible={action !== null}
      title={copy.title}
      onClose={close}
      footer={
        <>
          <Button label="Close" variant="secondary" onPress={close} style={{ flex: 1 }} />
          <Button
            label={copy.confirm}
            variant={action === 'cancel' ? 'danger' : 'primary'}
            loading={step.busy}
            disabled={trimmed.length < MIN_LENGTH}
            onPress={() => void confirm()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Reason" required hint={copy.hint}>
        <Input
          multiline
          value={note}
          onChangeText={setNote}
          maxLength={MAX_LENGTH}
          accessibilityLabel="Reason"
          style={{ minHeight: 110 }}
        />
      </Field>
      {step.error ? (
        <Banner tone="danger" role="alert">
          {step.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
