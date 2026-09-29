import type { CustomRoleDetail, PermissionKey } from '@ashniva/types';
import { useState } from 'react';

import { AppText, Field, Input } from '../../../shared/components/primitives';
import { useAdminMutation, type ReauthHeaders } from '../shared/admin-api';
import { ReauthSheet } from '../shared/ReauthSheet';
import { ROLE_WRITES } from './roles-api';

/**
 * The three writes to a custom role — its permissions, its name and description, deleting it —
 * each confirmed with the password, because each changes what people holding the role can do.
 */

type WithHeaders<T> = T & { headers: ReauthHeaders };

export function SaveRoleSheet({
  role,
  permissions,
  added,
  removed,
  onClose,
  onSaved,
}: {
  role: CustomRoleDetail;
  permissions: PermissionKey[];
  added: number;
  removed: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useAdminMutation<WithHeaders<{ permissions: PermissionKey[] }>, CustomRoleDetail>({
    path: () => `/roles/${role.id}`,
    method: 'PATCH',
    body: (variables) => ({ permissions: variables.permissions }),
    headers: (variables) => variables.headers,
    invalidate: ROLE_WRITES,
    onSuccess: () => onSaved(),
  });
  const people = role.memberCount === 1 ? '1 person holds' : `${role.memberCount} people hold`;
  return (
    <ReauthSheet
      visible
      title={`Save “${role.name}”`}
      subtitle={`${added} added · ${removed} removed`}
      confirmLabel="Save role"
      confirmIcon="checkmark"
      busy={save.busy}
      error={save.error}
      onClose={onClose}
      onConfirm={(headers) => save.run({ permissions, headers })}
    >
      <AppText size="sm" tone="muted">
        {role.memberCount > 0
          ? `${people} this role; the change applies to them straight away.`
          : 'Nobody holds this role yet.'}{' '}
        A role can never hold more than you do, and the change is recorded in the audit history.
      </AppText>
    </ReauthSheet>
  );
}

export function RoleDetailsSheet({
  role,
  onClose,
}: {
  role: CustomRoleDetail;
  onClose: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const save = useAdminMutation<WithHeaders<object>, CustomRoleDetail>({
    path: () => `/roles/${role.id}`,
    method: 'PATCH',
    body: () => ({ name: name.trim(), description: description.trim() || null }),
    headers: (variables) => variables.headers,
    invalidate: ROLE_WRITES,
    onSuccess: () => onClose(),
  });
  const changed = name.trim() !== role.name || (description.trim() || null) !== role.description;
  return (
    <ReauthSheet
      visible
      title="Edit role details"
      confirmLabel="Save"
      confirmIcon="checkmark"
      canConfirm={name.trim().length >= 2 && changed}
      busy={save.busy}
      error={save.error}
      onClose={onClose}
      onConfirm={(headers) => save.run({ headers })}
    >
      <Field label="Name" required>
        <Input accessibilityLabel="Role name" value={name} onChangeText={setName} />
      </Field>
      <Field label="Description">
        <Input
          accessibilityLabel="Role description"
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: 64 }}
        />
      </Field>
    </ReauthSheet>
  );
}

export function DeleteRoleSheet({
  role,
  onClose,
  onDeleted,
}: {
  role: CustomRoleDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useAdminMutation<ReauthHeaders, void>({
    path: () => `/roles/${role.id}`,
    method: 'DELETE',
    headers: (headers) => headers,
    invalidate: [['roles', 'list']],
    onSuccess: () => onDeleted(),
  });
  return (
    <ReauthSheet
      visible
      title={`Delete “${role.name}”?`}
      confirmLabel="Delete role"
      confirmIcon="trash-outline"
      destructive
      busy={remove.busy}
      error={remove.error}
      onClose={onClose}
      onConfirm={(headers) => remove.run(headers)}
    >
      <AppText tone="muted">
        The role is removed for good. Nobody holds it, so nobody loses access.
      </AppText>
    </ReauthSheet>
  );
}
