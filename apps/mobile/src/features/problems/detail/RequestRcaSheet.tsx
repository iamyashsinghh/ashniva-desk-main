import type { ProblemDetail } from '@ashniva/types';
import { useState } from 'react';

import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useProblemWrite } from '../problem-api';

interface RequestRcaInput {
  dueDate?: string;
  ownerId?: string;
  note?: string;
}

/**
 * Asking for a root-cause analysis: who owes it, by when, and what to look at.
 *
 * All three are optional, as they are to `POST /problems/:id/request-rca`; the web asks only for
 * the date, and the owner and note are there because the route takes them and a phone is where a
 * manager tends to be when this gets decided.
 */
export function RequestRcaSheet({
  problem,
  onClose,
}: {
  problem: ProblemDetail;
  onClose: () => void;
}) {
  const [dueDate, setDueDate] = useState<string | null>(problem.rcaDueDate);
  const [ownerId, setOwnerId] = useState<string | null>(problem.owner?.id ?? null);
  const [note, setNote] = useState('');

  const request = useProblemWrite<RequestRcaInput>({
    path: `/problems/${problem.id}/request-rca`,
    body: (input) => input,
    onDone: onClose,
  });

  const submit = () =>
    void request.run({
      ...(dueDate ? { dueDate } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });

  return (
    <Sheet
      visible
      title="Request a root-cause analysis"
      subtitle={`${problem.key} · ${problem.title}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Request RCA"
            icon="document-text-outline"
            loading={request.busy}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <UserPicker
        label="Who owes the analysis"
        value={ownerId ? [ownerId] : []}
        onChange={(ids) => setOwnerId(ids[0] ?? null)}
        placeholder="Nobody named"
      />
      <DateTimeField label="Due" value={dueDate} onChange={setDueDate} minimumDate={new Date()} />
      <Field label="What to look at" hint="Optional">
        <Input
          accessibilityLabel="What to look at"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          maxLength={2000}
          style={{ minHeight: 88 }}
        />
      </Field>
      {request.error ? (
        <Banner tone="danger" role="alert">
          {request.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
