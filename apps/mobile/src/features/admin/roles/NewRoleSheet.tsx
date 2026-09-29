import {
  ALL_ROLE_KEYS,
  ROLE_KEYS,
  ROLE_LABELS,
  isClientRole,
  type CustomRoleDetail,
  type RoleKey,
} from '@ashniva/types';
import { useMemo, useState } from 'react';

import { AppText, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { useSession } from '../../auth/SessionProvider';
import { useAdminMutation, type ReauthHeaders } from '../shared/admin-api';
import { ReauthSheet } from '../shared/ReauthSheet';
import { ROLE_WRITES } from './roles-api';

interface NewRole {
  name: string;
  templateKey: RoleKey;
  description: string;
}

/**
 * Start a custom role from a system template.
 *
 * The phone creates the role with the template's permissions and opens it, where the matrix is
 * tuned — rather than squeezing the whole matrix into a sheet as the web's dialog does. The
 * permissions are left to the API, which copies the template's and caps them at the creator's own,
 * so a template broader than the creator never fails the whole request. Only a Super Admin may
 * start from Super Admin, as the API rules.
 */
export function NewRoleSheet({
  organizationId,
  onClose,
  onCreated,
}: {
  organizationId: string | undefined;
  onClose: () => void;
  onCreated: (role: CustomRoleDetail) => void;
}) {
  const { user } = useSession();
  const [form, setForm] = useState<NewRole>({
    name: '',
    templateKey: ROLE_KEYS.DEVELOPER,
    description: '',
  });
  const templates = useMemo<SelectOption<RoleKey>[]>(
    () =>
      ALL_ROLE_KEYS.filter(
        (key) => key !== ROLE_KEYS.SUPER_ADMIN || user?.roleKey === ROLE_KEYS.SUPER_ADMIN,
      ).map((key) => ({
        value: key,
        label: ROLE_LABELS[key],
        description: isClientRole(key) ? 'For client companies' : 'For your team',
        icon: 'shield-outline',
        iconTone: isClientRole(key) ? 'teal' : 'primary',
      })),
    [user?.roleKey],
  );
  const create = useAdminMutation<{ values: NewRole; headers: ReauthHeaders }, CustomRoleDetail>({
    path: () => '/roles',
    body: ({ values }) => ({
      name: values.name.trim(),
      templateKey: values.templateKey,
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      ...(organizationId ? { organizationId } : {}),
    }),
    headers: ({ headers }) => headers,
    invalidate: ROLE_WRITES,
    onSuccess: (role) => onCreated(role),
  });
  const patch = (change: Partial<NewRole>) => {
    create.reset();
    setForm((current) => ({ ...current, ...change }));
  };

  return (
    <ReauthSheet
      visible
      title="New custom role"
      confirmLabel="Create role"
      confirmIcon="add"
      canConfirm={form.name.trim().length >= 2}
      busy={create.busy}
      error={create.error}
      onClose={onClose}
      onConfirm={(headers) => create.run({ values: form, headers })}
    >
      <Field label="Name" required hint="At least two characters.">
        <Input
          accessibilityLabel="Role name"
          value={form.name}
          onChangeText={(name) => patch({ name })}
          autoCapitalize="words"
        />
      </Field>
      <SelectField
        label="Start from"
        icon="copy-outline"
        options={templates}
        value={[form.templateKey]}
        onChange={(values) => (values[0] ? patch({ templateKey: values[0] }) : undefined)}
        hint="Copies that role’s permissions. Fixed once created."
        required
      />
      <Field label="Description">
        <Input
          accessibilityLabel="Role description"
          value={form.description}
          onChangeText={(description) => patch({ description })}
          multiline
          style={{ minHeight: 64 }}
        />
      </Field>
      <AppText size="sm" tone="muted">
        A custom role can never hold more than you do. Fine-tune its permissions on the next screen.
      </AppText>
    </ReauthSheet>
  );
}
