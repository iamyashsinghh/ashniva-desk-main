import { PERMISSIONS } from '@ashniva/types';

import { useSession } from '../../auth/SessionProvider';
import { DetailPending, NotAllowed } from '../shared/AdminStates';
import { RoleEditor } from './RoleEditor';
import { usePermissionCatalog, useRole } from './roles-api';

/**
 * One role and its permission matrix.
 *
 * The editor is keyed on the role's `updatedAt`, so after a save — or somebody else's, arriving
 * on a refresh — the draft starts again from what the server now holds instead of showing stale
 * switches as unsaved changes.
 */
export function RoleDetailScreen({
  roleId,
  organizationId,
  onDeleted,
}: {
  roleId: string;
  /** The company, when it is not the signed-in person's own. */
  organizationId?: string;
  onDeleted: () => void;
}) {
  const { can } = useSession();
  const allowed = can(PERMISSIONS.ROLE_MANAGE);
  const role = useRole(roleId, organizationId, allowed);
  const catalog = usePermissionCatalog(allowed);

  if (!allowed) {
    return (
      <NotAllowed message="Roles are managed by people with the role management permission." />
    );
  }
  if (!role.data || !catalog.data) {
    return (
      <DetailPending
        error={role.error ?? catalog.error}
        onRetry={() => {
          void role.refetch();
          void catalog.refetch();
        }}
        label="Loading the role"
      />
    );
  }
  return (
    <RoleEditor
      key={role.data.updatedAt}
      role={role.data}
      catalog={catalog.data}
      refreshing={role.isRefetching}
      onRefresh={() => role.refetch()}
      onDeleted={onDeleted}
    />
  );
}
