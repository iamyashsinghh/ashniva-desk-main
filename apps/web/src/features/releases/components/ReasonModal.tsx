import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';

/**
 * A release action that will not go through until the operator says why.
 *
 * Rolling back and reopening are the two of them, and they are the same shape: one required
 * paragraph, one confirming button, and a sentence saying what the move costs. The API refuses
 * either without a reason, so the disabled button here is a courtesy — it explains the refusal
 * before the round trip rather than replacing it.
 */
export function ReasonModal({
  title,
  consequence,
  label,
  hint,
  confirmLabel,
  confirmVariant,
  missingReason,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  consequence: string;
  label: string;
  hint: string;
  confirmLabel: string;
  confirmVariant: 'primary' | 'danger';
  /** What the button says while it is off, so "why can't I click this" never needs asking. */
  missingReason: string;
  pending: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const { error, wrap } = useSubmitHandler(onClose);

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={confirmVariant}
            loading={pending}
            // Three characters is the API's own minimum; anything shorter is refused there too.
            disabled={reason.trim().length < 3}
            disabledReason={missingReason}
            onClick={() => void wrap(() => onConfirm(reason.trim()))()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{consequence}</p>
      <FormField label={label} required hint={hint}>
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
