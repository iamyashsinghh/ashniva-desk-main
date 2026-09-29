import type { TeamSummary } from '@ashniva/types';
import { useMemo } from 'react';

import { Segmented } from '../../../shared/components/navigation-list';
import { Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { SwitchRow } from '../shared/SwitchRow';
import { inviteProblems, isTeamLeadChoice, type InviteForm, type SignInMode } from './invite-form';

const MODES = [
  { value: 'invite', label: 'Invitation link', icon: 'link-outline' },
  { value: 'password', label: 'Set a password', icon: 'key-outline' },
] as const;

export function InviteUserFields({
  form,
  onChange,
  roleOptions,
  rolesLoading,
  teams,
}: {
  form: InviteForm;
  onChange: (change: Partial<InviteForm>) => void;
  roleOptions: readonly SelectOption[];
  rolesLoading: boolean;
  /** Empty when the company has no teams to join (a client, or none made yet). */
  teams: readonly TeamSummary[];
}) {
  const problems = inviteProblems(form);
  const teamOptions = useMemo<SelectOption[]>(
    () =>
      teams.map((team) => ({
        value: team.id,
        label: team.name,
        icon: 'people-outline',
        iconTone: 'violet',
      })),
    [teams],
  );

  return (
    <>
      <Field label="Email" required {...(problems.email ? { error: problems.email } : {})}>
        <Input
          accessibilityLabel="Email"
          value={form.email}
          onChangeText={(email) => onChange({ email })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          invalid={Boolean(problems.email)}
        />
      </Field>
      <Field label="Name" required>
        <Input
          accessibilityLabel="Name"
          value={form.name}
          onChangeText={(name) => onChange({ name })}
          autoCapitalize="words"
          autoComplete="off"
        />
      </Field>
      <Field
        label="How they sign in the first time"
        hint={
          form.mode === 'invite'
            ? 'You get a one-time link to share; they choose their own password.'
            : 'Share the password privately; they can change it later.'
        }
      >
        <Segmented
          label="How they sign in the first time"
          options={MODES}
          value={form.mode}
          onChange={(mode: SignInMode) => onChange({ mode, password: '' })}
        />
      </Field>
      {form.mode === 'password' ? (
        <Field
          label="Initial password"
          required
          hint="At least 10 characters."
          {...(problems.password ? { error: problems.password } : {})}
        >
          <Input
            accessibilityLabel="Initial password"
            value={form.password}
            onChangeText={(password) => onChange({ password })}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            invalid={Boolean(problems.password)}
          />
        </Field>
      ) : null}
      <SelectField
        label="Role"
        icon="shield-outline"
        options={roleOptions}
        value={[form.role]}
        onChange={(values) => (values[0] ? onChange({ role: values[0] }) : undefined)}
        loading={rolesLoading}
        required
      />
      <Field label="Title">
        <Input
          accessibilityLabel="Title"
          value={form.title}
          onChangeText={(title) => onChange({ title })}
          placeholder="e.g. Team Lead, Store Manager"
        />
      </Field>
      <Field label="Phone">
        <Input
          accessibilityLabel="Phone"
          value={form.phone}
          onChangeText={(phone) => onChange({ phone })}
          keyboardType="phone-pad"
        />
      </Field>
      {teamOptions.length > 0 ? (
        <SelectField
          label="Teams"
          icon="people-outline"
          options={teamOptions}
          value={form.teamIds}
          onChange={(teamIds) => onChange({ teamIds })}
          multiple
          placeholder="No team"
        />
      ) : null}
      {isTeamLeadChoice(form.role) ? (
        <SwitchRow
          label="Show Development section"
          description="Seniors who no longer code can hide their own-development dashboard section."
          value={form.showDevelopmentSection}
          onChange={(showDevelopmentSection) => onChange({ showDevelopmentSection })}
        />
      ) : null}
    </>
  );
}
