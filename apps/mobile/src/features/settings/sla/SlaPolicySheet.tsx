import type { SlaPolicySummary } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useSaveSlaPolicy } from './api';
import { draftFrom, draftProblems, hasProblems, toInput, type SlaDraft } from './sla-form';
import { SlaPolicyFields } from './SlaPolicyFields';
import { SlaTargetsFields } from './SlaTargetsFields';

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/**
 * Create or edit a policy: scope, business hours, pauses and per-priority targets.
 *
 * Problems are only shown once somebody has tried to save — a blank new form covered in red is
 * a telling-off for not having started yet.
 */
export function SlaPolicySheet({
  policy,
  onClose,
  onSaved,
}: {
  policy: SlaPolicySummary | null;
  onClose: () => void;
  onSaved: (saved: SlaPolicySummary) => void;
}) {
  const [draft, setDraft] = useState<SlaDraft>(() =>
    draftFrom(policy ?? undefined, deviceTimezone()),
  );
  const [tried, setTried] = useState(false);
  const save = useSaveSlaPolicy(policy?.id ?? null, onSaved);
  const problems = draftProblems(draft);
  const shown = tried ? problems : {};
  const edit = (patch: Partial<SlaDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = () => {
    setTried(true);
    if (!hasProblems(problems)) {
      void save.run(toInput(draft));
    }
  };

  return (
    <Sheet
      visible
      title={policy ? 'Edit SLA policy' : 'New SLA policy'}
      subtitle="A project policy wins over a client policy, which wins over the default."
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={policy ? 'Save and re-apply' : 'Create policy'}
            icon="checkmark"
            loading={save.busy}
            disabled={tried && hasProblems(problems)}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Name" required error={shown.name ?? null}>
        <Input
          accessibilityLabel="Name"
          value={draft.name}
          onChangeText={(name) => edit({ name })}
          placeholder="Standard support"
          invalid={Boolean(shown.name)}
        />
      </Field>
      <SlaPolicyFields draft={draft} problems={shown} onChange={edit} />
      <SlaTargetsFields
        rules={draft.rules}
        problems={shown.rules}
        onChange={(priority, patch) =>
          edit({ rules: { ...draft.rules, [priority]: { ...draft.rules[priority], ...patch } } })
        }
      />
      <Field label="Description">
        <Input
          accessibilityLabel="Description"
          value={draft.description}
          onChangeText={(description) => edit({ description })}
          multiline
          style={{ minHeight: 72 }}
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
