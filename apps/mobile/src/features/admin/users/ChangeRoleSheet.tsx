import type { UserSummary } from '@ashniva/types';
import { useState } from 'react';

import { AppText } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { useAdminMutation, type ReauthHeaders } from '../shared/admin-api';
import { ReauthSheet } from '../shared/ReauthSheet';
import { roleLabel } from './user-display';
import { currentRoleChoice, roleBody, useRoleChoices } from './user-roles';
import { USER_WRITES } from './users-api';

/**
 * Changing somebody's role is a permission change, so it is confirmed with the password and
 * audited (`POST /users/:id/role`). The choice and the password are in the one sheet.
 */
export function ChangeRoleSheet({
  person,
  organizationId,
  targetIsServiceProvider,
  onClose,
}: {
  person: UserSummary;
  organizationId: string | undefined;
  targetIsServiceProvider: boolean;
  onClose: () => void;
}) {
  const { options, loading } = useRoleChoices(organizationId, targetIsServiceProvider);
  const current = currentRoleChoice(person);
  const [choice, setChoice] = useState(current);
  const change = useAdminMutation<{ choice: string; headers: ReauthHeaders }, UserSummary>({
    path: () => `/users/${person.id}/role`,
    body: (variables) => ({
      ...(organizationId ? { organizationId } : {}),
      ...roleBody(variables.choice),
    }),
    headers: (variables) => variables.headers,
    invalidate: [...USER_WRITES, ['roles']],
    onSuccess: () => onClose(),
  });

  return (
    <ReauthSheet
      visible
      title={`Change role for ${person.name}`}
      subtitle={`Now: ${roleLabel(person)}`}
      confirmLabel="Confirm change"
      canConfirm={choice !== current}
      busy={change.busy}
      error={change.error}
      onClose={onClose}
      onConfirm={(headers) => change.run({ choice, headers })}
    >
      <SelectField
        label="New role"
        icon="shield-outline"
        options={options}
        value={[choice]}
        onChange={(values) => {
          change.reset();
          setChoice(values[0] ?? current);
        }}
        loading={loading}
        required
      />
      <AppText size="sm" tone="muted">
        Their permissions change the moment you confirm. The change is recorded in the audit
        history.
      </AppText>
    </ReauthSheet>
  );
}
