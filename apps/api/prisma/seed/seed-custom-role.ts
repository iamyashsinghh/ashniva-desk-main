import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';

import type { PrismaClient } from '../../src/generated/prisma/client';
import type { SeededOrganizations } from './seed-organizations';

/**
 * A narrowed custom role: a support person who may read and reply on tickets but may never see
 * costs, manage contracts or decide approvals. Used in the permission walkthroughs.
 */
const READ_ONLY_SUPPORT: readonly PermissionKey[] = [
  PERMISSIONS.TICKET_READ,
  PERMISSIONS.TICKET_REPLY_PUBLIC,
  PERMISSIONS.TASK_READ,
  PERMISSIONS.PROJECT_READ,
  PERMISSIONS.CONTRACT_READ,
  PERMISSIONS.CHANGE_REQUEST_READ,
  PERMISSIONS.COMMENT_INTERNAL,
  PERMISSIONS.REPORT_READ_OWN,
];

export async function seedCustomRole(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  permissionsByKey: Map<PermissionKey, string>,
): Promise<void> {
  const organizationId = organizations.serviceProvider.id;
  const key = 'support-desk-read-only';
  const data = {
    organizationId,
    key,
    name: 'Support desk (read-only)',
    description: 'Reads tickets and replies to clients; no costs, contracts or approvals.',
    isSystem: false,
    templateKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
    audience: 'INTERNAL' as const,
  };
  const existing = await prisma.role.findFirst({ where: { organizationId, key } });
  const role = existing
    ? await prisma.role.update({ where: { id: existing.id }, data })
    : await prisma.role.create({ data });

  const permissionIds = READ_ONLY_SUPPORT.map((permissionKey) => {
    const id = permissionsByKey.get(permissionKey);
    if (!id) {
      throw new Error(`Permission ${permissionKey} was not seeded`);
    }
    return id;
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
  });
  console.warn(`Custom roles: 1 (${role.name})`);
}
