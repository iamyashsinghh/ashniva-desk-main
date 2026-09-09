import type { MilestoneDetail } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useMilestoneMutations } from '../api';

/** Manual progress override; the reason is mandatory and lands in the history and audit log. */
export function ProgressModal({
  milestone,
  onClose,
}: {
  milestone: MilestoneDetail;
  onClose: () => void;
}) {
  const { adjustProgress } = useMilestoneMutations(milestone.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [percent, setPercent] = useState(String(milestone.progressPercent));
  const [reason, setReason] = useState('');
  const value = Number(percent);
  const valid = reason.trim().length >= 3 && value >= 0 && value <= 100;
  return (
    <Modal
      open
      title="Adjust progress"
      onClose={onClose}
      footer={
        <>
          {milestone.progressMode === 'MANUAL' ? (
            <Button
              variant="ghost"
              disabled={reason.trim().length < 3}
              disabledReason="Give a reason"
              onClick={() =>
                void wrap(() =>
                  adjustProgress.mutateAsync({
                    progressPercent: value || 0,
                    reason: reason.trim(),
                    resetToAuto: true,
                  }),
                )()
              }
            >
              Back to automatic
            </Button>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={adjustProgress.isPending}
            disabled={!valid}
            disabledReason="Percent 0–100 and a reason are required"
            onClick={() =>
              void wrap(() =>
                adjustProgress.mutateAsync({ progressPercent: value, reason: reason.trim() }),
              )()
            }
          >
            Save
          </Button>
        </>
      }
    >
      <FormField label="Progress (%)" required>
        <Input
          type="number"
          min={0}
          max={100}
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
        />
      </FormField>
      <FormField label="Reason" required hint="Recorded in the history and audit log">
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
