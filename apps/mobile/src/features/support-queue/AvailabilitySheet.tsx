import type { AvailabilityStatus, EffectiveAvailability } from '@ashniva/types';
import { useState } from 'react';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { Sheet } from '../../shared/components/Sheet';
import { formatDateTime } from '../../shared/format/format';
import { useSetAvailability } from './api';
import { AVAILABILITY_OPTIONS, availabilityInput } from './support-display';

/**
 * Recording that somebody is on leave, back, or at their limit — by hand.
 *
 * The same state normally arrives from Ashniva HR, and this writes to the identical record. It is
 * for what HR does not know about: an unplanned absence, or a lead deciding somebody has enough
 * on. Whatever is recorded still has to survive the rota.
 */
export function AvailabilitySheet({
  member,
  onClose,
}: {
  member: EffectiveAvailability;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<AvailabilityStatus>(member.status);
  const [until, setUntil] = useState<string | null>(
    member.until ? member.until.slice(0, 10) : null,
  );
  const [note, setNote] = useState(member.note ?? '');
  const save = useSetAvailability(onClose);

  return (
    <Sheet
      visible
      title={`Availability — ${member.user.name}`}
      subtitle={`Last recorded ${formatDateTime(member.updatedAt) ?? '—'} from ${member.source}.`}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            icon="checkmark"
            loading={save.busy}
            onPress={() =>
              void save.run({
                userId: member.userId,
                input: availabilityInput({ status, until, note }),
              })
            }
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <SelectField
        label="State"
        required
        options={AVAILABILITY_OPTIONS}
        value={[status]}
        onChange={(values) => (values[0] ? setStatus(values[0]) : undefined)}
      />
      <DateTimeField
        label="Applies until"
        value={until}
        onChange={setUntil}
        placeholder="Until somebody replaces it"
        hint="After this the rota decides again. Blank means until somebody replaces it."
      />
      <Field label="Note" hint="Shown to whoever configures routing. Not visible to clients.">
        <Input
          accessibilityLabel="Availability note"
          multiline
          numberOfLines={2}
          value={note}
          onChangeText={setNote}
          style={{ minHeight: 56 }}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
      <AppText size="xs" tone="faint">
        Routing currently sees this person as {member.withinSchedule ? 'inside' : 'outside'} their
        working hours.
      </AppText>
    </Sheet>
  );
}
