import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/** Membership with role and permissions — exactly what the JWT guard needs. */
export type MembershipWithPermissions = NonNullable<
  Awaited<ReturnType<OrganizationMembershipsRepository['findActiveMembership']>>
>;

@Injectable()
export class OrganizationMembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveMembership(userId: string, organizationId: string) {
    return this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
        organization: { deletedAt: null },
        // Every other soft-deletable thing on this path is already excluded, and the role is what
        // the permissions come from. Unreachable today — deleting a role with members is refused
        // — but if that ever slips, a deleted role must stop authorizing requests rather than
        // keep answering with the permission set it had when it was withdrawn.
        role: { deletedAt: null },
      },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        user: { select: { id: true, email: true, name: true } },
        organization: { select: { id: true, name: true, slug: true, isServiceProvider: true } },
      },
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { userId, deletedAt: null, organization: { deletedAt: null } },
      include: { organization: true, role: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
