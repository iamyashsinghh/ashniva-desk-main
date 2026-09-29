import type { IncidentDetail, Priority } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { SeverityField } from '../components/SeverityField';
import { useIncidentWrite } from '../problem-api';

const MIN_TEXT = 3;

/**
 * Editing what an incident says about itself. Status is not here — moving it has its own actions,
 * and resolving and closing demand something in writing — and neither is the problem, which
 * `PATCH /incidents/:id` does not take. A severity or owner change is written to the timeline by
 * the server.
 */
export function EditIncidentSheet({
  incident,
  onClose,
}: {
  incident: IncidentDetail;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(incident.title);
  const [description, setDescription] = useState(incident.description);
  const [severity, setSeverity] = useState<Priority>(incident.severity);
  const [impact, setImpact] = useState(incident.impact ?? '');
  const [ownerId, setOwnerId] = useState<string | null>(incident.owner?.id ?? null);
  const [internalNotes, setInternalNotes] = useState(incident.internalNotes ?? '');

  const save = useIncidentWrite<void>({
    path: `/incidents/${incident.id}`,
    method: 'PATCH',
    body: () => ({
      title: title.trim(),
      description: description.trim(),
      severity,
      impact: impact.trim(),
      ownerId,
      internalNotes: internalNotes.trim(),
    }),
    onDone: onClose,
  });

  const valid = title.trim().length >= MIN_TEXT && description.trim().length >= MIN_TEXT;

  return (
    <Sheet
      visible
      title="Edit the incident"
      subtitle={incident.key}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            icon="checkmark"
            loading={save.busy}
            disabled={!valid}
            onPress={() => void save.run()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Title" required>
        <Input accessibilityLabel="Title" value={title} onChangeText={setTitle} maxLength={200} />
      </Field>
      <Field label="What is broken" required>
        <Input
          accessibilityLabel="What is broken"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={10000}
          style={{ minHeight: 104 }}
        />
      </Field>
      <SeverityField value={severity} onChange={setSeverity} />
      <Field label="Impact">
        <Input
          accessibilityLabel="Impact"
          value={impact}
          onChangeText={setImpact}
          multiline
          numberOfLines={2}
          maxLength={2000}
          style={{ minHeight: 72 }}
        />
      </Field>
      <UserPicker
        label="Owner"
        value={ownerId ? [ownerId] : []}
        onChange={(ids) => setOwnerId(ids[0] ?? null)}
        placeholder="Unassigned"
      />
      <Field label="Internal notes" hint="Internal only — no client shape carries these">
        <Input
          accessibilityLabel="Internal notes"
          value={internalNotes}
          onChangeText={setInternalNotes}
          multiline
          numberOfLines={3}
          maxLength={10000}
          style={{ minHeight: 88 }}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
