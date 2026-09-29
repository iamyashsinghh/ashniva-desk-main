import {
  PROJECT_STATUS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE,
  PROJECT_TYPE_LABELS,
  ROLE_KEYS,
  type DirectoryEntry,
  type ProjectStatus,
  type ProjectType,
} from '@ashniva/types';
import { useCallback } from 'react';
import { Switch, View } from 'react-native';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { IconTile } from '../../shared/components/Icon';
import { UserPicker } from '../../shared/components/pickers';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { sanitizeProjectCode, type ProjectFormErrors, type ProjectFormState } from './project-form';
import { useClientOptions, useTeamOptions } from './project-form-options';

const TYPE_OPTIONS: SelectOption<ProjectType>[] = Object.values(PROJECT_TYPE).map((type) => ({
  value: type,
  label: PROJECT_TYPE_LABELS[type],
}));

const STATUS_OPTIONS: SelectOption<ProjectStatus>[] = Object.values(PROJECT_STATUS).map(
  (status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }),
);

type SetField = <K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) => void;

/**
 * Every field of the project form.
 *
 * The lead and manager pickers offer only the roles the web offers for those seats, plus whoever
 * holds the seat already — a person whose role changed since must still show by name rather than
 * as an empty field that saving would silently keep.
 */
export function ProjectFormFields({
  form,
  set,
  errors,
  editing,
  savedLeadId,
  savedManagerId,
}: {
  form: ProjectFormState;
  set: SetField;
  errors: ProjectFormErrors;
  editing: boolean;
  savedLeadId: string | null;
  savedManagerId: string | null;
}) {
  const theme = useTheme();
  const clients = useClientOptions();
  const teams = useTeamOptions();
  const leadFilter = useCallback(
    (person: DirectoryEntry) => person.roleKey === ROLE_KEYS.TEAM_LEAD || person.id === savedLeadId,
    [savedLeadId],
  );
  const managerFilter = useCallback(
    (person: DirectoryEntry) =>
      person.roleKey === ROLE_KEYS.PROJECT_MANAGER || person.id === savedManagerId,
    [savedManagerId],
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Field
        label="Code"
        required={!editing}
        hint={
          editing
            ? 'The code is fixed once the project exists: task numbers are built from it.'
            : 'Letters and digits, 2–8 characters. ACM makes tasks ACM-1, ACM-2.'
        }
        error={errors.code ?? null}
      >
        <Input
          value={form.code}
          onChangeText={(value) => set('code', sanitizeProjectCode(value))}
          placeholder="ACM"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          editable={!editing}
          invalid={Boolean(errors.code)}
          accessibilityLabel="Code"
        />
      </Field>
      <Field label="Name" required error={errors.name ?? null}>
        <Input
          value={form.name}
          onChangeText={(value) => set('name', value)}
          placeholder="Customer portal rebuild"
          maxLength={120}
          invalid={Boolean(errors.name)}
          accessibilityLabel="Name"
        />
      </Field>
      <SelectField
        label="Client"
        icon="business-outline"
        options={clients.options}
        value={form.clientOrganizationId ? [form.clientOrganizationId] : []}
        onChange={(ids) => set('clientOrganizationId', ids[0] ?? null)}
        allowClear
        clearLabel="Internal (no client)"
        placeholder="Internal (no client)"
        hint="Leave empty for an internal project."
        loading={clients.isLoading}
      />
      <SelectField
        label="Type"
        icon="pricetag-outline"
        options={TYPE_OPTIONS}
        value={[form.type]}
        onChange={(values) => values[0] && set('type', values[0])}
      />
      <SelectField
        label="Status"
        icon="flag-outline"
        options={STATUS_OPTIONS}
        value={[form.status]}
        onChange={(values) => values[0] && set('status', values[0])}
      />
      <UserPicker
        label="Who will lead this team"
        required
        value={form.leadUserId ? [form.leadUserId] : []}
        onChange={(ids) => set('leadUserId', ids[0] ?? null)}
        filter={leadFilter}
        allowClear={false}
        placeholder="Select a team lead"
        hint="Only people whose role is Team Lead."
        error={errors.leadUserId ?? null}
      />
      <SelectField
        label="Team"
        required
        icon="people-outline"
        options={teams.options}
        value={form.teamId ? [form.teamId] : []}
        onChange={(ids) => set('teamId', ids[0] ?? null)}
        placeholder="Select a team"
        hint="Developers and testers on this team see the project."
        error={errors.teamId ?? null}
        loading={teams.isLoading}
      />
      <UserPicker
        label="Project manager"
        value={form.managerUserId ? [form.managerUserId] : []}
        onChange={(ids) => set('managerUserId', ids[0] ?? null)}
        filter={managerFilter}
        placeholder="Not set"
        hint="Only people whose role is Project Manager."
      />
      <DateTimeField
        label="Start date"
        value={form.startDate}
        onChange={(value) => set('startDate', value)}
      />
      <DateTimeField
        label="Target delivery"
        value={form.targetDate}
        onChange={(value) => set('targetDate', value)}
        error={errors.targetDate ?? null}
      />
      <Field label="Description">
        <Input
          value={form.description}
          onChangeText={(value) => set('description', value)}
          placeholder="What the project covers"
          multiline
          maxLength={2000}
          style={{ minHeight: 110 }}
          accessibilityLabel="Description"
        />
      </Field>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.md,
          minHeight: TOUCH_TARGET,
        }}
      >
        <IconTile
          name="checkmark-done-outline"
          tone={form.requiresClientUat ? 'info' : 'neutral'}
          size={36}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="medium">Client UAT required</AppText>
          <AppText size="xs" tone="muted">
            Releases for this project wait for the client to sign off.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Client UAT required"
          value={form.requiresClientUat}
          onValueChange={(value) => set('requiresClientUat', value)}
          trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
        />
      </View>
    </View>
  );
}
