import { TICKET_STATUS_LABELS } from '@ashniva/types';
import { View } from 'react-native';

import { Chip, ChipGroup } from '../../../shared/components/chips';
import { useProjectOptions } from '../../../shared/components/pickers';
import { AppText, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useClientOptions } from '../../projects/project-form-options';
import { SettingSwitch } from '../shared/SettingSwitch';
import {
  DAY_LABELS,
  PAUSABLE,
  SCOPE_LABELS,
  toggle,
  type Scope,
  type SlaDraft,
  type SlaProblems,
} from './sla-form';

const SCOPES: Scope[] = ['default', 'client', 'project'];

/** Who a policy covers and when its clock runs: scope, business hours, days and pauses. */
export function SlaPolicyFields({
  draft,
  problems,
  onChange,
}: {
  draft: SlaDraft;
  problems: SlaProblems;
  onChange: (patch: Partial<SlaDraft>) => void;
}) {
  const theme = useTheme();
  const clients = useClientOptions();
  const projects = useProjectOptions();

  return (
    <>
      <ChipGroup
        label="Applies to"
        options={SCOPES}
        selected={draft.scope}
        onSelect={(scope) => onChange({ scope })}
        labelFor={(scope) => SCOPE_LABELS[scope]}
      />
      {draft.scope === 'client' ? (
        <SelectField
          label="Client"
          required
          icon="business-outline"
          options={clients.options}
          value={draft.clientOrganizationId ? [draft.clientOrganizationId] : []}
          onChange={(ids) => onChange({ clientOrganizationId: ids[0] ?? null })}
          loading={clients.isLoading}
          error={problems.scope ?? null}
        />
      ) : null}
      {draft.scope === 'project' ? (
        <SelectField
          label="Project"
          required
          icon="folder-outline"
          options={projects.options}
          value={draft.projectId ? [draft.projectId] : []}
          onChange={(ids) => onChange({ projectId: ids[0] ?? null })}
          loading={projects.isLoading}
          error={problems.scope ?? null}
        />
      ) : null}

      <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata" error={problems.timezone ?? null}>
        <Input
          accessibilityLabel="Timezone"
          value={draft.timezone}
          onChangeText={(timezone) => onChange({ timezone })}
          autoCapitalize="none"
          autoCorrect={false}
          invalid={Boolean(problems.timezone)}
        />
      </Field>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Business hours start" error={problems.start ?? null}>
            <Input
              accessibilityLabel="Business hours start"
              value={draft.businessHoursStart}
              onChangeText={(businessHoursStart) => onChange({ businessHoursStart })}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
              invalid={Boolean(problems.start)}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Business hours end" error={problems.end ?? null}>
            <Input
              accessibilityLabel="Business hours end"
              value={draft.businessHoursEnd}
              onChangeText={(businessHoursEnd) => onChange({ businessHoursEnd })}
              placeholder="18:00"
              keyboardType="numbers-and-punctuation"
              invalid={Boolean(problems.end)}
            />
          </Field>
        </View>
      </View>
      <Field label="Business days" required error={problems.days ?? null}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {DAY_LABELS.map((label, index) => (
            <Chip
              key={label}
              role="checkbox"
              label={label}
              selected={draft.businessDays.includes(index + 1)}
              onPress={() => onChange({ businessDays: toggle(draft.businessDays, index + 1) })}
            />
          ))}
        </View>
      </Field>
      <Field label="Warn at (% of target)" error={problems.warning ?? null}>
        <Input
          accessibilityLabel="Warn at percent of target"
          value={draft.warningPercent}
          onChangeText={(warningPercent) => onChange({ warningPercent })}
          keyboardType="number-pad"
          invalid={Boolean(problems.warning)}
        />
      </Field>
      <View>
        <AppText size="sm" weight="medium">
          Pause the clock while the ticket is
        </AppText>
        {PAUSABLE.map((status) => (
          <SettingSwitch
            key={status}
            label={TICKET_STATUS_LABELS[status]}
            value={draft.pauseStatuses.includes(status)}
            onChange={() => onChange({ pauseStatuses: toggle(draft.pauseStatuses, status) })}
          />
        ))}
      </View>
    </>
  );
}
