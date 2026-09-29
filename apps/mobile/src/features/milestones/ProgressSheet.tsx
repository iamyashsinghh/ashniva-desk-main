import { MILESTONE_PROGRESS_MODE, type MilestoneDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { ErrorNote, SheetActions } from '../contracts/commercial-ui';
import { MILESTONE_INVALIDATES } from './milestone-display';

interface ProgressInput {
  progressPercent: number;
  reason: string;
  resetToAuto?: boolean;
}

/**
 * Overriding the automatic progress figure. The reason is mandatory because it lands in the
 * history and the audit log; "Back to automatic" needs one too, for the same reason.
 */
export function ProgressSheet({
  milestone,
  onClose,
}: {
  milestone: MilestoneDetail;
  onClose: () => void;
}) {
  const [percent, setPercent] = useState(String(milestone.progressPercent));
  const [reason, setReason] = useState('');
  const value = Number(percent);
  const percentValid = /^\d{1,3}$/.test(percent.trim()) && value >= 0 && value <= 100;
  const reasonValid = reason.trim().length >= 3;

  const adjust = useApiMutation<ProgressInput>({
    path: `/milestones/${milestone.id}/progress`,
    body: (input) => input,
    invalidate: MILESTONE_INVALIDATES,
    onSuccess: onClose,
  });

  return (
    <Sheet
      visible
      title="Adjust progress"
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Save"
          confirmIcon="checkmark"
          busy={adjust.busy}
          disabled={!percentValid || !reasonValid}
          onCancel={onClose}
          onConfirm={() => void adjust.run({ progressPercent: value, reason: reason.trim() })}
        />
      }
    >
      <Field
        label="Progress (%)"
        required
        {...(percent.trim() && !percentValid ? { error: 'A whole number from 0 to 100.' } : {})}
      >
        <Input
          accessibilityLabel="Progress (%)"
          keyboardType="number-pad"
          maxLength={3}
          value={percent}
          onChangeText={(text) => {
            adjust.reset();
            setPercent(text);
          }}
        />
      </Field>
      <Field label="Reason" required hint="Recorded in the history and audit log.">
        <Input
          accessibilityLabel="Reason"
          multiline
          maxLength={500}
          value={reason}
          onChangeText={(text) => {
            adjust.reset();
            setReason(text);
          }}
          style={{ minHeight: 72 }}
        />
      </Field>
      {milestone.progressMode === MILESTONE_PROGRESS_MODE.MANUAL ? (
        <Button
          label="Back to automatic"
          icon="refresh-outline"
          variant="ghost"
          disabled={!reasonValid || adjust.busy}
          onPress={() =>
            void adjust.run({
              progressPercent: percentValid ? value : 0,
              reason: reason.trim(),
              resetToAuto: true,
            })
          }
        />
      ) : null}
      <ErrorNote message={adjust.error} />
    </Sheet>
  );
}
