import { ROLE_KEYS } from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';

/** People who are given tasks. Custom roles are matched through the template they were cut from. */
const WORKING_ROLE_KEYS: string[] = [
  ROLE_KEYS.DEVELOPER,
  ROLE_KEYS.TESTER,
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.SUPPORT_EXECUTIVE,
];

export interface OperationsMember {
  userId: string;
  title: string | null;
  user: { id: string; name: string; email: string };
}

/**
 * The people the Team and Availability sections both cover, read once.
 *
 * Both sections are permission-gated separately and either can be absent, but when both are
 * present they must describe the same people — and asking twice would be one query wasted on
 * every load for the pleasure of letting them disagree.
 *
 * `memberIds` narrows to a lead's teams; `undefined` means everyone in the organization.
 */
export function loadOperationsMembers(
  prisma: PrismaService,
  organizationId: string,
  memberIds: string[] | undefined,
): Promise<OperationsMember[]> {
  return prisma.organizationMembership.findMany({
    where: {
      organizationId,
      deletedAt: null,
      user: { deletedAt: null, status: 'ACTIVE' },
      ...(memberIds ? { userId: { in: memberIds } } : {}),
      // Matched on the template as well as the key, so a custom role cut from DEVELOPER is still
      // somebody who does development work rather than somebody the team view forgets.
      role: {
        OR: [{ key: { in: WORKING_ROLE_KEYS } }, { templateKey: { in: WORKING_ROLE_KEYS } }],
      },
    },
    select: {
      userId: true,
      title: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: 'asc' } },
  });
}
