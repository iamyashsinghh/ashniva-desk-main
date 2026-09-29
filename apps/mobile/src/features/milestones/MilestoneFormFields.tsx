import { View } from 'react-native';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { Section } from '../../shared/components/layout';
import { UserPicker } from '../../shared/components/pickers';
import { Button, Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ToggleRow } from '../tasks/ToggleRow';
import { MAX_DELIVERABLES, type MilestoneFormState } from './milestone-form';

export function MilestoneFormFields({
  form,
  set,
  contracts,
  siblings,
}: {
  form: MilestoneFormState;
  set: (patch: Partial<MilestoneFormState>) => void;
  contracts: { options: SelectOption[]; isLoading: boolean };
  siblings: { options: SelectOption[]; isLoading: boolean };
}) {
  const theme = useTheme();
  const updateDeliverable = (index: number, title: string) =>
    set({
      deliverables: form.deliverables.map((item, at) => (at === index ? { ...item, title } : item)),
    });

  return (
    <>
      <Section title="The milestone" icon="flag-outline">
        <Field label="Name" required>
          <Input
            accessibilityLabel="Name"
            maxLength={200}
            value={form.name}
            onChangeText={(name) => set({ name })}
          />
        </Field>
        <Field label="Description">
          <Input
            accessibilityLabel="Description"
            multiline
            maxLength={5000}
            value={form.description}
            onChangeText={(description) => set({ description })}
            style={{ minHeight: 72 }}
          />
        </Field>
        <UserPicker
          label="Owner"
          value={form.ownerUserId ? [form.ownerUserId] : []}
          onChange={(ids) => set({ ownerUserId: ids[0] ?? null })}
        />
        <SelectField
          label="Contract"
          icon="document-text-outline"
          options={contracts.options}
          value={form.contractId ? [form.contractId] : []}
          onChange={(ids) => set({ contractId: ids[0] ?? null })}
          loading={contracts.isLoading}
          allowClear
          clearLabel="None"
          placeholder="None"
        />
        <DateTimeField
          label="Start"
          value={form.startDate}
          onChange={(startDate) => set({ startDate })}
        />
        <DateTimeField label="Due" value={form.dueDate} onChange={(dueDate) => set({ dueDate })} />
        <SelectField
          label="Depends on"
          icon="git-network-outline"
          hint="Must be completed first (same project)."
          multiple
          options={siblings.options}
          value={form.dependsOnIds}
          onChange={(dependsOnIds) => set({ dependsOnIds })}
          loading={siblings.isLoading}
          placeholder="Nothing"
        />
      </Section>

      <Section title="Deliverables" icon="checkbox-outline" count={form.deliverables.length}>
        {form.deliverables.map((item, index) => (
          <Input
            key={item.id ?? `new-${index}`}
            accessibilityLabel={`Deliverable ${index + 1}`}
            placeholder="What will be handed over"
            maxLength={200}
            value={item.title}
            onChangeText={(title) => updateDeliverable(index, title)}
          />
        ))}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Button
            label="Deliverable"
            icon="add"
            size="sm"
            variant="secondary"
            disabled={form.deliverables.length >= MAX_DELIVERABLES}
            onPress={() =>
              set({ deliverables: [...form.deliverables, { title: '', isDone: false }] })
            }
          />
          {form.deliverables.length > 0 ? (
            <Button
              label="Remove last"
              size="sm"
              variant="ghost"
              onPress={() => set({ deliverables: form.deliverables.slice(0, -1) })}
            />
          ) : null}
        </View>
      </Section>

      <Section title="Who sees it" icon="eye-outline">
        <ToggleRow
          label="Client-visible"
          description="Shown in the client portal with its progress and deliverables."
          icon="eye-outline"
          value={form.clientVisible}
          onChange={(clientVisible) => set({ clientVisible })}
        />
        <ToggleRow
          label="Needs client sign-off"
          description="An approval request is prepared when the milestone is delivered."
          icon="shield-checkmark-outline"
          value={form.requiresApproval}
          onChange={(requiresApproval) => set({ requiresApproval })}
        />
      </Section>
    </>
  );
}
