import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@ashniva/types';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';
export const REQUIRED_ANY_PERMISSIONS_KEY = 'requiredAnyPermissions';

/**
 * Declares the permissions a route needs. All listed permissions are required.
 * Ownership/team scope checks still happen in the service.
 *
 * @example @RequirePermissions(PERMISSIONS.TASK_ASSIGN)
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/**
 * Declares that holding any one of these permissions is enough.
 *
 * For the routes two different jobs both legitimately reach — a QA assignment is filed by whoever
 * holds `qa:assign` and worked by whoever holds `qa:record-result`, and neither role holds the
 * other's key, so requiring both locked each of them out of a screen they need. Reserve it for
 * reads and for actions where the union really is intended; the default remains "all of these",
 * because an accidental `any` widens a route silently.
 *
 * @example @RequireAnyPermission(PERMISSIONS.QA_RECORD_RESULT, PERMISSIONS.QA_ASSIGN)
 */
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);
