import type { UnassignedTicketSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { Sheet } from '../../shared/components/Sheet';
import { useReassign, useSupportConfig } from './api';
import { teamOptions } from './support-display';

/**
 * Putting a queued ticket on somebody by hand — the web's reassign dialog.
 *
 * The choice is the ticket's project team with each person's availability, as on the web, so
 * the picker offers people who could actually take it. The reason is compulsory and the button
 * stays disabled without one: a reassignment with no reason is the audit row that turns out to
 * be useless later. The API enforces it too.
 */
export function ReassignSheet({
  ticket,
  onClose,
  onDone,
}: {
  ticket: UnassignedTicketSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const projectId = ticket.project?.id ?? null;
  const config = useSupportConfig(projectId, true);
  const reassign = useReassign(ticket.id, onDone);
  const options = useMemo(() => teamOptions(config.data?.team ?? []), [config.data]);
  const valid = Boolean(assignedToId) && reason.trim().length >= 3;

  let placeholder = 'Choose somebody';
  if (!projectId) {
    placeholder = 'This ticket has no project team';
  } else if (!config.isLoading && options.length === 0) {
    placeholder = 'This project has no other members';
  }

  return (
    <Sheet
      visible
      title={`Reassign ${ticket.key}`}
      subtitle={ticket.title}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Reassign"
            icon="swap-horizontal"
            loading={reassign.busy}
            disabled={!valid}
            onPress={() =>
              assignedToId ? void reassign.run({ assignedToId, reason: reason.trim() }) : undefined
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
      <SelectField
        label="Assign to"
        required
        icon="person-outline"
        options={options}
        value={assignedToId ? [assignedToId] : []}
        onChange={(ids) => setAssignedToId(ids[0] ?? null)}
        placeholder={placeholder}
        loading={config.isLoading}
        disabled={!projectId}
      />
      <Field label="Reason" required hint="Recorded in the audit history and on the ticket.">
        <Input
          accessibilityLabel="Reason for reassigning"
          multiline
          numberOfLines={3}
          onChangeText={setReason}
          style={{ minHeight: 72 }}
          value={reason}
        />
      </Field>
      {reassign.error ? (
        <Banner tone="danger" role="alert">
          {reassign.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
