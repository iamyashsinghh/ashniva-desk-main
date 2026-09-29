import { PERMISSIONS, type ReleaseNoteDetail } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../shared/components/layout';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useSession } from '../auth/SessionProvider';
import { SheetButtons } from '../releases/SheetButtons';
import { useReleaseNoteWrite } from './release-note-api';
import { stepButtons, type ReleaseNoteStep, type StepButton } from './release-note-display';

/**
 * The note's workflow, pinned under the page. Steps that need a reason — asking for changes and
 * cancelling — open a sheet for it; the rest go straight to the API.
 */
export function ReleaseNoteActionBar({ note }: { note: ReleaseNoteDetail }) {
  const { can } = useSession();
  const [asking, setAsking] = useState<StepButton | null>(null);
  const step = useReleaseNoteWrite<{ step: ReleaseNoteStep; note?: string }>(
    note.id,
    (variables) => variables.step,
    { body: (variables) => (variables.note ? { note: variables.note } : {}) },
  );
  const [running, setRunning] = useState<ReleaseNoteStep | null>(null);

  const buttons = stepButtons(note.status, {
    write: can(PERMISSIONS.RELEASE_NOTE_WRITE),
    approve: can(PERMISSIONS.RELEASE_NOTE_APPROVE),
    publish: can(PERMISSIONS.RELEASE_NOTE_PUBLISH),
  });
  if (buttons.length === 0) {
    return null;
  }

  const press = async (button: StepButton) => {
    if (button.needsNote) {
      step.reset();
      setAsking(button);
      return;
    }
    setRunning(button.step);
    await step.run({ step: button.step });
    setRunning(null);
  };

  return (
    <>
      <StickyActionBar
        note={
          step.error && !asking ? (
            <Banner tone="danger" role="alert">
              {step.error}
            </Banner>
          ) : undefined
        }
      >
        {buttons.map((button) => (
          <Grow key={button.step}>
            <Button
              label={button.label}
              icon={button.icon}
              variant={button.variant}
              loading={running === button.step}
              disabled={step.busy && running !== button.step}
              onPress={() => void press(button)}
            />
          </Grow>
        ))}
      </StickyActionBar>
      {asking ? (
        <ReasonSheet
          button={asking}
          busy={step.busy}
          error={step.error}
          onClose={() => setAsking(null)}
          onConfirm={async (reason) => {
            const done = await step.run({ step: asking.step, note: reason });
            if (done) {
              setAsking(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

function ReasonSheet({
  button,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  button: StepButton;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const cancelling = button.step === 'cancel';

  return (
    <Sheet
      visible
      title={button.label}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={button.label}
          confirmIcon={button.icon}
          danger={cancelling}
          busy={busy}
          disabled={trimmed.length === 0}
          onCancel={onClose}
          onConfirm={() => void onConfirm(trimmed)}
        />
      }
    >
      <AppText size="sm" tone="muted">
        {cancelling
          ? 'A cancelled note is never published. It can be reopened as a draft later.'
          : 'The note goes back to its writer with your reason at the top.'}
      </AppText>
      <Field label="Reason" required hint="The next person to pick this up will read it.">
        <Input
          accessibilityLabel="Reason"
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={reason}
          onChangeText={setReason}
        />
      </Field>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
