import { PRIORITY, PRIORITY_LABELS, type Priority, type TicketDetail } from '@ashniva/types';
import { useState } from 'react';

import { ChipGroup } from '../../../shared/components/chips';
import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { isWorker } from '../ticket-display';
import { TEXT_ACTIONS, type TextActionKind } from './ticket-actions';

const PRIORITIES: Priority[] = Object.values(PRIORITY);

/** Resolve, reopen or cancel: a transition that is not sent without a sentence to go with it. */
export function TicketTextSheet({
  kind,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  kind: TextActionKind | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (kind: TextActionKind, text: string) => void;
}) {
  const [text, setText] = useState('');
  const config = kind ? TEXT_ACTIONS[kind] : null;
  const close = () => {
    setText('');
    onClose();
  };

  return (
    <Sheet
      visible={kind !== null}
      title={config?.title ?? ''}
      onClose={close}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={close} style={{ flex: 1 }} />
          <Button
            label={config?.submit ?? ''}
            variant={kind === 'resolve' ? 'primary' : 'danger'}
            loading={busy}
            disabled={text.trim().length < 3}
            onPress={() => (kind ? onSubmit(kind, text.trim()) : undefined)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      {config ? (
        <Field label={config.label} required hint={config.hint}>
          <Input
            accessibilityLabel={config.label}
            autoFocus
            multiline
            numberOfLines={4}
            onChangeText={setText}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            value={text}
          />
        </Field>
      ) : null}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}

export interface AssignInput {
  assignedToId: string;
  priority: Priority;
  note?: string;
}

/** Assigning the ticket to somebody, with its priority set at the same time, as on the web. */
export function AssignTicketSheet({
  visible,
  ticket,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  ticket: TicketDetail;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: AssignInput) => void;
}) {
  const [assignedToId, setAssignedToId] = useState<string | null>(ticket.assignedTo?.id ?? null);
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [note, setNote] = useState('');

  return (
    <Sheet
      visible={visible}
      title="Assign ticket"
      subtitle={ticket.key}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Assign"
            icon="person-add-outline"
            loading={busy}
            disabled={!assignedToId}
            onPress={() =>
              assignedToId
                ? onSubmit({
                    assignedToId,
                    priority,
                    ...(note.trim() ? { note: note.trim() } : {}),
                  })
                : undefined
            }
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <UserPicker
        label="Assign to"
        required
        value={assignedToId ? [assignedToId] : []}
        onChange={(ids) => setAssignedToId(ids[0] ?? null)}
        filter={isWorker}
        allowClear={false}
        placeholder="Choose a person"
      />
      <ChipGroup
        label="Priority"
        options={PRIORITIES}
        selected={priority}
        onSelect={setPriority}
        labelFor={(value) => PRIORITY_LABELS[value]}
      />
      <Field label="Note" hint="Optional">
        <Input accessibilityLabel="Assignment note" value={note} onChangeText={setNote} />
      </Field>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
