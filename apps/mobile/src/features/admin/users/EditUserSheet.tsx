import { ROLE_KEYS, type UserSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { Sheet } from '../../../shared/components/Sheet';
import { SwitchRow } from '../shared/SwitchRow';
import { useAdminMutation } from '../shared/admin-api';
import { USER_WRITES, useTeams } from './users-api';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EditForm {
  name: string;
  email: string;
  title: string;
  phone: string;
  password: string;
  teamIds: string[];
  showDevelopmentSection: boolean;
}

/**
 * Edit a person's profile: name, email, title, phone, teams, an optional new password, and — for a
 * team lead — whether the Development section shows. Not the role: that is its own audited route
 * with a password check, reached from "Change role".
 */
export function EditUserSheet({
  person,
  organizationId,
  showTeams,
  onClose,
}: {
  person: UserSummary;
  organizationId: string | undefined;
  /** Teams are the provider's own; a client's people are not in them. */
  showTeams: boolean;
  onClose: () => void;
}) {
  const teams = useTeams(showTeams);
  const [form, setForm] = useState<EditForm>({
    name: person.name,
    email: person.email,
    title: person.title ?? '',
    phone: person.phone ?? '',
    password: '',
    teamIds: person.teams.map((team) => team.id),
    showDevelopmentSection: person.showDevelopmentSection,
  });
  const teamOptions = useMemo<SelectOption[]>(
    () =>
      (teams.data ?? []).map((team) => ({
        value: team.id,
        label: team.name,
        icon: 'people-outline',
        iconTone: 'violet',
      })),
    [teams.data],
  );
  const save = useAdminMutation<EditForm, UserSummary>({
    path: () => `/users/${person.id}`,
    method: 'PATCH',
    body: (values) => ({
      ...(organizationId ? { organizationId } : {}),
      name: values.name.trim(),
      email: values.email.trim(),
      title: values.title.trim() || null,
      phone: values.phone.trim() || null,
      ...(values.password.length >= 10 ? { password: values.password } : {}),
      ...(showTeams ? { teamIds: values.teamIds } : {}),
      showDevelopmentSection: values.showDevelopmentSection,
    }),
    invalidate: USER_WRITES,
    onSuccess: () => onClose(),
  });
  const patch = (change: Partial<EditForm>) => {
    save.reset();
    setForm((current) => ({ ...current, ...change }));
  };
  const passwordShort = form.password.length > 0 && form.password.length < 10;
  const valid = EMAIL.test(form.email.trim()) && form.name.trim().length > 0 && !passwordShort;

  return (
    <Sheet
      visible
      title={`Edit ${person.name}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            icon="checkmark"
            loading={save.busy}
            disabled={!valid}
            onPress={() => void save.run(form)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Name" required>
        <Input
          accessibilityLabel="Name"
          value={form.name}
          onChangeText={(name) => patch({ name })}
          autoCapitalize="words"
        />
      </Field>
      <Field label="Email" required>
        <Input
          accessibilityLabel="Email"
          value={form.email}
          onChangeText={(email) => patch({ email })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <Field label="Title">
        <Input
          accessibilityLabel="Title"
          value={form.title}
          onChangeText={(title) => patch({ title })}
          placeholder="e.g. Team Lead, Store Manager"
        />
      </Field>
      <Field label="Phone">
        <Input
          accessibilityLabel="Phone"
          value={form.phone}
          onChangeText={(phone) => patch({ phone })}
          keyboardType="phone-pad"
        />
      </Field>
      {showTeams && teamOptions.length > 0 ? (
        <SelectField
          label="Teams"
          icon="people-outline"
          options={teamOptions}
          value={form.teamIds}
          onChange={(teamIds) => patch({ teamIds })}
          multiple
          placeholder="No team"
        />
      ) : null}
      <Field
        label="New password"
        hint="Leave blank to keep the current one. At least 10 characters if you change it."
        {...(passwordShort ? { error: 'At least 10 characters.' } : {})}
      >
        <Input
          accessibilityLabel="New password"
          value={form.password}
          onChangeText={(password) => patch({ password })}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          invalid={passwordShort}
        />
      </Field>
      {person.roleKey === ROLE_KEYS.TEAM_LEAD ? (
        <SwitchRow
          label="Show Development section"
          description="Seniors who no longer code can hide their own-development dashboard section."
          value={form.showDevelopmentSection}
          onChange={(showDevelopmentSection) => patch({ showDevelopmentSection })}
        />
      ) : null}
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
