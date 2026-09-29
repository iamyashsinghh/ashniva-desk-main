import type { DirectoryEntry, TicketDetail } from '@ashniva/types';
import { useCallback, useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { isWorker } from '../ticket-display';

/**
 * Putting a ticket on somebody by hand.
 *
 * The reason is required and the button stays disabled without one, as on the web: a
 * reassignment with no reason is precisely the audit row that turns out to be useless later. The
 * API enforces it too; this only saves the round trip.
 */
export function ReassignSheet({
  visible,
  ticket,
  busy,
  error,
  onClose,
  onSave,
}: {
  visible: boolean;
  ticket: TicketDetail;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: { assignedToId: string; reason: string }) => void;
}) {
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const currentId = ticket.assignedTo?.id;
  const candidate = useCallback(
    (person: DirectoryEntry) => isWorker(person) && person.id !== currentId,
    [currentId],
  );
  const valid = Boolean(assignedToId) && reason.trim().length >= 3;

  return (
    <Sheet
      visible={visible}
      title="Reassign this ticket"
      subtitle={ticket.assignedTo ? `Currently ${ticket.assignedTo.name}` : 'Nobody has it yet'}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Reassign"
            icon="swap-horizontal"
            loading={busy}
            disabled={!valid}
            onPress={() =>
              assignedToId ? onSave({ assignedToId, reason: reason.trim() }) : undefined
            }
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <AppText size="sm" tone="muted">
        The router will leave this alone afterwards. Somebody with the support-routing permission
        can put it back on the automatic path.
      </AppText>
      <UserPicker
        label="Assign to"
        required
        value={assignedToId ? [assignedToId] : []}
        onChange={(ids) => setAssignedToId(ids[0] ?? null)}
        filter={candidate}
        allowClear={false}
        placeholder="Choose somebody"
      />
      <Field label="Reason" required hint="Recorded in the audit history and on the ticket.">
        <Input
          accessibilityLabel="Reason for reassigning"
          multiline
          numberOfLines={3}
          onChangeText={setReason}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
          value={reason}
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
