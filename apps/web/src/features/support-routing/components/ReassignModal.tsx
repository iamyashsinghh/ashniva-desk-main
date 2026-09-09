import type { TicketDetail } from '@ashniva/types';
import { Alert, Button, FormField, Modal, Select, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useSupportConfigQuery } from '../api';

export interface ReassignModalProps {
  ticket: TicketDetail;
  onSave: (input: { assignedToId: string; reason: string }) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Putting a ticket on somebody by hand.
 *
 * The reason is required, and the button stays disabled without one, because the specification
 * asks that reassignment be allowed "only with a compulsory reason" — and because a reassignment
 * with no reason is precisely the audit row that turns out to be useless later. The API enforces
 * it too; this only saves the round trip.
 */
export function ReassignModal({ ticket, onSave, onClose }: ReassignModalProps) {
  const [assignedToId, setAssignedToId] = useState('');
  const [reason, setReason] = useState('');
  const { error, wrap } = useSubmitHandler(onClose);
  // The project's own team, so the picker offers the people who could actually take it.
  const config = useSupportConfigQuery(ticket.project?.id, Boolean(ticket.project?.id));

  const people = (config.data?.team ?? [])
    .filter((member) => member.userId !== ticket.assignedTo?.id)
    .map((member) => ({
      value: member.userId,
      label: `${member.user.name} · ${member.effectiveStatus === 'AVAILABLE' ? 'available' : 'unavailable'}`,
    }));

  const submit = wrap(() => onSave({ assignedToId, reason: reason.trim() }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Reassign this ticket"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!assignedToId || reason.trim().length < 3}
            disabledReason="Choose somebody and say why"
            onClick={() => void submit()}
          >
            Reassign
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="muted">
        The router will leave this alone afterwards. Somebody with the support-routing permission
        can put it back on the automatic path.
      </p>
      <FormField label="Assign to" required>
        <Select
          options={people}
          placeholder={people.length > 0 ? 'Choose somebody' : 'This project has no other members'}
          value={assignedToId}
          onChange={(event) => setAssignedToId(event.target.value)}
        />
      </FormField>
      <FormField label="Reason" required hint="Recorded in the audit history and on the ticket.">
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
    </Modal>
  );
}
