import type { TeamSummary, UserSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { Sheet } from '../../../shared/components/Sheet';
import { roleLabel } from './user-display';

interface TeamForm {
  name: string;
  description: string;
  leadUserId: string | null;
  memberIds: string[];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * Create a team, or change one: name, lead, description and members.
 *
 * The web's dialog replaces only the members of an existing team; the API also renames a team and
 * changes its lead (`PATCH /teams/:id`), so the phone offers both. They are separate routes, and
 * each is only called when its part actually changed.
 */
export function TeamSheet({
  team,
  people,
  peopleLoading,
  onClose,
}: {
  team?: TeamSummary;
  people: readonly UserSummary[];
  peopleLoading: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TeamForm>({
    name: team?.name ?? '',
    description: team?.description ?? '',
    leadUserId: team?.lead?.id ?? null,
    memberIds: team?.members.map((member) => member.id) ?? [],
  });
  const options = useMemo<SelectOption[]>(
    () =>
      people.map((person) => ({
        value: person.id,
        label: person.name,
        description: person.title ?? roleLabel(person),
        icon: 'person-circle-outline',
        iconTone: 'info',
      })),
    [people],
  );

  const create = useApiMutation<TeamForm, TeamSummary>({
    path: '/teams',
    body: (values) => ({
      name: values.name.trim(),
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      ...(values.leadUserId ? { leadUserId: values.leadUserId } : {}),
      memberIds: values.memberIds,
    }),
    invalidate: [['teams']],
  });
  const update = useApiMutation<TeamForm, TeamSummary>({
    path: `/teams/${team?.id ?? ''}`,
    method: 'PATCH',
    body: (values) => ({
      name: values.name.trim(),
      description: values.description.trim() || null,
      leadUserId: values.leadUserId,
    }),
    invalidate: [['teams']],
  });
  const setMembers = useApiMutation<string[], TeamSummary>({
    path: `/teams/${team?.id ?? ''}/members`,
    method: 'PUT',
    body: (userIds) => ({ userIds }),
    invalidate: [['teams'], ['users']],
  });

  const detailsChanged =
    team !== undefined &&
    (form.name.trim() !== team.name ||
      (form.description.trim() || null) !== team.description ||
      form.leadUserId !== (team.lead?.id ?? null));
  const membersChanged =
    team !== undefined &&
    !sameSet(
      form.memberIds,
      team.members.map((member) => member.id),
    );

  const save = async () => {
    if (!team) {
      if (await create.run(form)) {
        onClose();
      }
      return;
    }
    if (detailsChanged && !(await update.run(form))) {
      return;
    }
    if (membersChanged && !(await setMembers.run(form.memberIds))) {
      return;
    }
    onClose();
  };

  const patch = (change: Partial<TeamForm>) => setForm((current) => ({ ...current, ...change }));
  const error = create.error ?? update.error ?? setMembers.error;
  const busy = create.busy || update.busy || setMembers.busy;
  const valid = form.name.trim().length >= 2 && (!team || detailsChanged || membersChanged);

  return (
    <Sheet
      visible
      title={team ? team.name : 'New team'}
      {...(team ? { subtitle: `${team.members.length} members` } : {})}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={team ? 'Save' : 'Create team'}
            icon="checkmark"
            loading={busy}
            disabled={!valid}
            onPress={() => void save()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Name" required>
        <Input
          accessibilityLabel="Team name"
          value={form.name}
          onChangeText={(name) => patch({ name })}
          autoCapitalize="words"
        />
      </Field>
      <Field label="Description">
        <Input
          accessibilityLabel="Team description"
          value={form.description}
          onChangeText={(description) => patch({ description })}
          multiline
          style={{ minHeight: 64 }}
        />
      </Field>
      <SelectField
        label="Lead"
        icon="star-outline"
        options={options}
        value={form.leadUserId ? [form.leadUserId] : []}
        onChange={(ids) => patch({ leadUserId: ids[0] ?? null })}
        allowClear
        clearLabel="No lead yet"
        placeholder="No lead yet"
        loading={peopleLoading}
      />
      <SelectField
        label="Members"
        icon="people-outline"
        options={options}
        value={form.memberIds}
        onChange={(memberIds) => patch({ memberIds })}
        multiple
        placeholder="Nobody yet"
        loading={peopleLoading}
      />
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
