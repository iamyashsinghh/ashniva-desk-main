import { ALL_PERMISSION_KEYS, PERMISSION_DESCRIPTIONS, type PermissionKey } from '@ashniva/types';

import type { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Upserts every permission key from packages/types. Returns a map key → permission id.
 *
 * The rows themselves already exist by the time this runs: they are inserted by
 * `prisma/migrations/20260906200000_phase3_permissions/migration.sql`, so a deployment never
 * depends on the seed. This stays because the seed needs the ids, and because it is the thing a
 * developer runs after adding a key but before generating its migration.
 */
export async function seedPermissions(prisma: PrismaClient): Promise<Map<PermissionKey, string>> {
  const permissionsByKey = new Map<PermissionKey, string>();

  for (const key of ALL_PERMISSION_KEYS) {
    const description = PERMISSION_DESCRIPTIONS[key];
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
    permissionsByKey.set(key, permission.id);
  }

  console.warn(`Permissions: ${permissionsByKey.size}`);
  return permissionsByKey;
}
