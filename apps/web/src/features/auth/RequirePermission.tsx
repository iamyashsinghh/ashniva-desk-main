import type { PermissionKey } from '@ashniva/types';
import { EmptyState } from '@ashniva/ui';
import { Outlet } from 'react-router';

import { usePermission } from './session-context';

/**
 * A route branch only people holding a permission may open.
 *
 * The portal registered its approvals, sign-off and reports screens for every client account,
 * although `CLIENT_EMPLOYEE` holds none of `approval:decide`, `uat:decide` or `report:read-own`.
 * The screens loaded, every request came back 403, and the person was left reading an error on a
 * page they were invited onto. This says so instead.
 *
 * Presentation only, as ever: the API refuses the same calls whatever this renders. Its job is to
 * keep somebody from walking into a wall, not to be the wall.
 */
export function RequirePermission({
  permission,
  title,
  description,
}: {
  permission: PermissionKey;
  title: string;
  description: string;
}) {
  const allowed = usePermission(permission);
  if (!allowed) {
    return <EmptyState title={title} description={description} />;
  }
  return <Outlet />;
}
