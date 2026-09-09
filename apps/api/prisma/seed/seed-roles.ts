import {
  ALL_ROLE_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';

import type { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Creates the system roles (organizationId = NULL) and resets their permissions to the defaults
 * from packages/types. Custom, per-organization roles are never touched.
 *
 * **Development only.** The reset below is a delete followed by an insert: whatever a system role
 * held is discarded and the defaults are written back. That is the right behaviour for a demo
 * database and the wrong behaviour for a live one, so it is not how a deployment activates a
 * permission. `prisma/migrations/20260906200000_phase3_permissions/migration.sql` does that
 * additively, and `test/permission-rollout.e2e-spec.ts` proves it. Nothing in production needs
 * this file to have run.
 */
export async function seedRoles(
  prisma: PrismaClient,
  permissionsByKey: Map<PermissionKey, string>,
): Promise<Map<RoleKey, string>> {
  const rolesByKey = new Map<RoleKey, string>();

  for (const roleKey of ALL_ROLE_KEYS) {
    const existing = await prisma.role.findFirst({ where: { organizationId: null, key: roleKey } });
    const role = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { name: ROLE_LABELS[roleKey], isSystem: true },
        })
      : await prisma.role.create({
          data: { key: roleKey, name: ROLE_LABELS[roleKey], isSystem: true },
        });

    const permissionIds = DEFAULT_ROLE_PERMISSIONS[roleKey].map((permissionKey) => {
      const permissionId = permissionsByKey.get(permissionKey);
      if (!permissionId) {
        throw new Error(`Permission ${permissionKey} was not seeded`);
      }
      return permissionId;
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    });

    rolesByKey.set(roleKey, role.id);
  }

  console.warn(`System roles: ${rolesByKey.size}`);
  return rolesByKey;
}
