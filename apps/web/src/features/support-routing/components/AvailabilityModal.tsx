import {
  AVAILABILITY_STATUS,
  AVAILABILITY_STATUS_LABELS,
  type AvailabilityStatus,
  type EffectiveAvailability,
} from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Select, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import type { AvailabilityInput } from '../api';

const OPTIONS = Object.values(AVAILABILITY_STATUS).map((status) => ({
  value: status,
  label: AVAILABILITY_STATUS_LABELS[status],
}));

export interface AvailabilityModalProps {
  member: EffectiveAvailability;
  onSave: (input: AvailabilityInput) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Recording that somebody is on leave, back, or at their limit — by hand.
 *
 * The same state normally arrives from Ashniva HR through the API, and this form writes to the
 * identical record. It is here for the cases HR does not know about: an unplanned absence, or a
 * lead deciding somebody has enough on. Whatever is recorded still has to survive the rota — a
 * person marked available outside their hours is still outside their hours.
 */
export function AvailabilityModal({ member, onSave, onClose }: AvailabilityModalProps) {
  const [status, setStatus] = useState<AvailabilityStatus>(member.status);
  const [until, setUntil] = useState(member.until ? member.until.slice(0, 10) : '');
  const [note, setNote] = useState(member.note ?? '');
  const { error, wrap } = useSubmitHandler(onClose);

  const submit = wrap(() =>
    onSave({
      status,
      // A date with no time means the end of that day, which is what "on leave until Friday" means.
      until: until ? new Date(`${until}T23:59:59.000Z`).toISOString() : null,
      note: note.trim() || null,
    }),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Availability — ${member.user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="muted">
        Last recorded {new Date(member.updatedAt).toLocaleString()} from {member.source}.
      </p>
      <FormField label="State" required>
        <Select
          options={OPTIONS}
          value={status}
          onChange={(event) => setStatus(event.target.value as AvailabilityStatus)}
        />
      </FormField>
      <FormField
        label="Applies until"
        hint="After this the rota decides again. Blank means until somebody replaces it."
      >
        <Input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
      </FormField>
      <FormField label="Note" hint="Shown to whoever configures routing. Not visible to clients.">
        <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
    </Modal>
  );
}
