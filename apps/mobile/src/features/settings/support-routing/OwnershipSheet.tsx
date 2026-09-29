import type { EffectiveAvailability, SupportOwnershipSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { Button, Divider, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { teamOptions } from '../../support-queue/support-display';
import { SettingSwitch } from '../shared/SettingSwitch';
import { useSaveOwnership } from './api';
import { ModuleOwnersFields } from './ModuleOwnersFields';
import {
  OWNERSHIP_ROLES,
  ownershipDraft,
  ownershipInput,
  ownershipProblems,
  type OwnershipDraft,
} from './ownership-form';

/** Editing who covers a project's support: the chain, module owners and the clocks. */
export function OwnershipSheet({
  projectId,
  ownership,
  team,
  onClose,
  onSaved,
}: {
  projectId: string;
  ownership: SupportOwnershipSummary;
  team: readonly EffectiveAvailability[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<OwnershipDraft>(() => ownershipDraft(ownership));
  const save = useSaveOwnership(projectId, onSaved);
  const people = useMemo(() => teamOptions(team), [team]);
  const problems = ownershipProblems(draft);
  const blocked = Object.keys(problems).length > 0;
  const edit = (patch: Partial<OwnershipDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <Sheet
      visible
      title="Support ownership"
      subtitle="Tried in this order when a ticket arrives"
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save ownership"
            icon="checkmark"
            loading={save.busy}
            disabled={blocked}
            onPress={() => void save.run(ownershipInput(draft))}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <SettingSwitch
        label="Route tickets automatically"
        description="Off means every ticket on this project waits for somebody to assign it by hand."
        value={draft.autoRouteEnabled}
        onChange={(autoRouteEnabled) => edit({ autoRouteEnabled })}
      />
      {OWNERSHIP_ROLES.map((role) => (
        <SelectField
          key={role.key}
          label={role.label}
          icon="person-outline"
          options={people}
          value={draft.roles[role.key] ? [draft.roles[role.key] as string] : []}
          onChange={(ids) => edit({ roles: { ...draft.roles, [role.key]: ids[0] ?? null } })}
          allowClear
          clearLabel="Nobody"
          placeholder="Nobody"
        />
      ))}
      <Divider />
      <ModuleOwnersFields
        rows={draft.modules}
        people={people}
        onChange={(modules) => edit({ modules })}
      />
      <Divider />
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Acknowledge within (min)" error={problems.ack ?? null}>
            <Input
              accessibilityLabel="Acknowledge within minutes"
              value={draft.ackMinutes}
              onChangeText={(ackMinutes) => edit({ ackMinutes })}
              keyboardType="number-pad"
              invalid={Boolean(problems.ack)}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Escalate after (min)" error={problems.escalation ?? null}>
            <Input
              accessibilityLabel="Escalate after minutes"
              value={draft.escalationMinutes}
              onChangeText={(escalationMinutes) => edit({ escalationMinutes })}
              keyboardType="number-pad"
              invalid={Boolean(problems.escalation)}
            />
          </Field>
        </View>
      </View>
      <Field
        label="Workload limit"
        hint="Applies to anybody without their own limit. Blank means no limit."
        error={problems.limit ?? null}
      >
        <Input
          accessibilityLabel="Workload limit"
          value={draft.workloadLimit}
          onChangeText={(workloadLimit) => edit({ workloadLimit })}
          keyboardType="number-pad"
          invalid={Boolean(problems.limit)}
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
